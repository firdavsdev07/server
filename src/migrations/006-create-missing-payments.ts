/**
 * Migration 006: Create missing monthly payments for all contracts
 * 
 * MUAMMO: Ba'zi shartnomalar uchun barcha oylik to'lovlar yaratilmagan
 * YECHIM: Har bir shartnoma uchun `period` ga ko'ra barcha to'lovlarni yaratish
 */

import mongoose from "mongoose";
import Contract, { ContractStatus } from "../schemas/contract.schema";
import Payment, { PaymentType, PaymentStatus } from "../schemas/payment.schema";
import Notes from "../schemas/notes.schema";
import logger from "../utils/logger";

export async function up() {
  try {
    logger.info("🚀 === MIGRATION 006: Creating missing payments ===");

    // Barcha aktiv shartnomalarni topish
    const contracts = await Contract.find({
      isActive: true,
      isDeleted: false,
      status: ContractStatus.ACTIVE,
    }).populate("payments");

    logger.info(`📋 Found ${contracts.length} active contracts`);

    let totalCreated = 0;
    let contractsFixed = 0;

    for (const contract of contracts) {
      // Mavjud oylik to'lovlar sonini hisoblash
      const existingPayments = await Payment.find({
        _id: { $in: contract.payments || [] },
        paymentType: PaymentType.MONTHLY,
      }).sort({ date: 1 });

      const expectedMonthlyPayments = contract.period; // 12 oy
      const actualMonthlyPayments = existingPayments.length;

      if (actualMonthlyPayments >= expectedMonthlyPayments) {
        // To'lovlar to'liq
        continue;
      }

      logger.info(
        `📄 Contract ${contract._id}: ${actualMonthlyPayments}/${expectedMonthlyPayments} payments`
      );

      // Qolgan to'lovlarni yaratish
      const missingPaymentsCount = expectedMonthlyPayments - actualMonthlyPayments;
      const startDate = new Date(contract.startDate);
      const originalDay = contract.originalPaymentDay || startDate.getDate();

      for (let i = actualMonthlyPayments; i < expectedMonthlyPayments; i++) {
        const monthNumber = i + 1;
        
        // To'lov sanasini hisoblash
        const paymentDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + i,
          originalDay
        );

        // Notes yaratish
        const notes = await Notes.create({
          text: `${monthNumber}-oy to'lovi (migration tomonidan yaratildi)`,
          customer: contract.customer,
          createBy: contract.createBy,
        });

        // Payment yaratish
        const payment = await Payment.create({
          amount: contract.monthlyPayment,
          actualAmount: 0,
          date: paymentDate,
          isPaid: false,
          paymentType: PaymentType.MONTHLY,
          customerId: contract.customer,
          managerId: contract.createBy,
          notes: notes._id,
          status: PaymentStatus.PENDING,
          expectedAmount: contract.monthlyPayment,
          remainingAmount: contract.monthlyPayment,
          excessAmount: 0,
          targetMonth: monthNumber,
        });

        // Contract.payments ga qo'shish
        if (!contract.payments) {
          contract.payments = [];
        }
        (contract.payments as any[]).push(payment._id);

        totalCreated++;
        logger.debug(
          `  ✅ Created payment for month ${monthNumber} (${paymentDate.toISOString().split("T")[0]})`
        );
      }

      // Contract'ni saqlash
      await contract.save();
      contractsFixed++;

      logger.info(
        `✅ Contract ${contract._id}: Created ${missingPaymentsCount} missing payments`
      );
    }

    logger.info(`🎉 Migration completed successfully!`);
    logger.info(`  - Contracts fixed: ${contractsFixed}`);
    logger.info(`  - Total payments created: ${totalCreated}`);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    throw error;
  }
}

export async function down() {
  try {
    logger.info("🔄 === ROLLING BACK MIGRATION 006 ===");
    
    // To'lovlarni o'chirish (migration tomonidan yaratilganlarni)
    const result = await Payment.deleteMany({
      isPaid: false,
      status: PaymentStatus.PENDING,
      actualAmount: 0,
    });

    logger.info(`✅ Rollback completed. Deleted ${result.deletedCount} payments`);
  } catch (error) {
    logger.error("❌ Rollback failed:", error);
    throw error;
  }
}
