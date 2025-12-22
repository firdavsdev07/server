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
import logger from "./utils/logger";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    await seedRoles();
    await createCurrencyCourse();
    await createSuperAdmin();

    app.listen(PORT, () => {
      logger.debug(`Server is running on port ${PORT}`);
    });

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

    if (shouldStartBot && botHostUrl) {
      logger.debug("Setting up Telegram webhook...");
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });

        // Set new webhook
        const webhookUrl = `${botHostUrl}/telegram-webhook`;
        await bot.telegram.setWebhook(webhookUrl, {
          drop_pending_updates: true,
        });

        const webhookInfo = await bot.telegram.getWebhookInfo();
        logger.debug(
          `Webhook status: ${webhookInfo.url ? "Active" : "Inactive"}`
        );
      } catch (botError: any) {
        logger.error("ebhook setup failed:", botError.message);
      }
    } else if (hasToken && enableBot === "false") {
      logger.debug("Bot disabled by ENABLE_BOT=false");
    } else {
      logger.debug(
        "Bot token or BOT_HOST_URL not found, skipping bot initialization"
      );
    }
  } catch (err) {
    logger.error("Application start error:", err);
    process.exit(1);
  }
};
startApplication();
