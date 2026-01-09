/**
 * Payment Base Service
 * 
 * Barcha payment service'lar uchun base class
 * Umumiy metodlar va helper'lar
 */

import { Balance } from "../../../schemas/balance.schema";
import Contract, { ContractStatus } from "../../../schemas/contract.schema";
import Payment, { PaymentStatus, PaymentType } from "../../../schemas/payment.schema";
import Notes from "../../../schemas/notes.schema";
import logger from "../../../utils/logger";
import IJwtUser from "../../../types/user";
import BaseError from "../../../utils/base.error";
import contractQueryService from "../contract/contract.query.service";
import { PAYMENT_CONSTANTS } from "../../../utils/helpers/payment";
import { generatePaymentId } from "../../../utils/id-generator";

export class PaymentBaseService {
  /**
   * Balance yangilash
   * Requirements: 2.2, 8.3
   */
  protected async updateBalance(
    managerId: string,
    changes: {
      dollar?: number;
      sum?: number;
    },
    session?: any
  ): Promise<any> {
    try {
      let balance = await Balance.findOne({ managerId }).session(session || null);

      if (!balance) {
        const newBalances = await Balance.create(
          [{
            managerId,
            dollar: changes.dollar || 0,
            sum: changes.sum || 0,
          }],
          { session: session || undefined }
        );
        balance = newBalances[0];
        logger.debug("✅ New balance created:", balance._id);
      } else {
        balance.dollar += changes.dollar || 0;
        if (balance.sum !== undefined && changes.sum !== undefined) {
          balance.sum += changes.sum;
        }
        await balance.save({ session: session || undefined });
        logger.debug("✅ Balance updated:", balance._id);
      }

      return balance;
    } catch (error) {
      logger.error("❌ Error updating balance:", error);
      throw error;
    }
  }

