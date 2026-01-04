import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import logger from "../utils/logger";
import { Telegraf } from "telegraf";
import excelExportService from "./excel-export.service";

class BackupService {
  private lastBackupHash: string | null = null;
  private telegramChannelId = process.env.TELEGRAM_CHAT_ID; // Backup kanal ID
  private backupBot: Telegraf | null = null;
  
  constructor() {
    // Backup bot'ni ishga tushirish (alohida bot)
    const backupBotToken = process.env.TELEGRAM_BOT_TOKEN;
    if (backupBotToken) {
      this.backupBot = new Telegraf(backupBotToken);
      logger.info("✅ Backup bot initialized");
    } else {
      logger.warn("⚠️ TELEGRAM_BOT_TOKEN not set for backup bot");
    }
  }

  /**
   * Excel database backup yaratish va Telegram'ga yuborish
   */
  async createBackup(): Promise<{ success: boolean; message: string; filePath?: string }> {
    try {
      logger.info("📊 Starting Excel database backup...");
      
      // 1. Excel export qilish
      const exportResult = await excelExportService.exportDatabase();
      
      if (!exportResult.success || !exportResult.filePath) {
        logger.error("❌ Excel export failed:", exportResult.message);
        return {
          success: false,
          message: exportResult.message,
        };
      }
      
      logger.info("✅ Excel export created successfully");
      
      const excelFilePath = exportResult.filePath;
      
      // 2. File hash'ini hisoblash (duplicate detection)
      const fileHash = await this.calculateFileHash(excelFilePath);
      
      // 3. Duplicate check: Agar hash bir xil bo'lsa, yubormaslik
      if (this.lastBackupHash === fileHash) {
        logger.info("⏭️ Backup unchanged (duplicate), skipping upload");
        fs.unlinkSync(excelFilePath);
        return {
          success: true,
          message: "Backup unchanged, skipped",
        };
      }
      
      // 4. Telegram kanalga yuborish
      if (this.telegramChannelId) {
        await this.sendToTelegram(excelFilePath);
        this.lastBackupHash = fileHash;
        
        // ✅ Telegram'ga yuborilgandan keyin faylni o'chirish
        try {
          if (fs.existsSync(excelFilePath)) {
            fs.unlinkSync(excelFilePath);
            logger.debug("🗑️ Excel backup file deleted after upload:", path.basename(excelFilePath));
          }
        } catch (deleteError: any) {
          logger.warn("⚠️ Failed to delete backup file:", deleteError.message);
        }
      } else {
        logger.warn("⚠️ TELEGRAM_CHAT_ID not set, backup saved locally only");
      }
      
      // 5. Eski export'larni tozalash (agar Telegram'ga yuborilmasa, local'da saqlanadi)
      if (this.telegramChannelId) {
        // Telegram'ga yuborilsa, barcha eski fayllarni o'chirish
        await this.cleanAllExports();
      } else {
        // Telegram'ga yuborilmasa, faqat oxirgi 5 tasini saqlash
        await excelExportService.cleanOldExports();
      }
      
      return {
        success: true,
        message: "Excel backup completed successfully",
        filePath: excelFilePath,
      };
    } catch (error: any) {
      logger.error("❌ Excel backup failed:", error.message);
      return {
        success: false,
        message: `Backup failed: ${error.message}`,
      };
    }
  }

  /**
   * File hash'ini hisoblash (duplicate detection uchun)
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("md5");
      const stream = fs.createReadStream(filePath);
      
      stream.on("data", (chunk: string | Buffer) => {
        hash.update(chunk);
      });
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Backup'ni Telegram kanalga yuborish
   */
  private async sendToTelegram(filePath: string): Promise<void> {
    try {
      if (!this.telegramChannelId) {
        throw new Error("TELEGRAM_CHAT_ID not configured");
      }
      
      if (!this.backupBot) {
        throw new Error("Backup bot not initialized (TELEGRAM_BOT_TOKEN missing)");
      }

      const stats = fs.statSync(filePath);
      const fileSizeKB = (stats.size / 1024).toFixed(0);
      
      const now = new Date();
      const date = now.toLocaleDateString('uz-UZ'); // 04.01.2026
      const time = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }); // 17:30
      
      const caption = `📊 Excel Backup\n\n` +
                     `📅 ${date}\n` +
                     `🕐 ${time}\n` +
                     `📦 ${fileSizeKB}KB\n\n` +
                     `✅ Import qilishga tayyor`;
      
      logger.info(`📤 Sending backup to Telegram channel: ${this.telegramChannelId}...`);
      
      await this.backupBot.telegram.sendDocument(
        this.telegramChannelId,
        {
          source: filePath,
          filename: path.basename(filePath),
        },
        {
          caption,
        }
      );
      
      logger.info("✅ Backup sent to Telegram successfully");
    } catch (error: any) {
      logger.error("❌ Failed to send backup to Telegram:", error.message);
      throw error;
    }
  }

  /**
   * Barcha eski export fayllarni o'chirish (Telegram'ga yuborilgandan keyin)
   */
  private async cleanAllExports(): Promise<void> {
    try {
      const exportDir = path.join(process.cwd(), "exports");
      
      if (!fs.existsSync(exportDir)) {
        return;
      }
      
      const files = fs.readdirSync(exportDir)
        .filter(file => file.endsWith(".xlsx"))
        .map(file => path.join(exportDir, file));
      
      for (const file of files) {
        try {
          fs.unlinkSync(file);
        } catch (err) {
          // Ignore errors
        }
      }
      
      if (files.length > 0) {
        logger.debug(`🧹 Cleaned all ${files.length} backup file(s) from exports/`);
      }
    } catch (error: any) {
      logger.error("❌ Failed to clean exports:", error.message);
    }
  }

  /**
   * Scheduled Excel backup (har 1 daqiqada - TEST)
   */
  startScheduledBackup(): void {
    logger.info("🕒 Starting scheduled Excel backup (every 1 minute - TEST MODE)...");
    
    // Dastlabki backup (10 soniyadan keyin)
    setTimeout(() => {
      this.createBackup();
    }, 10000);
    
    // Har 1 daqiqada backup
    setInterval(() => {
      this.createBackup();
    }, 1 * 60 * 1000); // 1 daqiqa
    
    logger.info("✅ Excel backup service started (1 min interval - TEST MODE)");
  }
}

export default new BackupService();
