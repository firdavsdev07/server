/**
 * Reminder Cleanup Service
 * 
 * Muddati o'tgan eslatma notification'larni tozalash
 * Cron job orqali har kuni ishga tushadi
 */

import Payment, { PaymentStatus } from "../schemas/payment.schema";
import logger from "../utils/logger";

class ReminderCleanupService {
  /**
   * Muddati o'tgan eslatma notification'larni o'chirish
   * Har kuni soat 00:00 da ishga tushadi
   */
  async cleanupExpiredReminders() {
    try {
      logger.info("🧹 === CLEANUP EXPIRED REMINDERS START ===");
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Muddati o'tgan eslatmalarni topish
      const expiredReminders = await Payment.find({
        isReminderNotification: true,
        date: { $lt: today }, // Muddati o'tgan
        isPaid: false,
        status: PaymentStatus.PENDING,
      });
      
      logger.info(`📊 Found ${expiredReminders.length} expired reminder notification(s)`);
      
      if (expiredReminders.length === 0) {
        logger.info("✅ No expired reminders to cleanup");
        return {
          success: true,
          deletedCount: 0,
          message: "Muddati o'tgan eslatmalar topilmadi",
        };
      }
      
      // Eslatmalarni o'chirish
      const result = await Payment.deleteMany({
        isReminderNotification: true,
        date: { $lt: today },
        isPaid: false,
        status: PaymentStatus.PENDING,
      });
      
      logger.info(`✅ Deleted ${result.deletedCount} expired reminder notification(s)`);
      logger.info("🧹 === CLEANUP EXPIRED REMINDERS END ===");
      
      return {
        success: true,
        deletedCount: result.deletedCount,
        message: `${result.deletedCount} ta muddati o'tgan eslatma o'chirildi`,
      };
    } catch (error) {
      logger.error("❌ Error cleaning up expired reminders:", error);
      throw error;
    }
  }

  /**
   * Statistika - nechta eslatma muddati o'tgan
   */
  async getExpiredRemindersStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const expiredCount = await Payment.countDocuments({
        isReminderNotification: true,
        date: { $lt: today },
        isPaid: false,
        status: PaymentStatus.PENDING,
      });
      
      const activeCount = await Payment.countDocuments({
        isReminderNotification: true,
        date: { $gte: today },
        isPaid: false,
        status: PaymentStatus.PENDING,
      });
      
      return {
        expired: expiredCount,
        active: activeCount,
        total: expiredCount + activeCount,
      };
    } catch (error) {
      logger.error("❌ Error getting reminder stats:", error);
      throw error;
    }
  }
}

export default new ReminderCleanupService();
