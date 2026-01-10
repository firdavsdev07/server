import Payment from "../schemas/payment.schema";
import logger from "./logger";

/**
 * Mavjud to'lovlar uchun paymentId qo'shish
 * Server ishga tushganda avtomatik ishlaydi
 */
export async function ensurePaymentIds(): Promise<void> {
  try {
    const payments = await Payment.find({ 
      $or: [
        { paymentId: { $exists: false } },
        { paymentId: null }
      ]
    }).sort({ createdAt: 1 });

    if (payments.length === 0) {
      return;
    }

    logger.info(`📝 Adding paymentId to ${payments.length} payments...`);

    for (const payment of payments) {
      await payment.save(); // pre-save hook avtomatik paymentId qo'shadi
    }

    logger.info(`✅ Added paymentId to ${payments.length} payments`);
  } catch (error) {
    logger.error("❌ Error ensuring payment IDs:", error);
  }
}
