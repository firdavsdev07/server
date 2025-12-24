/**
 * Migration: Add reminderDate field to Payment schema
 * 
 * Ushbu migratsiya Payment schema'ga reminderDate field qo'shadi.
 * Bu field manager'larga o'zlari uchun eslatma sanasini belgilash imkonini beradi.
 * Bu asl payment date'ni o'zgartirmaydi, faqat manager uchun reminder sifatida ishlaydi.
 */

import Payment from "../schemas/payment.schema";
import logger from "../utils/logger";

export async function up() {
  try {
    logger.info("🔄 Running migration: 008-add-reminder-date");

    // reminderDate field allaqachon schema'da bor, 
    // lekin eski payment'larga default null qo'yish kerak
    
    const result = await Payment.updateMany(
      { reminderDate: { $exists: false } },
      { $set: { reminderDate: null } }
    );

    logger.info(`✅ Migration completed: ${result.modifiedCount} payments updated`);
    logger.info("✅ reminderDate field added to all payments");
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    throw error;
  }
}

export async function down() {
  try {
    logger.info("🔄 Rolling back migration: 008-add-reminder-date");

    // reminderDate field'ni o'chirish
    await Payment.updateMany(
      {},
      { $unset: { reminderDate: "" } }
    );

    logger.info("✅ Rollback completed: reminderDate field removed");
  } catch (error) {
    logger.error("❌ Rollback failed:", error);
    throw error;
  }
}
