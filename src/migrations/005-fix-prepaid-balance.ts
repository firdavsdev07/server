/**
 * Migration 005: Fix prepaidBalance for existing contracts
 * 
 * Muammo:
 *   Excel import'dan keyin prepaidBalance yangilanmagan
 *   Ortiqcha to'lovlar contract.prepaidBalance ga qo'shilmagan
 * 
 * Yechim:
 *   1. Barcha to'lovlarni hisoblash
 *   2. Ortiqcha to'lovlarni aniqlash
 *   3. prepaidBalance ga qo'shish
 */

import mongoose from "mongoose";
import Contract from "../schemas/contract.schema";
import Payment, { PaymentStatus } from "../schemas/payment.schema";
import logger from "../utils/logger";

export async function up() {
  logger.info("🔄 Migration 005: Fixing prepaidBalance for contracts...");

  try {
    // Barcha ACTIVE/COMPLETED shartnomalarni olish
    const contracts = await Contract.find({
      status: { $in: ["active", "completed"] },
    }).populate("payments");

    logger.info(`📊 Found ${contracts.length} contracts to process`);

    let updatedCount = 0;
    let totalPrepaidAdded = 0;

    for (const contract of contracts) {
      // Barcha to'lovlarni olish
      const payments = await Payment.find({
        _id: { $in: contract.payments },
      });

      // Jami to'langan summani hisoblash
      let totalPaid = 0;
      let totalExcess = 0;

      for (const payment of payments) {
        if (payment.isPaid && payment.status === PaymentStatus.PAID) {
          totalPaid += payment.actualAmount || payment.amount;
        }

        // Ortiqcha to'lovlarni hisoblash
        if (payment.status === PaymentStatus.OVERPAID && payment.expectedAmount) {
          const excess =
            (payment.actualAmount || payment.amount) - payment.expectedAmount;
          if (excess > 0) {
            totalExcess += excess;
          }
        }
      }

      // Expected total (umumiy narx)
      const expectedTotal = contract.totalPrice;

      // Ortiqcha to'lov
      const excessAmount = totalPaid - expectedTotal;

      // Agar ortiqcha to'lov bor va prepaidBalance 0 bo'lsa
      if (excessAmount > 0.01 && (contract.prepaidBalance || 0) < 0.01) {
        // prepaidBalance yangilash
        contract.prepaidBalance = excessAmount;
        await contract.save();

        logger.info(
          `✅ Contract ${contract._id}: prepaidBalance updated to ${excessAmount.toFixed(2)}$`
        );
        logger.info(
          `   Customer: ${contract.customer}, Product: ${contract.productName}`
        );
        logger.info(
          `   Total paid: ${totalPaid.toFixed(2)}$, Expected: ${expectedTotal.toFixed(2)}$`
        );

        updatedCount++;
        totalPrepaidAdded += excessAmount;
      }
    }

    logger.info(`\n✅ Migration 005 completed!`);
    logger.info(`   Updated contracts: ${updatedCount}`);
    logger.info(
      `   Total prepaid balance added: ${totalPrepaidAdded.toFixed(2)}$`
    );
  } catch (error) {
    logger.error("❌ Migration 005 failed:", error);
    throw error;
  }
}

export async function down() {
  logger.info("🔄 Rollback Migration 005: Removing prepaidBalance...");

  try {
    // Barcha contract'larning prepaidBalance'ni 0 ga o'rnatish
    const result = await Contract.updateMany(
      {},
      { $set: { prepaidBalance: 0 } }
    );

    logger.info(`✅ Rollback completed! Reset ${result.modifiedCount} contracts`);
  } catch (error) {
    logger.error("❌ Rollback failed:", error);
    throw error;
  }
}
