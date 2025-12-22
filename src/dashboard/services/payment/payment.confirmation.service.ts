/**
 * Payment Confirmation Service
 * 
 * Kassa operatsiyalari - To'lovlarni tasdiqlash va rad etish
 * Extends PaymentBaseService for common functionality
 */

import { PaymentBaseService } from "./payment.base.service";
import Payment, { PaymentStatus, PaymentType } from "../../../schemas/payment.schema";
import Contract, { ContractStatus } from "../../../schemas/contract.schema";
import { Debtor } from "../../../schemas/debtor.schema";
import Notes from "../../../schemas/notes.schema";
import Customer from "../../../schemas/customer.schema";
import logger from "../../../utils/logger";
import BaseError from "../../../utils/base.error";
import IJwtUser from "../../../types/user";
import { withTransaction } from "../../../utils/transaction.wrapper";
import { 
  PAYMENT_CONSTANTS,
  calculatePaymentAmounts,
  createAutoRejectionNote,
  isAmountPositive,
} from "../../../utils/helpers/payment";

export class PaymentConfirmationService extends PaymentBaseService {
  /**
   * To'lovni tasdiqlash (Kassa tomonidan)
   * Requirements: 8.2, 8.3, 8.4
   * ✅ ORTIQCHA TO'LOV BO'LSA, KEYINGI OYLAR UCHUN AVTOMATIK TO'LOVLAR YARATISH
   */
  async confirmPayment(paymentId: string, user: IJwtUser) {
    return withTransaction(async (session) => {
      logger.debug("✅ === CONFIRMING PAYMENT (WITH TRANSACTION SUPPORT) ===");
      logger.debug("Payment ID:", paymentId);

      const payment = await Payment.findById(paymentId);

      if (!payment) {
        throw BaseError.NotFoundError("To'lov topilmadi");
      }

      logger.debug("📦 Payment details:", {
        id: payment._id,
        amount: payment.amount,
        actualAmount: payment.actualAmount,
        excessAmount: payment.excessAmount,
        paymentType: payment.paymentType,
        isPaid: payment.isPaid,
        status: payment.status,
      });

      if (payment.isPaid) {
        throw BaseError.BadRequest("To'lov allaqachon tasdiqlangan");
      }

      // Status aniqlash
      const actualAmount = payment.actualAmount || payment.amount;
      const expectedAmount = payment.expectedAmount || payment.amount;
      
      const paymentAmounts = calculatePaymentAmounts(actualAmount, expectedAmount);
      payment.status = paymentAmounts.status;
      payment.remainingAmount = paymentAmounts.remainingAmount;
      payment.excessAmount = paymentAmounts.excessAmount;
      
      if (payment.status === PaymentStatus.UNDERPAID) {
        logger.debug(`⚠️ UNDERPAID: ${payment.remainingAmount.toFixed(2)}$ kam to'landi`);
      } else if (payment.status === PaymentStatus.OVERPAID) {
        logger.debug(`✅ OVERPAID: ${payment.excessAmount.toFixed(2)}$ ortiqcha to'landi`);
      }

      // Payment'ni tasdiqlash
      payment.isPaid = true;
      payment.confirmedAt = new Date();
      payment.confirmedBy = user.sub as any;
      await payment.save();

      logger.debug("✅ Payment confirmed:", {
        status: payment.status,
        actualAmount: payment.actualAmount,
        remainingAmount: payment.remainingAmount,
        excessAmount: payment.excessAmount,
      });

      // Contract topish
      const contract = await Contract.findOne({
        customer: payment.customerId,
        status: ContractStatus.ACTIVE,
      });

      if (!contract) {
        throw BaseError.NotFoundError("Faol shartnoma topilmadi");
      }

      // Payment'ni Contract.payments ga qo'shish (agar yo'q bo'lsa)
      if (!contract.payments) {
        contract.payments = [];
      }
      
      const paymentExists = (contract.payments as any[]).some(
        (p) => p.toString() === payment._id.toString()
      );

      if (!paymentExists) {
        (contract.payments as any[]).push(payment._id);
        logger.debug("✅ Payment added to contract.payments");
      } else {
        logger.debug("ℹ️ Payment already in contract.payments");
      }

      await contract.populate("payments");

      // Ortiqcha to'lovni qayta ishlash
      const createdPayments = [];
      if (payment.excessAmount && isAmountPositive(payment.excessAmount)) {
        const originalActualAmount = payment.actualAmount || payment.amount;
        const correctedActualAmount = payment.expectedAmount || payment.amount;
        
        payment.actualAmount = correctedActualAmount;
        payment.excessAmount = 0;
        payment.status = PaymentStatus.PAID;
        await payment.save();
        
        logger.debug(`✅ Current payment actualAmount corrected: ${originalActualAmount} → ${payment.actualAmount}`);
        logger.debug(`✅ Excess amount (${(originalActualAmount - correctedActualAmount).toFixed(2)} $) will be distributed to next months`);
        
        const result = await this.processExcessPayment(
          originalActualAmount - correctedActualAmount,
          contract,
          payment,
          user
        );
        createdPayments.push(...result);
      }

      await contract.save();

      // nextPaymentDate ni keyingi oyga o'tkazish
      if (contract.nextPaymentDate && payment.paymentType === PaymentType.MONTHLY) {
        const currentDate = new Date(contract.nextPaymentDate);
        let nextMonth: Date;

        if (contract.previousPaymentDate && contract.postponedAt) {
          // Kechiktirilgan to'lov to'landi - asl sanaga qaytarish
          const originalDay = contract.originalPaymentDay || new Date(contract.previousPaymentDate).getDate();
          const today = new Date();
          nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, originalDay);
          
          logger.debug("🔄 Kechiktirilgan to'lov to'landi - asl sanaga qaytarildi");
          
          contract.previousPaymentDate = undefined;
          contract.postponedAt = undefined;
        } else {
          // ✅ TUZATISH: Hozirgi nextPaymentDate dan keyingi oyni hisoblash (bugungi sanadan emas!)
          const originalDay = contract.originalPaymentDay || currentDate.getDate();
          
          // currentDate dan keyingi oyni hisoblash
          nextMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            originalDay
          );
          
          logger.debug("📅 Oddiy to'lov - keyingi oyga o'tkazildi:", {
            old: currentDate.toLocaleDateString("uz-UZ"),
            new: nextMonth.toLocaleDateString("uz-UZ"),
            originalDay: originalDay
          });
        }

        contract.nextPaymentDate = nextMonth;
      }

      await contract.save();
      logger.debug("💾 Contract saved with updated nextPaymentDate");

      // Audit log yaratish
      await this.createAuditLog({
        action: (await import("../../../schemas/audit-log.schema")).AuditAction.PAYMENT_CONFIRMED,
        entity: (await import("../../../schemas/audit-log.schema")).AuditEntity.PAYMENT,
        entityId: paymentId,
        userId: user.sub,
        changes: [
          { field: "status", oldValue: "PENDING", newValue: payment.status },
          { field: "isPaid", oldValue: false, newValue: payment.isPaid },
          { field: "confirmedBy", oldValue: null, newValue: user.sub },
          { field: "confirmedAt", oldValue: null, newValue: payment.confirmedAt }
        ],
        metadata: {
          paymentType: "monthly",
          paymentStatus: payment.status,
          amount: payment.actualAmount || payment.amount
        }
      });

      // Balance yangilash
      const confirmedActualAmount = payment.actualAmount || payment.amount;
      await this.updateBalance(payment.managerId.toString(), {
        dollar: confirmedActualAmount,
        sum: 0,
      }, session);
      
      logger.debug("💵 Balance updated with actualAmount:", confirmedActualAmount);

      // Debtor o'chirish
      const deletedDebtors = await Debtor.deleteMany({
        contractId: contract._id,
      });

      if (deletedDebtors.deletedCount > 0) {
        logger.debug("🗑️ Debtor(s) deleted:", deletedDebtors.deletedCount);
      }

      // Contract completion tekshirish
      await this.checkContractCompletion(String(contract._id));

      logger.debug("✅ Payment confirmed successfully");

      // Database notification yaratish
      try {
        const customer = await Customer.findById(payment.customerId);
        
        if (customer) {
          const botNotificationService = (await import("../../../bot/services/notification.service")).default;
          
          await botNotificationService.createPaymentNotification({
            managerId: payment.managerId.toString(),
            type: "PAYMENT_APPROVED",
            paymentId: payment._id.toString(),
            customerId: customer._id.toString(),
            customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
            contractId: contract._id.toString(),
            productName: contract.productName || "Mahsulot",
            amount: payment.actualAmount || payment.amount,
            status: payment.status,
            paymentType: payment.status === 'PAID' ? 'FULL' : (payment.status === 'OVERPAID' ? 'EXCESS' : 'PARTIAL'),
            monthNumber: payment.targetMonth,
            currencyDetails: { dollar: payment.amount, sum: 0 },
          });
          
          logger.info("✅ Database notification created for payment approval");
        }
      } catch (notifError) {
        logger.error("❌ Error creating notification:", notifError);
      }

      return {
        status: "success",
        message: "To'lov tasdiqlandi",
        paymentId: payment._id,
        contractId: contract._id,
      };
    });
  }

  /**
   * To'lovni rad etish (Kassa tomonidan)
   * Requirements: 8.5
   */
  async rejectPayment(paymentId: string, reason: string, user: IJwtUser) {
    return withTransaction(async (session) => {
      logger.debug("❌ === REJECTING PAYMENT (WITH TRANSACTION) ===");
      logger.debug("Payment ID:", paymentId);
      logger.debug("Reason:", reason);

      const payment = await Payment.findById(paymentId).populate("notes");

      if (!payment) {
        throw BaseError.NotFoundError("To'lov topilmadi");
      }

      if (payment.isPaid) {
        throw BaseError.BadRequest("Tasdiqlangan to'lovni rad etib bo'lmaydi");
      }

      // Payment status'ni o'zgartirish
      payment.status = PaymentStatus.REJECTED;
      await payment.save();

      // Notes'ga rad etish sababini qo'shish
      if (payment.notes) {
        payment.notes.text += `\n[RAD ETILDI: ${reason}]`;
        await payment.notes.save();
      }

      // Payment'ni Contract.payments dan o'chirish
      const contract = await Contract.findOne({
        customer: payment.customerId,
        status: ContractStatus.ACTIVE,
      });

      if (contract) {
        const paymentIndex = (contract.payments as any[]).findIndex(
          (p) => p.toString() === payment._id.toString()
        );

        if (paymentIndex !== -1) {
          (contract.payments as any[]).splice(paymentIndex, 1);
          logger.debug("✅ Payment removed from contract.payments");
        }

        await contract.save();
      }

      logger.debug("✅ Payment rejected successfully");

      // Database notification yaratish
      try {
        const customer = await Customer.findById(payment.customerId);
        
        if (customer && contract) {
          const botNotificationService = (await import("../../../bot/services/notification.service")).default;
          
          await botNotificationService.createPaymentNotification({
            managerId: payment.managerId.toString(),
            type: "PAYMENT_REJECTED",
            paymentId: payment._id.toString(),
            customerId: customer._id.toString(),
            customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
            contractId: contract._id.toString(),
            productName: contract.productName || "Mahsulot",
            amount: payment.actualAmount || payment.amount,
            status: payment.status,
            paymentType: 'PARTIAL',
            monthNumber: payment.targetMonth,
            currencyDetails: undefined,
          });
          
          logger.info("✅ Database notification created for payment rejection");
        }
      } catch (notifError) {
        logger.error("❌ Error creating rejection notification:", notifError);
      }

      return {
        status: "success",
        message: "To'lov rad etildi",
        paymentId: payment._id,
      };
    });
  }

  /**
   * PENDING to'lovlarni tekshirish va muddati o'tganlarni avtomatik rad etish
   * Requirements: 9.1 - PENDING to'lovlar timeout
   */
  async checkAndRejectExpiredPayments(): Promise<{
    rejectedCount: number;
    rejectedPaymentIds: string[];
  }> {
    try {
      logger.debug("🕐 === CHECKING EXPIRED PENDING PAYMENTS ===");

      const TIMEOUT_HOURS = PAYMENT_CONSTANTS.PENDING_TIMEOUT_HOURS;
      const timeoutDate = new Date();
      timeoutDate.setHours(timeoutDate.getHours() - TIMEOUT_HOURS);

      const expiredPayments = await Payment.find({
        status: PaymentStatus.PENDING,
        isPaid: false,
        createdAt: { $lt: timeoutDate },
      }).populate("notes");

      logger.debug(`📊 Found ${expiredPayments.length} expired PENDING payment(s)`);

      const rejectedPaymentIds: string[] = [];

      for (const payment of expiredPayments) {
        try {
          payment.status = PaymentStatus.REJECTED;
          await payment.save();

          if (payment.notes) {
            const notes = await Notes.findById(payment.notes);
            if (notes) {
              notes.text += createAutoRejectionNote(TIMEOUT_HOURS);
              await notes.save();
            }
          }

          rejectedPaymentIds.push(payment._id.toString());
          logger.debug(`✅ Payment ${payment._id} automatically rejected`);
        } catch (error) {
          logger.error(`❌ Error rejecting payment ${payment._id}:`, error);
        }
      }

      logger.debug(`✅ ${rejectedPaymentIds.length} payment(s) automatically rejected`);

      return {
        rejectedCount: rejectedPaymentIds.length,
        rejectedPaymentIds,
      };
    } catch (error) {
      logger.error("❌ Error checking expired payments:", error);
      throw error;
    }
  }
}

export default new PaymentConfirmationService();
