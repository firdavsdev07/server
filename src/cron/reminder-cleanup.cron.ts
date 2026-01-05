/**
 * Reminder Cleanup Cron Job
 * 
 * Har kuni soat 00:00 da muddati o'tgan eslatmalarni tozalaydi
 */

import reminderCleanupService from "../services/reminder-cleanup.service";
import logger from "../utils/logger";

/**
 * Har kuni soat 00:00 da ishga tushadigan cron job
 * Node.js setInterval bilan ishlaydi (production uchun node-cron yoki bull queue tavsiya etiladi)
 */
export function startReminderCleanupCron() {
  logger.info("🔄 Starting reminder cleanup cron job...");
  
  // Dastlab bir marta ishga tushirish (server start bo'lganda)
  setTimeout(async () => {
    try {
      await reminderCleanupService.cleanupExpiredReminders();
    } catch (error) {
      logger.error("❌ Error in initial reminder cleanup:", error);
    }
  }, 5000); // 5 soniya kutamiz (server to'liq ishga tushishi uchun)
  
  // Har 24 soatda bir marta ishga tushirish (86400000 ms = 24 soat)
  setInterval(async () => {
    try {
      logger.info("⏰ Running scheduled reminder cleanup...");
      await reminderCleanupService.cleanupExpiredReminders();
    } catch (error) {
      logger.error("❌ Error in scheduled reminder cleanup:", error);
    }
  }, 24 * 60 * 60 * 1000); // 24 soat
  
  logger.info("✅ Reminder cleanup cron job started successfully");
}
