import Payment from "../schemas/payment.schema";
import logger from "../utils/logger";

export async function up() {
  logger.info("Migration 014: Adding paymentId to existing payments...");

  const payments = await Payment.find({ paymentId: { $exists: false } }).sort({ createdAt: 1 });

  let counter = 1;
  const lastPayment = await Payment.findOne({ paymentId: { $exists: true } })
    .sort({ paymentId: -1 })
    .select("paymentId");

  if (lastPayment?.paymentId) {
    counter = parseInt(lastPayment.paymentId.slice(1)) + 1;
  }

  for (const payment of payments) {
    const paymentId = `T${counter.toString().padStart(4, "0")}`;
    await Payment.updateOne({ _id: payment._id }, { $set: { paymentId } });
    counter++;
  }

  logger.info(`Migration 014: Added paymentId to ${payments.length} payments`);
}

export async function down() {
  logger.info("Migration 014: Removing paymentId from payments...");
  await Payment.updateMany({}, { $unset: { paymentId: "" } });
  logger.info("Migration 014: Removed paymentId from all payments");
}
