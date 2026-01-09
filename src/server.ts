import "reflect-metadata";
import app from "./app";
import connectDB from "./config/db";
import createSuperAdmin from "./utils/createSuperAdmin";
import seedRoles from "./utils/createRole";
import startBot from "./bot/startBot";
import bot from "./bot/main";
import createCurrencyCourse from "./utils/createCurrencyCourse";
import debtorService from "./dashboard/services/debtor.service";
import { checkAllContractsStatus } from "./utils/checkAllContractsStatus";
import notificationService from "./services/notification.service";
import backupService from "./services/backup.service";
import logger from "./utils/logger";
import { startReminderCleanupCron } from "./cron/reminder-cleanup.cron";
import { assignMissingIds } from "./utils/assign-missing-ids";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    await seedRoles();
    await createCurrencyCourse();
    await createSuperAdmin();
    await assignMissingIds(); // Avtomatik ID berish

    app.listen(PORT, () => {
      logger.debug(`Server is running on port ${PORT}`);
    });

    // ✅ MongoDB backup service'ni ishga tushirish
    backupService.startScheduledBackup();

    // ✅ YANGI: Muddati o'tgan eslatmalarni tozalash cron job
    startReminderCleanupCron();

    setInterval(async () => {
      try {
        await debtorService.createOverdueDebtors();
      } catch (error) {
        logger.error("Error in automatic debtor creation:", error);
      }
    }, 24 * 60 * 60 * 1000); // 24 soat

    setInterval(async () => {
      try {
        logger.info("🕐 Running scheduled task: Check expired PENDING payments");
        const paymentService = (await import("./dashboard/services/payment.service")).default;
        await paymentService.checkAndRejectExpiredPayments();
      } catch (error) {
        logger.error("Error in automatic PENDING payment rejection:", error);
      }
    }, 60 * 60 * 1000); // 1 soat

    // ❌ NOTIFICATION O'CHIRILDI: Faqat eslatma vaqti saqlash kerak
    // setInterval(async () => {
    //   try {
    //     logger.info("🕒 Running scheduled task: Check postponed payment reminders");
    //     await notificationService.sendPostponeReminders();
    //   } catch (error) {
    //     logger.error("Error in postponed payment reminders:", error);
    //   }
    // }, 60 * 1000);

    setTimeout(async () => {
      try {
        await debtorService.createOverdueDebtors();
      } catch (error) {
        logger.error("Error in initial debtor creation:", error);
      }
    }, 5000);

    // 🔥 MANUAL TRIGGER - 30 soniyadan keyin qayta tekshirish
    setTimeout(async () => {
      try {
        logger.info("🔥 === MANUAL DEBTOR TRIGGER (DEBUG) ===");
        const result = await debtorService.createOverdueDebtors();
        logger.info("🔥 Manual trigger result:", result);
      } catch (error) {
        logger.error("Error in manual debtor trigger:", error);
      }
    }, 30000); // 30 soniya

    setTimeout(async () => {
      try {
        logger.debug("🔍 Starting contract status check...");
        await checkAllContractsStatus();
      } catch (error) {
        logger.error("Error in contract status check:", error);
      }
    }, 10000);

    // ✅ A6: Dastlabki PENDING to'lovlarni tekshirish (15 soniyadan keyin)
    setTimeout(async () => {
      try {
        logger.info("🕐 Initial check: Expired PENDING payments");
        const paymentService = (await import("./dashboard/services/payment.service")).default;
        await paymentService.checkAndRejectExpiredPayments();
      } catch (error) {
        logger.error("Error in initial PENDING payment check:", error);
      }
    }, 15000);

    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    logger.debug(`Dastur xotira iste'moli: ${Math.round(used * 100) / 100} MB`);
  } catch (error) {
    logger.error("Server start error:", error);
  }
};

const startApplication = async () => {
  try {
    await startServer();

    const enableBot = process.env.ENABLE_BOT;
    const hasToken = !!process.env.BOT_TOKEN;
    const botHostUrl = process.env.BOT_HOST_URL;

    logger.debug(` Bot configuration check:`);
    logger.debug(`   - Has token: ${hasToken}`);
    logger.debug(`   - Environment: ${process.env.NODE_ENV || "development"}`);
    logger.debug(`   - ENABLE_BOT: ${enableBot || "not set"}`);

    const shouldStartBot = hasToken && enableBot !== "false";
    const isProduction = process.env.NODE_ENV === "production";
    const isValidWebhookUrl = botHostUrl && botHostUrl.startsWith("https://");

    if (shouldStartBot) {
      if (isValidWebhookUrl) {
        // Production: Use webhook
        logger.debug("Setting up Telegram webhook...");
        try {
          await bot.telegram.deleteWebhook({ drop_pending_updates: true });

          const webhookUrl = `${botHostUrl}/telegram-webhook`;
          await bot.telegram.setWebhook(webhookUrl, {
            drop_pending_updates: true,
          });

          const webhookInfo = await bot.telegram.getWebhookInfo();
          logger.debug(
            `Webhook status: ${webhookInfo.url ? "Active" : "Inactive"}`
          );
          logger.debug(`Webhook URL: ${webhookInfo.url}`);
        } catch (botError: any) {
          logger.error("Webhook setup failed:", botError.message);
        }
      } else {
        // Development: Use long polling
        logger.debug("Starting bot in polling mode (development)...");
        try {
          await bot.telegram.deleteWebhook({ drop_pending_updates: true });

          // Start polling in background
          bot.launch({
            dropPendingUpdates: true,
          }).then(() => {
            logger.debug("🤖 Bot started successfully in polling mode");
          }).catch((err) => {
            logger.error("Bot polling failed:", err.message);
          });

          // Graceful stop
          process.once("SIGINT", () => bot.stop("SIGINT"));
          process.once("SIGTERM", () => bot.stop("SIGTERM"));

          logger.debug("🤖 Bot polling mode initialized");
        } catch (botError: any) {
          logger.error("Bot polling setup failed:", botError.message);
        }
      }
    } else if (hasToken && enableBot === "false") {
      logger.debug("Bot disabled by ENABLE_BOT=false");
    } else {
      logger.debug(
        "Bot token not found, skipping bot initialization"
      );
    }
  } catch (err) {
    logger.error("Application start error:", err);
    process.exit(1);
  }
};
startApplication();