  /**
   * Ortiqcha to'lovni boshqarish
   * Keyingi oylar uchun avtomatik to'lovlar yaratish
   * 
   * Requirements: 8.5
   */
  protected async processExcessPayment(
    excessAmount: number,
    contract: any,
    payment: any,
    user: IJwtUser
  ): Promise<any[]> {
    const createdPayments: any[] = [];

    if (excessAmount <= PAYMENT_CONSTANTS.TOLERANCE) {
      return createdPayments;
    }

    logger.debug(`💰 Processing excess amount: ${excessAmount.toFixed(2)} $`);

    let remainingExcess = excessAmount;
    const monthlyPayment = contract.monthlyPayment;

    // Barcha to'lovlarni olish
    const allPayments = await Payment.find({
      _id: { $in: contract.payments },
    }).sort({ date: 1 });

    // To'langan oylik to'lovlar sonini hisoblash
    const paidMonthlyPayments = allPayments.filter(
      (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
    );
    let currentMonthIndex = paidMonthlyPayments.length;

    logger.debug(`📊 Current state:`, {
      totalPayments: allPayments.length,
      paidMonthlyPayments: paidMonthlyPayments.length,
      nextMonthIndex: currentMonthIndex + 1,
      contractPeriod: contract.period,
    });

    // Ortiqcha summani keyingi oylarga taqsimlash
    while (remainingExcess > PAYMENT_CONSTANTS.TOLERANCE && currentMonthIndex < contract.period) {
      const monthNumber = currentMonthIndex + 1;

      // Bu oy uchun to'lov summasi
      const paymentAmount = Math.min(remainingExcess, monthlyPayment);
      const shortageAmount =
        paymentAmount < monthlyPayment ? monthlyPayment - paymentAmount : 0;

      // Status aniqlash
      let paymentStatus: PaymentStatus;
      if (paymentAmount >= monthlyPayment - PAYMENT_CONSTANTS.TOLERANCE) {
        paymentStatus = PaymentStatus.PAID;
      } else {
        paymentStatus = PaymentStatus.UNDERPAID;
      }

      // Notes yaratish
      const notes = await Notes.create({
        text: `${monthNumber}-oy to'lovi (ortiqcha summadan): ${paymentAmount.toFixed(2)} $${shortageAmount > 0 ? `\n⚠️ ${shortageAmount.toFixed(2)} $ kam to'landi` : ""
          }`,
        customer: payment.customerId,
        createBy: String(payment.managerId),
      });

      // Payment yaratish
      const newPaymentId = await generatePaymentId();
      const newPayment = await Payment.create({
        paymentId: newPaymentId,
        amount: monthlyPayment,
        actualAmount: paymentAmount,
        date: new Date(),
        isPaid: true,
        paymentType: PaymentType.MONTHLY,
        customerId: payment.customerId,
        managerId: payment.managerId,
        notes: notes._id,
        status: paymentStatus,
        expectedAmount: monthlyPayment,
        remainingAmount: shortageAmount,
        excessAmount: 0,
        confirmedAt: new Date(),
        confirmedBy: user.sub,
        targetMonth: monthNumber,
      });

      createdPayments.push(newPayment);

      // Contract.payments ga qo'shish
      (contract.payments as string[]).push(newPayment._id.toString());

      logger.debug(`✅ Additional payment created for month ${monthNumber}:`, {
        id: newPayment._id,
        status: paymentStatus,
        amount: paymentAmount,
        expected: monthlyPayment,
        shortage: shortageAmount,
      });

      remainingExcess -= paymentAmount;
      currentMonthIndex++;
    }

    // Agar hali ham ortiqcha summa qolsa, prepaidBalance ga qo'shish
    if (remainingExcess > PAYMENT_CONSTANTS.TOLERANCE) {
      contract.prepaidBalance = (contract.prepaidBalance || 0) + remainingExcess;
      logger.debug(`💰 Prepaid balance updated: ${contract.prepaidBalance.toFixed(2)} $`);
      logger.debug(`ℹ️ Remaining ${remainingExcess.toFixed(2)} $ added to prepaid balance (all months paid)`);
    }

    logger.debug(`✅ Created ${createdPayments.length} additional payment(s) from excess`);

    return createdPayments;
  }

  /**
   * Shartnoma to'liq to'langanini tekshirish
   * Requirements: 8.4
   */
  protected async checkContractCompletion(contractId: string): Promise<void> {
    try {
      const contractWithTotals = await contractQueryService.getContractById(contractId);

      if (!contractWithTotals) {
        logger.error(`❌ Contract not found during completion check: ${contractId}`);
        return;
      }

      const { remainingDebt, status: currentStatus, prepaidBalance } = contractWithTotals;
      const finalRemainingDebt = remainingDebt - (prepaidBalance || 0);

      logger.debug("📊 Contract completion check (using QueryService):", {
        contractId,
        totalPaid: contractWithTotals.totalPaid,
        remainingDebt: contractWithTotals.remainingDebt,
        prepaidBalance: contractWithTotals.prepaidBalance,
        finalRemainingDebt: finalRemainingDebt,
        isComplete: finalRemainingDebt <= PAYMENT_CONSTANTS.TOLERANCE,
        currentStatus,
      });

      const contractToUpdate = await Contract.findById(contractId);
      if (!contractToUpdate) {
        return;
      }

      // If fully paid, mark as COMPLETED
      if (finalRemainingDebt <= PAYMENT_CONSTANTS.TOLERANCE) {
        if (currentStatus !== ContractStatus.COMPLETED) {
          contractToUpdate.status = ContractStatus.COMPLETED;
          await contractToUpdate.save();
          logger.debug("✅ Contract status changed to COMPLETED:", contractId);
        }
      }
      // Otherwise, ensure it's ACTIVE
      else {
        if (currentStatus === ContractStatus.COMPLETED) {
          contractToUpdate.status = ContractStatus.ACTIVE;
          await contractToUpdate.save();
          logger.debug(
            "⚠️ Contract status changed back to ACTIVE:",
            contractId,
            `(${finalRemainingDebt.toFixed(2)} $ qoldi)`
          );
        }
      }
    } catch (error) {
      logger.error("❌ Error checking contract completion:", error);
      throw error;
    }
  }

  /**
   * Audit log yaratish
   */
  protected async createAuditLog(params: {
    action: any;
    entity: any;
    entityId: string;
    userId: string;
    changes?: any[];
    metadata?: any;
  }): Promise<void> {
    try {
      const auditLogService = (await import("../../../services/audit-log.service")).default;

      await auditLogService.createLog({
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        userId: params.userId,
        changes: params.changes,
        metadata: params.metadata,
      });

      logger.debug("✅ Audit log created");
    } catch (auditError) {
      logger.error("❌ Error creating audit log:", auditError);
      // Audit log xatosi asosiy operatsiyaga ta'sir qilmasin
    }
  }
}

export default new PaymentBaseService();
