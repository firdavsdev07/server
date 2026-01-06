import Employee, { IEmployee } from "../../schemas/employee.schema";
import IJwtUser from "../../types/user";
import Payment, {
  PaymentStatus,
  PaymentType,
} from "../../schemas/payment.schema";
import { Debtor } from "../../schemas/debtor.schema";
import BaseError from "../../utils/base.error";
import Notes from "../../schemas/notes.schema";
import { Balance } from "../../schemas/balance.schema";
import Contract, { ContractStatus } from "../../schemas/contract.schema";
import mongoose, { Types } from "mongoose";
import contractQueryService from "./contract/contract.query.service";
// import notificationService from "../../services/notification.service"; // ❌ Telegram notification o'chirildi - endi database notification ishlatiladi
import Customer from "../../schemas/customer.schema";
import logger from "../../utils/logger";
import { withTransaction } from "../../utils/transaction.wrapper";
import { RoleEnum } from "../../enums/role.enum";
import {
  PAYMENT_CONSTANTS,
  calculatePaymentStatus,
  calculatePaymentAmounts,
  applyPrepaidBalance,
  createPaymentNoteText,
  createPaymentResponseMessage,
  createRemainingPaymentNote,
  createAutoRejectionNote,
  PAYMENT_MESSAGES,
  areAmountsEqual,
  isAmountPositive,
} from "../../utils/helpers/payment";

interface PaymentDto {
  contractId: string;
  amount: number;
  notes?: string;
  currencyDetails: {
    dollar: number;
    sum: number;
  };
  currencyCourse: number;
  paymentMethod?: string; // ✅ YANGI: To'lov usuli (som_cash, som_card, dollar_cash, dollar_card_visa)
}

class PaymentService {
  /**
   * Balance yangilash
   * Requirements: 2.2, 8.3
   */
  private async updateBalance(
    managerId: IEmployee | string,
    changes: {
      dollar?: number;
      sum?: number;
    },
    session?: any
  ) {
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
   * Ortiqcha to'lovni boshqarish - Keyingi oylar uchun avtomatik to'lovlar yaratish
   * Requirements: 8.5
   * 
   * @param excessAmount - Ortiqcha summa
   * @param contract - Shartnoma
   * @param payment - Asosiy to'lov
   * @param user - Foydalanuvchi
   */
  private async processExcessPayment(
    excessAmount: number,
    contract: any,
    payment: any,
    user: IJwtUser
  ): Promise<any[]> {
    const createdPayments: any[] = [];

    if (!isAmountPositive(excessAmount)) {
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
    while (remainingExcess > 0.01 && currentMonthIndex < contract.period) {
      const monthNumber = currentMonthIndex + 1;

      // Bu oy uchun to'lov summasi
      const paymentAmount = Math.min(remainingExcess, monthlyPayment);
      const shortageAmount =
        paymentAmount < monthlyPayment ? monthlyPayment - paymentAmount : 0;

      // Status aniqlash
      const paymentStatus = calculatePaymentStatus(paymentAmount, monthlyPayment);

      // Notes yaratish
      const notes = await Notes.create({
        text: `${monthNumber}-oy to'lovi (ortiqcha summadan): ${paymentAmount.toFixed(
          2
        )} $${shortageAmount > 0
          ? `\n⚠️ ${shortageAmount.toFixed(2)} $ kam to'landi`
          : ""
          }`,
        customer: payment.customerId,
        createBy: String(payment.managerId),
      });

      // Payment yaratish
      const newPayment = await Payment.create({
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
    if (isAmountPositive(remainingExcess)) {
      contract.prepaidBalance = (contract.prepaidBalance || 0) + remainingExcess;
      logger.debug(
        `💰 Prepaid balance updated: ${contract.prepaidBalance.toFixed(2)} $`
      );
      logger.debug(
        `ℹ️ Remaining ${remainingExcess.toFixed(
          2
        )} $ added to prepaid balance (all months paid)`
      );
    }

    logger.debug(
      `✅ Created ${createdPayments.length} additional payment(s) from excess`
    );

    return createdPayments;
  }

  /**
   * Shartnoma to'liq to'langanini tekshirish
   * Requirements: 8.4
   * REFACTORED: Uses contractQueryService for authoritative calculation.
   */
  private async checkContractCompletion(contractId: string) {
    try {
      // Get authoritative data using the refactored query service
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
        isComplete: finalRemainingDebt <= 0.01,
        currentStatus,
      });

      // Fetch the actual document to update it
      const contractToUpdate = await Contract.findById(contractId);
      if (!contractToUpdate) {
        return;
      }

      // If fully paid, mark as COMPLETED
      if (finalRemainingDebt <= 0.01) {
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
   * To'lov qabul qilish (Manager tomonidan - Bot)
   * Requirements: 8.1
   *
   * ✅ KAM yoki KO'P TO'LANGAN SUMMANI QAYD QILISH
   */
  async receivePayment(data: PaymentDto, user: IJwtUser) {
    try {
      logger.debug("💰 === RECEIVING PAYMENT (BOT) ===");
      logger.debug("Contract ID:", data.contractId);
      logger.debug("Amount:", data.amount);

      const contract = await Contract.findById(data.contractId);

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const manager = await Employee.findById(user.sub);

      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi");
      }

      // ✅ C2: Prepaid balance'dan avtomatik foydalanish
      const expectedAmount = contract.monthlyPayment;
      const prepaidBalanceBefore = contract.prepaidBalance || 0;

      const { newActualAmount: actualAmount, prepaidUsed } = applyPrepaidBalance(
        data.amount,
        expectedAmount,
        prepaidBalanceBefore
      );

      if (isAmountPositive(prepaidUsed)) {
        logger.debug(`💎 PREPAID BALANCE USED: ${prepaidUsed.toFixed(2)} $ (balance: ${prepaidBalanceBefore.toFixed(2)} $)`);
        logger.debug(`💵 Total amount after prepaid: ${actualAmount.toFixed(2)} $`);
      }

      // ✅ TO'LOV TAHLILI - Kam yoki ko'p to'langanini aniqlash
      const { status: paymentStatus, remainingAmount, excessAmount } = calculatePaymentAmounts(
        actualAmount,
        expectedAmount
      );
      const prepaidAmount = excessAmount;

      // Logging
      if (paymentStatus === PaymentStatus.UNDERPAID) {
        logger.debug(`⚠️ UNDERPAID: ${remainingAmount.toFixed(2)} $ kam to'landi`);
      } else if (paymentStatus === PaymentStatus.OVERPAID) {
        logger.debug(`✅ OVERPAID: ${excessAmount.toFixed(2)} $ ko'p to'landi`);
      } else {
        logger.debug(`✓ EXACT PAYMENT: To'g'ri summa to'landi`);
      }

      // 1. Notes yaratish - to'lov holati haqida ma'lumot qo'shish
      const noteText = createPaymentNoteText({
        amount: data.amount,
        status: paymentStatus,
        remainingAmount,
        excessAmount,
        prepaidUsed,
        customNote: data.notes,
      });

      const notes = await Notes.create({
        text: noteText || "To'lov amalga oshirildi", // Default text agar notes bo'sh bo'lsa
        customer: contract.customer,
        createBy: user.sub,
      });

      // 2. Payment yaratish - BOT TO'LOVI (PENDING - Kassa tasdiqlashi kerak)
      const payment = await Payment.create({
        amount: expectedAmount, // ✅ OYLIK TO'LOV
        actualAmount: actualAmount, // ✅ HAQIQATDA TO'LANGAN SUMMA (prepaid bilan)
        date: new Date(),
        isPaid: false, // ❌ BOT TO'LOVI - Kassa tasdiqlashi kerak
        paymentType: PaymentType.MONTHLY,
        paymentMethod: data.paymentMethod, // ✅ YANGI: To'lov usuli
        customerId: contract.customer,
        managerId: user.sub,
        notes: notes._id,
        status: PaymentStatus.PENDING, // ⏳ PENDING - Kassa tasdiqlashi kerak
        expectedAmount: expectedAmount, // Kutilgan summa
        remainingAmount: remainingAmount, // Kam to'langan summa
        excessAmount: excessAmount, // Ko'p to'langan summa
        prepaidAmount: prepaidAmount, // Keyingi oyga o'tkaziladigan summa
        // confirmedAt va confirmedBy - Kassa tasdiqlanganda qo'shiladi
      });

      // ✅ C2: Prepaid balance'dan ayirish (faqat ishlatilgan bo'lsa)
      if (isAmountPositive(prepaidUsed)) {
        contract.prepaidBalance = prepaidBalanceBefore - prepaidUsed;
        await contract.save();
        logger.debug(`💎 Prepaid balance updated: ${prepaidBalanceBefore.toFixed(2)} → ${contract.prepaidBalance.toFixed(2)} $ (-${prepaidUsed.toFixed(2)} $)`);
      }

      logger.debug("✅ Payment created:", {
        id: payment._id,
        status: paymentStatus,
        amount: actualAmount,
        expected: expectedAmount,
        remaining: remainingAmount,
        excess: excessAmount,
      });

      // ❌ BOT TO'LOVI - Balance yangilanmasin (Kassa tasdiqlashi kerak)
      // Balance faqat kassa tasdiqlanganda yangilanadi (confirmPayment metodida)
      logger.debug("⏳ Balance NOT updated - waiting for cash confirmation");

      // ❌ BOT TO'LOVI - Prepaid balance yangilanmasin (Kassa tasdiqlashi kerak)
      // Prepaid balance faqat kassa tasdiqlanganda yangilanadi (confirmPayment metodida)
      // excessAmount payment obyektida saqlangan, kassa tasdiqlanganda ishlatiladi
      logger.debug("⏳ Prepaid balance NOT updated - waiting for cash confirmation");
      if (prepaidAmount > 0) {
        logger.debug(
          `ℹ️ Excess amount (${prepaidAmount.toFixed(
            2
          )} $) saved in payment.excessAmount, will be added to prepaid balance after confirmation`
        );
      }

      // ✅ TUZATISH #5: PENDING to'lovni ham Contract.payments'ga qo'shish
      // (404 xatosini oldini olish uchun)
      if (!contract.payments) {
        contract.payments = [];
      }
      (contract.payments as any[]).push(payment._id);

      await contract.save();

      logger.debug("✅ PENDING payment added to contract.payments");
      logger.debug("⏳ Will be confirmed or rejected by cash");

      // ✅ Response'da to'lov holati haqida ma'lumot qaytarish
      const message = createPaymentResponseMessage({
        status: paymentStatus,
        remainingAmount,
        excessAmount,
        prepaidUsed,
      });

      return {
        status: "success",
        message,
        paymentId: payment._id,
        paymentDetails: {
          status: paymentStatus,
          expectedAmount,
          actualAmount,
          remainingAmount,
          excessAmount,
          // ⚠️ prepaidBalance hali yangilanmagan (kassa tasdiqlashi kerak)
          // prepaidBalance: contract.prepaidBalance, // Noto'g'ri - hali yangilanmagan
        },
      };
    } catch (error) {
      logger.error("❌ Error receiving payment:", error);
      throw error;
    }
  }

  /**
   * To'lovni tasdiqlash (Kassa tomonidan)
   * 
   * @deprecated Use PaymentConfirmationService.confirmPayment() instead
   * This method delegates to PaymentConfirmationService
   */
  async confirmPayment(paymentId: string, user: IJwtUser) {
    const paymentConfirmationService = (await import("./payment/payment.confirmation.service")).default;
    return paymentConfirmationService.confirmPayment(paymentId, user);
  }

  /**
   * @deprecated OLD confirmPayment implementation - moved to PaymentConfirmationService
   */
  private async _oldConfirmPayment(paymentId: string, user: IJwtUser) {
    return withTransaction(async (session) => {
      logger.debug("✅ === CONFIRMING PAYMENT (WITH TRANSACTION SUPPORT) ===");
      logger.debug("Payment ID:", paymentId);

      const payment = await Payment.findById(paymentId);

      if (!payment) {
        throw BaseError.NotFoundError("To'lov topilmadi");
      }

      // Debug: payment obyektini to'liq ko'rish
      logger.debug("📦 Payment object from DB:", {
        _id: payment._id,
        amount: payment.amount,
        actualAmount: payment.actualAmount,
        targetMonth: payment.targetMonth,
        hasTargetMonth: 'targetMonth' in payment,
        paymentKeys: Object.keys(payment.toObject())
      });

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

      // ✅ TUZATISH #1: Status'ni actualAmount ga qarab aniqlash
      const actualAmount = payment.actualAmount || payment.amount;
      const expectedAmount = payment.expectedAmount || payment.amount;
      const difference = actualAmount - expectedAmount;

      logger.debug("💰 Payment confirmation details:", {
        actualAmount,
        expectedAmount,
        difference,
        receivedStatus: payment.status,
      });

      // Status aniqlash
      const paymentAmounts = calculatePaymentAmounts(actualAmount, expectedAmount);
      payment.status = paymentAmounts.status;
      payment.remainingAmount = paymentAmounts.remainingAmount;
      payment.excessAmount = paymentAmounts.excessAmount;

      if (payment.status === PaymentStatus.UNDERPAID) {
        logger.debug(`⚠️ UNDERPAID: ${payment.remainingAmount.toFixed(2)}$ kam to'landi`);
      } else if (payment.status === PaymentStatus.OVERPAID) {
        logger.debug(`✅ OVERPAID: ${payment.excessAmount.toFixed(2)}$ ortiqcha to'landi`);
      }

      // 1. Payment'ni tasdiqlash
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

      logger.debug("✅ Payment confirmed:", payment._id);

      // ✅ YANGI: Payment'ni Contract.payments ga qo'shish
      const contract = await Contract.findOne({
        customer: payment.customerId,
        status: ContractStatus.ACTIVE,
      }).populate("customer", "fullName");

      if (!contract) {
        throw BaseError.NotFoundError("Faol shartnoma topilmadi");
      }

      // Customer name olish
      const customerName = (contract.customer as any)?.fullName || "Unknown Customer";

      // Agar payment hali contract.payments da bo'lmasa, qo'shish
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

      // 2. Contract'ni populate qilish
      await contract.populate("payments");

      // ✅ REFACTORED: Ortiqcha to'lovni qayta ishlash (DRY - takrorlanishni bartaraf etish)
      // processExcessPayment metodidan foydalanish
      const createdPayments = [];
      if (payment.excessAmount && isAmountPositive(payment.excessAmount)) {
        // ✅ TUZATISH: 4-oyning actualAmount'ini to'g'rilash
        // Ortiqcha summani ayirish kerak, chunki u keyingi oylarga o'tkaziladi
        const originalActualAmount = payment.actualAmount || payment.amount;
        const correctedActualAmount = payment.expectedAmount || payment.amount;

        payment.actualAmount = correctedActualAmount;
        payment.excessAmount = 0; // Ortiqcha summa keyingi oylarga o'tkazildi
        payment.status = PaymentStatus.PAID; // Status PAID ga o'zgartirildi
        await payment.save();

        logger.debug(`✅ Current payment actualAmount corrected: ${originalActualAmount} → ${payment.actualAmount}`);
        logger.debug(`✅ Excess amount (${(originalActualAmount - correctedActualAmount).toFixed(2)} $) will be distributed to next months`);

        const result = await this.processExcessPayment(
          originalActualAmount - correctedActualAmount, // Ortiqcha summa
          contract,
          payment,
          user
        );
        createdPayments.push(...result);
      }

      await contract.save();

      // 4. ✅ TUZATISH: nextPaymentDate ni to'g'ri hisoblash
      // Eng oxirgi to'langan oydan keyingi oyga o'rnatish
      if (payment.paymentType === PaymentType.MONTHLY) {
        // Barcha to'lovlarni olish va to'langan oylarni aniqlash
        const allPaymentsForDate = await Payment.find({
          _id: { $in: contract.payments },
        }).sort({ targetMonth: 1 });

        // Eng oxirgi to'langan oyni topish
        const paidPaymentsForDate = allPaymentsForDate.filter(p => p.isPaid);
        const lastPaidMonth = paidPaymentsForDate.length > 0
          ? Math.max(...paidPaymentsForDate.map(p => p.targetMonth || 0))
          : 0;

        logger.debug("📊 To'lov holati:", {
          totalPayments: allPaymentsForDate.length,
          paidPayments: paidPaymentsForDate.length,
          lastPaidMonth: lastPaidMonth,
          period: contract.period,
        });

        // Keyingi to'lov oyi
        const nextPaymentMonth = lastPaidMonth + 1;

        // Agar barcha oylar to'langan bo'lmasa, nextPaymentDate yangilash
        if (nextPaymentMonth <= contract.period) {
          const startDate = new Date(contract.startDate);
          const originalDay = contract.originalPaymentDay || startDate.getDate();

          // Keyingi to'lov sanasini hisoblash
          const newNextPaymentDate = new Date(startDate);
          newNextPaymentDate.setMonth(startDate.getMonth() + nextPaymentMonth);

          // Kun to'g'riligi (oyning oxirgi kunidan oshib ketmaslik)
          if (newNextPaymentDate.getDate() !== originalDay) {
            newNextPaymentDate.setDate(0);
          }

          logger.debug("📅 nextPaymentDate yangilandi:", {
            lastPaidMonth: lastPaidMonth,
            nextPaymentMonth: nextPaymentMonth,
            oldNextPaymentDate: contract.nextPaymentDate?.toISOString().split("T")[0],
            newNextPaymentDate: newNextPaymentDate.toISOString().split("T")[0],
            originalDay: originalDay,
          });

          contract.nextPaymentDate = newNextPaymentDate;

          // Agar originalPaymentDay undefined bo'lsa, o'rnatish
          if (!contract.originalPaymentDay) {
            contract.originalPaymentDay = originalDay;
          }

          // Kechiktirilgan ma'lumotlarni tozalash
          if (contract.previousPaymentDate || contract.postponedAt) {
            contract.previousPaymentDate = undefined;
            contract.postponedAt = undefined;
          }
        } else {
          logger.debug("✅ Barcha oylar to'landi");
        }
      } else {
        logger.debug(
          "⏭️ Skipping nextPaymentDate update - not monthly payment:",
          {
            paymentType: payment.paymentType,
            expectedType: PaymentType.MONTHLY,
          }
        );
      }

      // Contract'ni saqlash (payments va nextPaymentDate)
      await contract.save();
      logger.debug("💾 Contract saved with updated nextPaymentDate");

      // ✅ AUDIT LOG: To'lov tasdiqlash
      try {
        const auditLogService = (await import("../../services/audit-log.service")).default;
        const { AuditAction, AuditEntity } = await import("../../schemas/audit-log.schema");

        logger.debug("🔍 Creating audit log with data:", {
          action: AuditAction.PAYMENT_CONFIRMED,
          entity: AuditEntity.PAYMENT,
          entityId: paymentId,
          userId: user.sub,
          userInfo: { name: user.name, role: user.role },
          payment: {
            targetMonth: payment.targetMonth,
            amount: payment.amount,
            actualAmount: payment.actualAmount
          }
        });

        await auditLogService.createLog({
          action: AuditAction.PAYMENT_CONFIRMED,
          entity: AuditEntity.PAYMENT,
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
            amount: payment.actualAmount || payment.amount,
            targetMonth: payment.targetMonth,  // ✅ Qaysi oy ekani qo'shildi
            customerName: customerName  // ✅ Mijoz ismi qo'shildi
          }
        });
        logger.debug("✅ Audit log created for payment confirmation");
      } catch (auditError) {
        logger.error("❌ Error creating audit log:", auditError);
        logger.error("❌ Audit error details:", {
          message: (auditError as Error).message,
          stack: (auditError as Error).stack,
          userId: user.sub,
          paymentId
        });
      }

      // ✅ VERIFY: Database'dan qayta o'qib tekshirish
      const verifyContract = await Contract.findById(contract._id).select(
        "nextPaymentDate previousPaymentDate"
      );
      logger.debug("🔍 VERIFY - Database'dagi qiymat:", {
        nextPaymentDate: verifyContract?.nextPaymentDate,
        nextPaymentDateISO: verifyContract?.nextPaymentDate?.toISOString(),
        previousPaymentDate: verifyContract?.previousPaymentDate,
      });

      // 5. Balance yangilash (FAQAT BU YERDA - kassa tasdiqlanganda)
      // ✅ TUZATISH #2: actualAmount ishlatish (amount emas!)
      const confirmedActualAmount = payment.actualAmount || payment.amount;
      await this.updateBalance(payment.managerId, {
        dollar: confirmedActualAmount,
        sum: 0,
      }, session);

      logger.debug("💵 Balance updated with actualAmount:", confirmedActualAmount);

      logger.debug("💵 Balance updated for manager:", payment.managerId);

      // 6. Agar Debtor mavjud bo'lsa, o'chirish (kassa tasdiqlanganda)
      const deletedDebtors = await Debtor.deleteMany({
        contractId: contract._id,
      });

      if (deletedDebtors.deletedCount > 0) {
        logger.debug("🗑️ Debtor(s) deleted:", deletedDebtors.deletedCount);
      }

      // 7. Shartnoma to'liq to'langanini tekshirish
      await this.checkContractCompletion(String(contract._id));

      // await session.commitTransaction();
      logger.debug("✅ Payment confirmed successfully (NO TRANSACTION - DEV MODE)");

      // 8. ✅ Create notification in database (for bot display)
      try {
        const customer = await Customer.findById(payment.customerId);

        if (customer) {
          const botNotificationService = (await import("../../bot/services/notification.service")).default;

          await botNotificationService.createPaymentNotification({
            managerId: payment.managerId.toString(),
            type: "PAYMENT_APPROVED",
            paymentId: payment._id.toString(),
            customerId: customer._id.toString(),
            customerName: customer.fullName,
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
        // Notification xatosi asosiy operatsiyaga ta'sir qilmasin
      }

      return {
        status: "success",
        message: "To'lov tasdiqlandi",
        paymentId: payment._id,
        contractId: contract._id,
      };

      return payment;
    }); // End of withTransaction
  }

  /**
   * To'lovni rad etish (Kassa tomonidan)
   * 
   * @deprecated Use PaymentConfirmationService.rejectPayment() instead
   * This method delegates to PaymentConfirmationService
   */
  async rejectPayment(paymentId: string, reason: string, user: IJwtUser) {
    const paymentConfirmationService = (await import("./payment/payment.confirmation.service")).default;
    return paymentConfirmationService.rejectPayment(paymentId, reason, user);
  }

  /**
   * @deprecated OLD rejectPayment implementation - moved to PaymentConfirmationService
   */
  private async _oldRejectPayment(paymentId: string, reason: string, user: IJwtUser) {
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

      // 1. Payment status'ni o'zgartirish
      payment.status = PaymentStatus.REJECTED;
      await payment.save();

      // 2. Notes'ga rad etish sababini qo'shish
      if (payment.notes) {
        payment.notes.text += `\n[RAD ETILDI: ${reason}]`;
        await payment.notes.save();
      }

      // 3. ✅ Payment'ni Contract.payments dan o'chirish
      const contract = await Contract.findOne({
        customer: payment.customerId,
        status: ContractStatus.ACTIVE,
      });

      if (contract) {
        // Payment'ni payments arraydan o'chirish
        const paymentIndex = (contract.payments as any[]).findIndex(
          (p) => p.toString() === payment._id.toString()
        );

        if (paymentIndex !== -1) {
          (contract.payments as any[]).splice(paymentIndex, 1);
          logger.debug("✅ Payment removed from contract.payments");
        }

        // ✅ Prepaid balance kamaytirilmasin
        // Sabab: Bot to'lovida (receivePayment) prepaid balance yangilanmaydi
        // Faqat kassa tasdiqlanganda (confirmPayment) yangilanadi
        // Rad etilayotgan to'lov PENDING, demak prepaid balance hali yangilanmagan
        if (payment.excessAmount && payment.excessAmount > 0) {
          logger.debug(
            `ℹ️ Payment had excess amount (${payment.excessAmount.toFixed(
              2
            )} $), but prepaid balance was not updated (PENDING status)`
          );
        }

        await contract.save();
      }

      // await session.commitTransaction();
      logger.debug("✅ Payment rejected successfully (NO TRANSACTION - DEV MODE)");

      // 4. ✅ Create rejection notification in database (for bot display)
      try {
        const customer = await Customer.findById(payment.customerId);

        if (customer && contract) {
          const botNotificationService = (await import("../../bot/services/notification.service")).default;

          await botNotificationService.createPaymentNotification({
            managerId: payment.managerId.toString(),
            type: "PAYMENT_REJECTED",
            paymentId: payment._id.toString(),
            customerId: customer._id.toString(),
            customerName: customer.fullName,
            contractId: contract._id.toString(),
            productName: contract.productName || "Mahsulot",
            amount: payment.actualAmount || payment.amount,
            status: payment.status,
            paymentType: 'PARTIAL', // Rad qilingan to'lovlar odatda partial
            monthNumber: payment.targetMonth,
            currencyDetails: undefined, // Rad qilinganda currency details kerak emas
          });

          logger.info("✅ Database notification created for payment rejection");
        }
      } catch (notifError) {
        logger.error("❌ Error creating rejection notification:", notifError);
        // Notification xatosi asosiy operatsiyaga ta'sir qilmasin
      }

      return {
        status: "success",
        message: "To'lov rad etildi",
        paymentId: payment._id,
      };
    }); // End of withTransaction
  }

  /**
   * To'lovlar tarixini olish
   * 
   * @deprecated Use PaymentQueryService.getPaymentHistory() instead
   * This method delegates to PaymentQueryService
   */
  async getPaymentHistory(
    customerId?: string,
    contractId?: string,
    filters?: {
      status?: PaymentStatus[];
      paymentType?: PaymentType[];
      dateFrom?: Date;
      dateTo?: Date;
      isPaid?: boolean;
    }
  ) {
    const paymentQueryService = (await import("./payment/payment.query.service")).default;
    return paymentQueryService.getPaymentHistory(customerId, contractId, filters);
  }

  /**
   * Qolgan qarzni to'lash (mavjud to'lovga qo'shimcha)
   * Mavjud UNDERPAID to'lovni PAID holatiga o'tkazish
   */
  async payRemaining(
    payData: {
      paymentId: string;
      amount: number;
      notes: string;
      currencyDetails: { dollar: number; sum: number };
      currencyCourse: number;
    },
    user: IJwtUser
  ) {
    try {
      logger.debug("💰 === PAY REMAINING (SERVICE) ===");
      logger.debug("Payment ID:", payData.paymentId);
      logger.debug("Amount:", payData.amount);

      // 1. Mavjud to'lovni topish
      const existingPayment = await Payment.findById(payData.paymentId);

      if (!existingPayment) {
        throw BaseError.NotFoundError("To'lov topilmadi");
      }

      // ✅ TUZATISH #3: actualAmount va expectedAmount tekshiruvi
      const currentActualAmount = existingPayment.actualAmount || 0;
      const currentExpectedAmount = existingPayment.expectedAmount || existingPayment.amount || 0;
      const currentRemaining = currentExpectedAmount - currentActualAmount;

      logger.debug("✅ Existing payment found:", {
        id: existingPayment._id,
        status: existingPayment.status,
        actualAmount: currentActualAmount,
        expectedAmount: currentExpectedAmount,
        currentRemaining: currentRemaining,
        savedRemainingAmount: existingPayment.remainingAmount,
        isPaid: existingPayment.isPaid,
      });

      // ✅ YANGI: Haqiqiy remainingAmount'ni hisoblash
      if (!isAmountPositive(currentRemaining)) {
        throw BaseError.BadRequest(PAYMENT_MESSAGES.NO_REMAINING_DEBT);
      }

      // ✅ Qo'shimcha tekshiruv: Status PAID bo'lsa va haqiqatan qarz yo'q bo'lsa
      if (existingPayment.status === PaymentStatus.PAID && !isAmountPositive(currentRemaining)) {
        throw BaseError.BadRequest(PAYMENT_MESSAGES.NO_REMAINING_DEBT);
      }

      // ⚠️ Agar status PAID lekin qarz bor bo'lsa - bu xato holat, davom ettiramiz
      if (existingPayment.status === PaymentStatus.PAID && isAmountPositive(currentRemaining)) {
        logger.warn(`⚠️ WARNING: Payment status is PAID but has remaining amount: ${currentRemaining.toFixed(2)}$`);
        logger.warn("⚠️ This should not happen! Continuing with payRemaining...");
      }

      // 2. Manager topish
      const manager = await Employee.findById(user.sub);
      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi");
      }

      // 3. Qolgan summani tekshirish
      const paymentAmount = payData.amount;

      // ✅ TUZATISH #4: currentRemaining ishlatish (savedRemainingAmount emas)
      // ✅ YANGI: Ortiqcha to'lashga ruxsat berish
      let excessAmount = 0;
      if (paymentAmount > currentRemaining + PAYMENT_CONSTANTS.TOLERANCE) {
        excessAmount = paymentAmount - currentRemaining;
        logger.debug(`💰 Excess payment detected: ${excessAmount.toFixed(2)} $`);
      }

      // 4. actualAmount'ni yangilash
      const newActualAmount = currentActualAmount + paymentAmount;
      const newRemainingAmount = Math.max(0, currentExpectedAmount - newActualAmount);

      existingPayment.actualAmount = newActualAmount;
      existingPayment.remainingAmount = newRemainingAmount;

      // ❌ TUZATISH: amount fieldini yangilamaslik kerak!
      // amount - bu kutilayotgan summa (expectedAmount), o'zgarmasligi kerak
      // actualAmount - bu haqiqatda to'lanayotgan summa
      // Kassada actualAmount ko'rsatiladi, shuning uchun amount'ni o'zgartirmaslik kerak
      logger.debug(`✅ Payment amount NOT changed (remains ${existingPayment.amount} $)`);

      // ✅ Agar ortiqcha to'lansa, excessAmount'ni saqlash
      if (isAmountPositive(excessAmount)) {
        existingPayment.excessAmount = excessAmount;
        existingPayment.status = PaymentStatus.OVERPAID;
        logger.debug(
          `✅ Payment status changed to OVERPAID (excess: ${excessAmount.toFixed(
            2
          )} $)`
        );
      }
      // 5. Status'ni yangilash
      else if (!isAmountPositive(newRemainingAmount)) {
        existingPayment.status = PaymentStatus.PAID;
        existingPayment.isPaid = true;
        logger.debug("✅ Payment status changed to PAID");
      } else {
        logger.debug(`⚠️ Still UNDERPAID: ${newRemainingAmount} $ remaining`);
      }

      // ✅ TUZATISH: Dashboard'dan to'lov qilganda DARHOL PAID bo'ladi
      // Bot'dan kelgan to'lovlar alohida bot/services/payment.service.ts da boshqariladi
      // Bu yerda (dashboard service) faqat Dashboard'dan keladi - ADMIN, MODERATOR, MANAGER
      // Ularning hammasini PAID qilamiz (kassa tasdiq bermaydi, to'g'ridan-to'g'ri qabul qilinadi)

      // Hech narsa qilmaymiz - default PAID bo'ladi

      await existingPayment.save();

      // 6. Notes'ga qo'shish
      if (existingPayment.notes) {
        const notes = await Notes.findById(existingPayment.notes);
        if (notes) {
          notes.text += createRemainingPaymentNote({
            paymentAmount,
            customNote: payData.notes,
          });
          await notes.save();
        }
      }

      // 7. Balance yangilash (Dashboard service - to'g'ridan-to'g'ri yangilanadi)
      await this.updateBalance(String(manager._id), {
        dollar: payData.currencyDetails.dollar || 0,
        sum: payData.currencyDetails.sum || 0,
      }, null);
      logger.debug("✅ Balance updated (from dashboard)");

      // 8. Contract topish va ortiqcha summani boshqarish
      const contract = await Contract.findOne({
        payments: existingPayment._id,
      });

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      // ✅ Ortiqcha to'lov bo'lsa, keyingi oylar uchun avtomatik to'lovlar yaratish (Dashboard)
      const createdPayments = await this.processExcessPayment(
        excessAmount,
        contract,
        existingPayment,
        user
      );

      await contract.save();

      // 9. Agar to'liq to'langan bo'lsa, Debtor'ni tekshirish va yangilash/o'chirish
      if (
        existingPayment.status === PaymentStatus.PAID ||
        existingPayment.status === PaymentStatus.OVERPAID
      ) {
        // ✅ YANGI LOGIKA: Debtor faqat barcha muddati o'tgan to'lovlar to'langanda o'chirilsin
        const allPayments = await Payment.find({
          _id: { $in: contract.payments },
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Muddati o'tgan va to'lanmagan to'lovlarni hisoblash
        const overdueUnpaidPayments = allPayments.filter(
          (p) => !p.isPaid && new Date(p.date) < today
        );

        logger.debug("📊 Overdue unpaid payments check:", {
          totalPayments: allPayments.length,
          overdueUnpaid: overdueUnpaidPayments.length,
          contractId: contract._id,
        });

        // ✅ Faqat muddati o'tgan to'lanmagan to'lovlar yo'q bo'lsa, Debtor o'chirish
        if (overdueUnpaidPayments.length === 0) {
          const deletedDebtors = await Debtor.deleteMany({
            contractId: contract._id,
          });
          if (deletedDebtors.deletedCount > 0) {
            logger.debug("✅ Debtor(s) deleted - no more overdue payments:", deletedDebtors.deletedCount);
          }
        } else {
          logger.debug(`⚠️ Debtor NOT deleted - still has ${overdueUnpaidPayments.length} overdue unpaid payment(s)`);

          // ✅ Debtor ma'lumotlarini yangilash
          const firstOverduePayment = overdueUnpaidPayments.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          )[0];

          if (firstOverduePayment) {
            const overdueDays = Math.floor(
              (today.getTime() - new Date(firstOverduePayment.date).getTime()) / (1000 * 60 * 60 * 24)
            );

            await Debtor.updateMany(
              { contractId: contract._id },
              {
                $set: {
                  dueDate: firstOverduePayment.date,
                  overdueDays: Math.max(0, overdueDays),
                  debtAmount: firstOverduePayment.remainingAmount || firstOverduePayment.amount,
                },
              }
            );

            logger.debug("✅ Debtor updated with new overdue info:", {
              dueDate: firstOverduePayment.date,
              overdueDays: Math.max(0, overdueDays),
            });
          }
        }

        // Contract completion tekshirish
        await this.checkContractCompletion(String(contract._id));
      }

      logger.debug("✅ === PAY REMAINING COMPLETED ===");

      // ✅ Response message (Dashboard - to'g'ridan-to'g'ri tasdiqlangan)
      let message = "";

      if (excessAmount > 0.01) {
        message = `Qolgan qarz to'liq to'landi va ${excessAmount.toFixed(
          2
        )} $ ortiqcha to'landi`;
        if (createdPayments.length > 0) {
          message += `\n✅ ${createdPayments.length} oylik to'lovlar avtomatik yaratildi`;
        }
        if (contract.prepaidBalance && contract.prepaidBalance > 0.01) {
          message += `\n💰 ${contract.prepaidBalance.toFixed(
            2
          )} $ prepaid balance ga qo'shildi`;
        }
      } else if (newRemainingAmount < 0.01) {
        message = "Qolgan qarz to'liq to'landi";
      } else {
        message = `Qolgan qarz qisman to'landi. Hali ${newRemainingAmount.toFixed(
          2
        )} $ qoldi`;
      }

      // ✅ AUDIT LOG: Qolgan qarzni to'lash
      try {
        logger.debug("📝 Creating audit log for payRemaining...");

        if (!user || !user.sub) {
          logger.error("❌ Cannot create audit log: user.sub is missing", { user });
        } else {
          const auditLogService = (await import("../../services/audit-log.service")).default;
          const { AuditAction, AuditEntity } = await import("../../schemas/audit-log.schema");

          const contract = await Contract.findOne({ payments: existingPayment._id }).populate("customer");

          await auditLogService.createLog({
            action: AuditAction.PAYMENT,
            entity: AuditEntity.PAYMENT,
            entityId: existingPayment._id.toString(),
            userId: user.sub,
            metadata: {
              paymentType: "remaining",
              paymentStatus: existingPayment.status,
              amount: payData.amount,
              actualAmount: existingPayment.actualAmount,
              remainingAmount: existingPayment.remainingAmount,
              targetMonth: existingPayment.targetMonth, // ✅ Oy raqami qo'shildi
              affectedEntities: contract ? [
                {
                  entityType: "contract",
                  entityId: contract._id.toString(),
                  entityName: contract.productName || "Contract",
                },
                {
                  entityType: "customer",
                  entityId: contract.customer._id?.toString() || contract.customer.toString(),
                  entityName: contract.customer.fullName,
                }
              ] : []
            }
          });

          logger.debug("✅ Audit log created for payRemaining");
        }
      } catch (auditError) {
        logger.error("❌ Error creating audit log:", auditError);
      }

      return {
        status: "success",
        message: message,
        paymentId: existingPayment._id,
        payment: {
          _id: existingPayment._id,
          actualAmount: existingPayment.actualAmount,
          remainingAmount: existingPayment.remainingAmount,
          excessAmount: existingPayment.excessAmount,
          status: existingPayment.status,
          isPaid: existingPayment.isPaid,
        },
      };
    } catch (error) {
      logger.error("❌ Error in payRemaining:", error);
      throw error;
    }
  }

  async payByContract(
    payData: {
      contractId: string;
      amount: number;
      notes?: string;
      currencyDetails: { dollar: number; sum: number };
      currencyCourse: number;
      paymentMethod?: string; // ✅ YANGI: To'lov usuli
    },
    user: IJwtUser
  ) {
    // ✅ TUZATISH: Audit log uchun ma'lumotlarni saqlash
    const auditData: {
      payments: any[];
      contractId: string;
      customerId: string;
      customerName: string;
      contractName: string;
    } = {
      payments: [],
      contractId: "",
      customerId: "",
      customerName: "",
      contractName: "",
    };

    const result = await withTransaction(async (session) => {
      logger.debug("💰 === PAY BY CONTRACT (DASHBOARD - WITH TRANSACTION) ===");

      const contract = await Contract.findById(payData.contractId).populate(
        "customer"
      );

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const manager = await Employee.findById(user.sub);

      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi");
      }

      const monthlyPayment = contract.monthlyPayment;
      const totalAmount = payData.amount;

      // ✅ YANGI LOGIKA: Ortiqcha to'lov bo'lsa, keyingi oylar uchun avtomatik to'lovlar yaratish
      const createdPayments = [];
      let remainingAmount = totalAmount;
      let currentMonthIndex = 0;

      // Barcha to'lovlarni olish
      const allPayments = await Payment.find({
        _id: { $in: contract.payments },
      }).sort({ date: 1 });

      // To'langan oylik to'lovlar sonini hisoblash
      const paidMonthlyPayments = allPayments.filter(
        (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
      );
      currentMonthIndex = paidMonthlyPayments.length;

      logger.debug("📊 Payment distribution:", {
        totalAmount,
        monthlyPayment,
        currentMonthIndex,
        totalMonths: contract.period,
      });

      // To'lovlarni taqsimlash
      while (remainingAmount > 0.01 && currentMonthIndex < contract.period) {
        const monthNumber = currentMonthIndex + 1;
        let paymentAmount = 0;
        let paymentStatus = PaymentStatus.PAID;
        let excessAmount = 0;
        let shortageAmount = 0;

        if (remainingAmount >= monthlyPayment) {
          // To'liq to'lov
          paymentAmount = monthlyPayment;
          paymentStatus = PaymentStatus.PAID;
          logger.debug(
            `✅ Month ${monthNumber}: PAID (${paymentAmount.toFixed(2)} $)`
          );
        } else {
          // Qisman to'lov (oxirgi oy)
          paymentAmount = remainingAmount;
          paymentStatus = PaymentStatus.UNDERPAID;
          shortageAmount = monthlyPayment - remainingAmount;
          logger.debug(
            `⚠️ Month ${monthNumber}: UNDERPAID (${paymentAmount.toFixed(
              2
            )} $ / ${monthlyPayment} $, shortage: ${shortageAmount.toFixed(
              2
            )} $)`
          );
        }

        // Notes yaratish
        let noteText =
          payData.notes || `${monthNumber}-oy to'lovi: ${paymentAmount} $`;
        if (paymentStatus === PaymentStatus.UNDERPAID) {
          noteText += `\n⚠️ Qisman to'landi: ${shortageAmount.toFixed(
            2
          )} $ yetishmayapti`;
        }

        const notes = await Notes.create({
          text: noteText,
          customer: contract.customer,
          createBy: String(manager._id),
        });

        // ✅ TUZATISH: To'lov uchun asl belgilangan sanani hisoblash
        // startDate + monthNumber oy
        const contractStartDate = new Date(contract.startDate);
        const originalDay = contract.originalPaymentDay || contractStartDate.getDate();
        const scheduledDate = new Date(contractStartDate);
        scheduledDate.setMonth(contractStartDate.getMonth() + monthNumber);
        scheduledDate.setDate(originalDay);

        // Payment yaratish
        const payment = await Payment.create({
          amount: monthlyPayment, // Kutilgan summa
          actualAmount: paymentAmount, // Haqiqatda to'langan summa
          date: scheduledDate, // ✅ FIXED: Asl belgilangan sana
          isPaid: true, // Dashboard darhol tasdiqlaydi
          paymentType: PaymentType.MONTHLY,
          paymentMethod: payData.paymentMethod, // ✅ YANGI: To'lov usuli
          customerId: contract.customer,
          managerId: String(manager._id),
          notes: notes._id,
          status: paymentStatus,
          expectedAmount: monthlyPayment,
          remainingAmount: shortageAmount,
          excessAmount: 0,
          confirmedAt: new Date(),
          confirmedBy: user.sub,
          targetMonth: monthNumber,
        });

        createdPayments.push(payment);

        // Contract.payments ga qo'shish
        if (!contract.payments) {
          contract.payments = [];
        }
        (contract.payments as any[]).push(payment._id);

        logger.debug(`✅ Payment created for month ${monthNumber}:`, {
          id: payment._id,
          status: paymentStatus,
          amount: paymentAmount,
          expected: monthlyPayment,
          shortage: shortageAmount,
        });

        remainingAmount -= paymentAmount;
        currentMonthIndex++;
      }

      // Agar hali ham ortiqcha summa qolsa, prepaidBalance ga qo'shish
      if (remainingAmount > 0.01) {
        contract.prepaidBalance =
          (contract.prepaidBalance || 0) + remainingAmount;
        logger.debug(
          `💰 Prepaid balance updated: ${contract.prepaidBalance.toFixed(2)} $`
        );
        logger.debug(
          `ℹ️ Remaining ${remainingAmount.toFixed(
            2
          )} $ added to prepaid balance (all months paid)`
        );
      }

      // ✅ TUZATISH: nextPaymentDate ni to'g'ri hisoblash
      // Barcha oylik to'lovlarni olish (aynan shu shartnoma uchun)
      const allContractPayments = await Payment.find({
        _id: { $in: contract.payments },
        paymentType: PaymentType.MONTHLY,
      }).sort({ targetMonth: 1 });

      const paidMonthlyPaymentsForDate = allContractPayments.filter(p => p.isPaid);
      const lastPaidMonth = paidMonthlyPaymentsForDate.length > 0
        ? Math.max(...paidMonthlyPaymentsForDate.map(p => p.targetMonth || 0))
        : 0;

      const nextPaymentMonth = lastPaidMonth + 1;

      if (nextPaymentMonth <= contract.period) {
        const contractStartDate = new Date(contract.startDate);
        const originalDay = contract.originalPaymentDay || contractStartDate.getDate();

        const newNextPaymentDate = new Date(contractStartDate);
        newNextPaymentDate.setMonth(contractStartDate.getMonth() + nextPaymentMonth);

        // Kun to'g'riligi (oyning oxirgi kunidan oshib ketmaslik)
        if (newNextPaymentDate.getDate() !== originalDay) {
          newNextPaymentDate.setDate(0);
        }

        logger.debug("📅 nextPaymentDate yangilandi (payByContract):", {
          lastPaidMonth,
          nextPaymentMonth,
          old: contract.nextPaymentDate?.toISOString().split("T")[0],
          new: newNextPaymentDate.toISOString().split("T")[0],
        });

        contract.nextPaymentDate = newNextPaymentDate;

        if (!contract.originalPaymentDay) {
          contract.originalPaymentDay = originalDay;
        }
      }

      await contract.save();
      logger.debug(
        `✅ ${createdPayments.length} payment(s) added to contract (Dashboard)`
      );

      // ✅ Balance darhol yangilanadi (Dashboard) - payByContract
      await this.updateBalance(String(manager._id), {
        dollar: payData.currencyDetails.dollar || 0,
        sum: payData.currencyDetails.sum || 0,
      }, session);
      logger.debug("✅ Balance updated (Dashboard)");

      // ✅ Debtor o'chiriladi (agar mavjud bo'lsa)
      const deletedDebtors = await Debtor.deleteMany({
        contractId: contract._id,
      });
      if (deletedDebtors.deletedCount > 0) {
        logger.debug("🗑️ Debtor(s) deleted:", deletedDebtors.deletedCount);
      }

      // ✅ Contract completion tekshirish
      await this.checkContractCompletion(String(contract._id));

      // await session.commitTransaction();
      logger.debug("✅ payByContract completed successfully (NO TRANSACTION - DEV MODE)");

      // ✅ TUZATISH: Audit log ma'lumotlarini to'plash (transaction ichida)
      auditData.payments = createdPayments.map(p => ({
        _id: p._id.toString(),
        status: p.status,
        amount: p.actualAmount || p.amount,
        targetMonth: p.targetMonth,
      }));
      auditData.contractId = contract._id.toString();
      auditData.customerId = contract.customer._id?.toString() || contract.customer.toString();
      auditData.customerName = contract.customer.fullName;
      auditData.contractName = contract.productName || "Contract";

      logger.debug(`📝 Audit data collected: ${auditData.payments.length} payment(s)`);

      // ✅ Response'da to'lov holati haqida ma'lumot qaytarish
      const lastPayment = createdPayments[createdPayments.length - 1];
      let message = `${createdPayments.length} oylik to'lov muvaffaqiyatli amalga oshirildi`;

      if (lastPayment?.status === PaymentStatus.UNDERPAID) {
        message += `. Oxirgi oyda ${lastPayment.remainingAmount?.toFixed(
          2
        )} $ yetishmayapti`;
      }

      if (remainingAmount > 0.01) {
        message += `. ${remainingAmount.toFixed(
          2
        )} $ ortiqcha summa keyingi oyga o'tkazildi`;
      }

      return {
        status: "success",
        message,
        contractId: contract._id,
        paymentsCreated: createdPayments.length,
        paymentIds: createdPayments.map((p) => p._id),
        paymentDetails: {
          totalAmount: totalAmount,
          monthlyPayment: monthlyPayment,
          monthsPaid: createdPayments.length,
          prepaidBalance: contract.prepaidBalance,
          lastPaymentStatus: lastPayment?.status,
        },
      };
    }); // End of withTransaction

    // ✅ TUZATISH: Audit log'ni transaction TASHQARISIDA yaratish
    // Transaction muvaffaqiyatli tugagandan keyin audit log yoziladi
    try {
      logger.debug("📝 Creating audit log after transaction completion...");
      logger.debug("📝 Audit data:", {
        paymentsCount: auditData.payments.length,
        userId: user.sub,
        contractId: auditData.contractId,
      });

      // user.sub tekshiruvi
      if (!user || !user.sub) {
        logger.error("❌ Cannot create audit log: user.sub is missing", { user });
        return result; // Audit log yaratilmasa ham, asosiy natija qaytariladi
      }

      // Agar to'lovlar bo'lmasa ham, audit log yaratish
      if (auditData.payments.length === 0) {
        logger.warn("⚠️ No payments created, skipping audit log");
        return result;
      }

      const auditLogService = (await import("../../services/audit-log.service")).default;
      const { AuditAction, AuditEntity } = await import("../../schemas/audit-log.schema");

      // Har bir yaratilgan to'lov uchun audit log yozish
      for (const payment of auditData.payments) {
        await auditLogService.createLog({
          action: AuditAction.PAYMENT,
          entity: AuditEntity.PAYMENT,
          entityId: payment._id,
          userId: user.sub,
          metadata: {
            paymentType: "monthly",
            paymentStatus: payment.status,
            amount: payment.amount,
            targetMonth: payment.targetMonth,
            customerName: auditData.customerName, // ✅ Mijoz ismi
            affectedEntities: [
              {
                entityType: "contract",
                entityId: auditData.contractId,
                entityName: auditData.contractName,
              },
              {
                entityType: "customer",
                entityId: auditData.customerId,
                entityName: auditData.customerName,
              }
            ]
          }
        });
      }

      logger.debug(`✅ Audit log created successfully for ${auditData.payments.length} payment(s)`);
    } catch (auditError) {
      logger.error("❌ Error creating audit log:", auditError);
      logger.error("❌ Audit error details:", {
        message: (auditError as Error).message,
        stack: (auditError as Error).stack,
        userId: user.sub,
        auditData,
      });
      // Audit log xatosi asosiy operatsiyani buzmasin
    }

    return result;
  }

  /**
   * Debtor bo'yicha to'lov qilish (Dashboard - PAID darhol)
   * Requirements: 8.1, 8.2, 8.3, 8.4
   *
   * ✅ KAM yoki KO'P TO'LANGAN SUMMANI QAYD QILISH
   * ✅ ORTIQCHA TO'LOV BO'LSA, KEYINGI OYLAR UCHUN AVTOMATIK TO'LOVLAR YARATISH
   */
  async update(
    payData: {
      id: string;
      amount: number;
      notes?: string;
      currencyDetails: { dollar: number; sum: number };
      currencyCourse: number;
    },
    user: IJwtUser
  ) {
    return withTransaction(async (session) => {
      logger.debug("💰 === DEBTOR PAYMENT (DASHBOARD - WITH TRANSACTION) ===");

      const existingDebtor = await Debtor.findById(payData.id).populate(
        "contractId"
      );

      if (!existingDebtor) {
        throw BaseError.NotFoundError("Qarizdorlik topilmadi yoki o'chirilgan");
      }

      const customer = existingDebtor.contractId.customer;
      const manager = await Employee.findById(user.sub);

      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi yoki o'chirilgan");
      }

      const contract = await Contract.findById(existingDebtor.contractId._id);

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const monthlyPayment = contract.monthlyPayment;
      const totalAmount = payData.amount;

      // ✅ YANGI LOGIKA: Ortiqcha to'lov bo'lsa, keyingi oylar uchun avtomatik to'lovlar yaratish
      const createdPayments = [];
      let remainingAmount = totalAmount;
      let currentMonthIndex = 0;

      // Barcha to'lovlarni olish
      const allPayments = await Payment.find({
        _id: { $in: contract.payments },
      }).sort({ date: 1 });

      // To'langan oylik to'lovlar sonini hisoblash
      const paidMonthlyPayments = allPayments.filter(
        (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
      );
      currentMonthIndex = paidMonthlyPayments.length;

      logger.debug("📊 Payment distribution:", {
        totalAmount,
        monthlyPayment,
        currentMonthIndex,
        totalMonths: contract.period,
      });

      // Customer ma'lumotlarini olish (audit log uchun)
      const customerData = await Customer.findById(customer);
      const customerName = customerData?.fullName || "Unknown Customer";

      // To'lovlarni taqsimlash
      while (remainingAmount > 0.01 && currentMonthIndex < contract.period) {
        const monthNumber = currentMonthIndex + 1;
        let paymentAmount = 0;
        let paymentStatus = PaymentStatus.PAID;
        let shortageAmount = 0;

        if (remainingAmount >= monthlyPayment) {
          // To'liq to'lov
          paymentAmount = monthlyPayment;
          paymentStatus = PaymentStatus.PAID;
          logger.debug(
            `✅ Month ${monthNumber}: PAID (${paymentAmount.toFixed(2)} $)`
          );
        } else {
          // Qisman to'lov (oxirgi oy)
          paymentAmount = remainingAmount;
          paymentStatus = PaymentStatus.UNDERPAID;
          shortageAmount = monthlyPayment - remainingAmount;
          logger.debug(
            `⚠️ Month ${monthNumber}: UNDERPAID (${paymentAmount.toFixed(
              2
            )} $ / ${monthlyPayment} $, shortage: ${shortageAmount.toFixed(
              2
            )} $)`
          );
        }

        // Notes yaratish
        let noteText =
          payData.notes || `${monthNumber}-oy to'lovi: ${paymentAmount} $`;
        if (paymentStatus === PaymentStatus.UNDERPAID) {
          noteText += `\n⚠️ Qisman to'landi: ${shortageAmount.toFixed(
            2
          )} $ yetishmayapti`;
        }

        const notes = await Notes.create({
          text: noteText,
          customer,
          createBy: String(manager._id),
        });

        // Payment yaratish
        const payment = await Payment.create({
          amount: monthlyPayment, // Kutilgan summa
          actualAmount: paymentAmount, // Haqiqatda to'langan summa
          date: new Date(),
          isPaid: true, // Dashboard darhol tasdiqlaydi
          paymentType: PaymentType.MONTHLY,
          customerId: customer,
          managerId: String(manager._id),
          notes: notes._id,
          status: paymentStatus,
          expectedAmount: monthlyPayment,
          remainingAmount: shortageAmount,
          excessAmount: 0,
          confirmedAt: new Date(),
          confirmedBy: user.sub,
          targetMonth: monthNumber, // ✅ FIXED: targetMonth qo'shildi
        });

        createdPayments.push(payment);

        // Contract.payments ga qo'shish
        if (!contract.payments) {
          contract.payments = [];
        }
        (contract.payments as any[]).push(payment._id);

        logger.debug(`✅ Payment created for month ${monthNumber}:`, {
          id: payment._id,
          status: paymentStatus,
          amount: paymentAmount,
          expected: monthlyPayment,
          shortage: shortageAmount,
        });

        remainingAmount -= paymentAmount;
        currentMonthIndex++;
      }

      // Agar hali ham ortiqcha summa qolsa, prepaidBalance ga qo'shish
      if (remainingAmount > 0.01) {
        contract.prepaidBalance =
          (contract.prepaidBalance || 0) + remainingAmount;
        logger.debug(
          `💰 Prepaid balance updated: ${contract.prepaidBalance.toFixed(2)} $`
        );
        logger.debug(
          `ℹ️ Remaining ${remainingAmount.toFixed(
            2
          )} $ added to prepaid balance (all months paid)`
        );
      }

      await contract.save();
      logger.debug(
        `✅ ${createdPayments.length} payment(s) added to contract (Dashboard)`
      );

      // ✅ Balance darhol yangilanadi (Dashboard) - update (debtor)
      await this.updateBalance(String(manager._id), {
        dollar: payData.currencyDetails.dollar || 0,
        sum: payData.currencyDetails.sum || 0,
      }, session);
      logger.debug("✅ Balance updated (Dashboard)");

      // ✅ Debtor o'chiriladi
      await Debtor.findByIdAndDelete(payData.id);
      logger.debug("🗑️ Debtor deleted");

      // ✅ Contract completion tekshirish
      await this.checkContractCompletion(String(contract._id));

      // ✅ AUDIT LOG: Qarz to'lovlari uchun
      try {
        const auditLogService = (await import("../../services/audit-log.service")).default;
        const { AuditAction, AuditEntity } = await import("../../schemas/audit-log.schema");

        // Har bir yaratilgan to'lov uchun audit log yozish
        for (const payment of createdPayments) {
          await auditLogService.createLog({
            action: AuditAction.PAYMENT,
            entity: AuditEntity.PAYMENT,
            entityId: payment._id.toString(),
            userId: user.sub,
            metadata: {
              paymentType: "monthly",
              paymentStatus: payment.status,
              amount: payment.actualAmount || payment.amount,
              targetMonth: payment.targetMonth,
              customerName: customerName, // ✅ Mijoz ismi
              affectedEntities: [
                {
                  entityType: "contract",
                  entityId: contract._id.toString(),
                  entityName: contract.productName || "Shartnoma",
                },
                {
                  entityType: "customer",
                  entityId: customer.toString(),
                  entityName: customerName,
                }
              ]
            }
          });
        }
        logger.debug(`✅ Audit log created for ${createdPayments.length} debtor payment(s)`);
      } catch (auditError) {
        logger.error("❌ Error creating audit log:", auditError);
      }

      // ✅ Response'da to'lov holati haqida ma'lumot qaytarish
      const lastPayment = createdPayments[createdPayments.length - 1];
      let message = `${createdPayments.length} oylik to'lov muvaffaqiyatli amalga oshirildi`;

      if (lastPayment?.status === PaymentStatus.UNDERPAID) {
        message += `. Oxirgi oyda ${lastPayment.remainingAmount?.toFixed(
          2
        )} $ yetishmayapti`;
      }

      if (remainingAmount > 0.01) {
        message += `. ${remainingAmount.toFixed(
          2
        )} $ ortiqcha summa keyingi oyga o'tkazildi`;
      }

      return {
        status: "success",
        message,
        paymentsCreated: createdPayments.length,
        paymentIds: createdPayments.map((p) => p._id),
        paymentDetails: {
          totalAmount: totalAmount,
          monthlyPayment: monthlyPayment,
          monthsPaid: createdPayments.length,
          prepaidBalance: contract.prepaidBalance,
          lastPaymentStatus: lastPayment?.status,
        },
      };
    }); // End of withTransaction
  }

  /**
   * Barcha to'lanmagan oylar uchun to'lovlarni yaratish
   * Requirements: 8.1, 8.2, 8.3, 8.4
   */
  async payAllRemainingMonths(
    payData: {
      contractId: string;
      amount: number;
      notes?: string;
      currencyDetails: { dollar: number; sum: number };
      currencyCourse: number;
      paymentMethod?: string; // ✅ YANGI: To'lov usuli
    },
    user: IJwtUser
  ) {
    try {

      logger.debug("💰 === PAY ALL REMAINING MONTHS ===");
      logger.debug("From: DASHBOARD (Admin/Moderator/Manager)");

      const contract = await Contract.findById(payData.contractId).populate(
        "customer"
      );

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const manager = await Employee.findById(user.sub);

      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi");
      }

      // 1. Barcha to'lovlarni olish
      const allPayments = await Payment.find({
        _id: { $in: contract.payments },
      }).sort({ date: 1 });

      // 2. To'langan oylik to'lovlar sonini hisoblash
      const paidMonthlyPayments = allPayments.filter(
        (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
      );

      const paidMonthsCount = paidMonthlyPayments.length;
      const totalMonths = contract.period;
      const remainingMonths = totalMonths - paidMonthsCount;

      logger.debug("📊 Payment analysis:", {
        totalMonths,
        paidMonthsCount,
        remainingMonths,
        monthlyPayment: contract.monthlyPayment,
      });

      if (remainingMonths <= 0) {
        throw BaseError.BadRequest("Barcha oylar allaqachon to'langan");
      }

      // ✅ YANGI: Qolgan qarzni hisoblash
      const expectedTotalAmount = contract.monthlyPayment * remainingMonths;
      const actualAmount = payData.amount;
      const difference = actualAmount - expectedTotalAmount;

      logger.debug("💵 Amount analysis:", {
        expectedTotal: expectedTotalAmount,
        actualAmount: actualAmount,
        difference: difference,
        isUnderpaid: difference < -0.01,
        isOverpaid: difference > 0.01,
      });

      // 3. Har bir to'lanmagan oy uchun to'lov yaratish
      const createdPayments = [];
      let remainingAmount = actualAmount;

      for (let i = 0; i < remainingMonths; i++) {
        const monthNumber = paidMonthsCount + i + 1;
        const isLastMonth = i === remainingMonths - 1;

        // ✅ Har bir oy uchun to'lov summasi
        let paymentAmount: number;
        let paymentStatus: PaymentStatus;
        let shortageAmount = 0;

        if (isLastMonth) {
          // Oxirgi oy - qolgan summani to'lash
          paymentAmount = remainingAmount;
        } else {
          // Oddiy oy - oylik to'lovni to'lash
          paymentAmount = Math.min(remainingAmount, contract.monthlyPayment);
        }

        // Status aniqlash
        if (paymentAmount >= contract.monthlyPayment - 0.01) {
          paymentStatus = PaymentStatus.PAID;
        } else {
          paymentStatus = PaymentStatus.UNDERPAID;
          shortageAmount = contract.monthlyPayment - paymentAmount;
        }

        // Notes yaratish
        let noteText = `${monthNumber}-oy to'lovi: ${paymentAmount.toFixed(
          2
        )} $ (Barchasini to'lash orqali)`;

        if (paymentStatus === PaymentStatus.UNDERPAID) {
          noteText += `\n⚠️ Kam to'landi: ${shortageAmount.toFixed(
            2
          )} $ yetishmayapti`;
        }

        const notes = await Notes.create({
          text: noteText,
          customer: contract.customer,
          createBy: String(manager._id),
        });

        // Payment yaratish
        // ✅ Bot'dan kelsa PENDING, Dashboard'dan kelsa PAID
        const payment = await Payment.create({
          amount: contract.monthlyPayment, // Kutilgan summa
          actualAmount: paymentAmount, // Haqiqatda to'langan summa
          date: new Date(),
          isPaid: true, // ✅ Dashboard - to'g'ridan-to'g'ri PAID
          paymentType: PaymentType.MONTHLY,
          paymentMethod: payData.paymentMethod, // ✅ YANGI: To'lov usuli
          customerId: contract.customer,
          managerId: String(manager._id),
          notes: notes._id,
          status: paymentStatus, // ✅ Dashboard - to'g'ridan-to'g'ri status
          expectedAmount: contract.monthlyPayment,
          remainingAmount: shortageAmount,
          confirmedAt: new Date(), // ✅ Dashboard - to'g'ridan-to'g'ri tasdiqlangan
          confirmedBy: user.sub, // ✅ Dashboard - kim tasdiqlagan
          targetMonth: monthNumber,
        });

        createdPayments.push(payment);

        // Contract.payments ga qo'shish
        if (!contract.payments) {
          contract.payments = [];
        }
        (contract.payments as any[]).push(payment._id);

        remainingAmount -= paymentAmount;

        logger.debug(`✅ Payment created for month ${monthNumber}:`, {
          id: payment._id,
          status: paymentStatus,
          amount: paymentAmount,
          expected: contract.monthlyPayment,
          shortage: shortageAmount,
        });
      }

      // ✅ Agar ortiqcha summa qolsa, prepaidBalance ga qo'shish
      if (remainingAmount > 0.01) {
        contract.prepaidBalance =
          (contract.prepaidBalance || 0) + remainingAmount;
        logger.debug(
          `💰 Prepaid balance updated: ${contract.prepaidBalance.toFixed(
            2
          )} $ (excess from pay all)`
        );
      }

      await contract.save();

      // 4. Balance yangilash (Dashboard - to'g'ridan-to'g'ri)
      await this.updateBalance(String(manager._id), {
        dollar: payData.currencyDetails.dollar || 0,
        sum: payData.currencyDetails.sum || 0,
      }, null);
      logger.debug("✅ Balance updated (from dashboard)");

      // 5. Debtor o'chirish (Dashboard - to'g'ridan-to'g'ri)
      const deletedDebtors = await Debtor.deleteMany({
        contractId: contract._id,
      });
      if (deletedDebtors.deletedCount > 0) {
        logger.debug("🗑️ Debtor(s) deleted:", deletedDebtors.deletedCount);
      }

      // 6. Contract completion tekshirish (Dashboard - to'g'ridan-to'g'ri)
      await this.checkContractCompletion(String(contract._id));

      // ✅ Response message (Dashboard - to'g'ridan-to'g'ri tasdiqlangan)
      const underpaidPayments = createdPayments.filter(
        (p) => p.status === PaymentStatus.UNDERPAID
      );
      const totalShortage = underpaidPayments.reduce(
        (sum, p) => sum + (p.remainingAmount || 0),
        0
      );

      let message = `${remainingMonths} oylik to'lovlar muvaffaqiyatli amalga oshirildi`;

      if (underpaidPayments.length > 0) {
        message += `\n⚠️ ${underpaidPayments.length
          } oyda kam to'landi (jami: ${totalShortage.toFixed(2)} $)`;
      }

      if (remainingAmount > 0.01) {
        message += `\n💰 ${remainingAmount.toFixed(
          2
        )} $ ortiqcha summa prepaid balance ga qo'shildi`;
      }

      // ✅ AUDIT LOG: Barcha oylarni to'lash
      try {
        logger.debug("📝 Creating audit log for payAllRemainingMonths...");

        if (!user || !user.sub) {
          logger.error("❌ Cannot create audit log: user.sub is missing", { user });
        } else if (createdPayments.length === 0) {
          logger.warn("⚠️ No payments created, skipping audit log");
        } else {
          const auditLogService = (await import("../../services/audit-log.service")).default;
          const { AuditAction, AuditEntity } = await import("../../schemas/audit-log.schema");

          // Har bir yaratilgan to'lov uchun audit log yozish
          for (const payment of createdPayments) {
            await auditLogService.createLog({
              action: AuditAction.PAYMENT,
              entity: AuditEntity.PAYMENT,
              entityId: payment._id.toString(),
              userId: user.sub,
              metadata: {
                paymentType: "pay_all_remaining",
                paymentStatus: payment.status,
                amount: payment.actualAmount || payment.amount,
                targetMonth: payment.targetMonth,
                affectedEntities: [
                  {
                    entityType: "contract",
                    entityId: contract._id.toString(),
                    entityName: contract.productName || "Contract",
                  },
                  {
                    entityType: "customer",
                    entityId: contract.customer._id?.toString() || contract.customer.toString(),
                    entityName: contract.customer.fullName,
                  }
                ]
              }
            });
          }

          logger.debug(`✅ Audit log created for ${createdPayments.length} payment(s) in payAllRemainingMonths`);
        }
      } catch (auditError) {
        logger.error("❌ Error creating audit log:", auditError);
      }

      return {
        status: "success",
        message: message,
        // Dashboard - to'g'ridan-to'g'ri tasdiqlangan
        contractId: contract._id,
        paymentsCreated: createdPayments.length,
        totalAmount: actualAmount,
        prepaidBalance: contract.prepaidBalance || 0,
      };
    } catch (error) {
      logger.error("❌ Error in payAllRemainingMonths:", error);
      throw error;
    }
  }

  /**
   * PENDING to'lovlarni tekshirish va muddati o'tganlarni avtomatik rad etish
   * Requirements: 9.1 - PENDING to'lovlar timeout
   *
   * ✅ 24 soatdan oshgan PENDING to'lovlarni avtomatik REJECTED qilish
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

      // PENDING to'lovlarni topish (24 soatdan oshgan)
      const expiredPayments = await Payment.find({
        status: PaymentStatus.PENDING,
        isPaid: false,
        createdAt: { $lt: timeoutDate },
      }).populate("notes");

      logger.debug(`📊 Found ${expiredPayments.length} expired PENDING payment(s)`);

      const rejectedPaymentIds: string[] = [];

      for (const payment of expiredPayments) {
        try {
          // Payment status'ni REJECTED qilish
          payment.status = PaymentStatus.REJECTED;
          await payment.save();

          // Notes'ga rad etish sababini qo'shish
          if (payment.notes) {
            const notes = await Notes.findById(payment.notes);
            if (notes) {
              notes.text += createAutoRejectionNote(TIMEOUT_HOURS);
              await notes.save();
            }
          }

          rejectedPaymentIds.push(payment._id.toString());

          logger.debug(
            `✅ Payment ${payment._id} automatically rejected (created at: ${payment.createdAt})`
          );

          // ❌ Telegram notification o'chirildi - avtomatik rad etish uchun notification kerak emas
          logger.info(`⏳ Payment auto-rejected (no notification sent): ${payment._id}`);
        } catch (error) {
          logger.error(`❌ Error rejecting payment ${payment._id}:`, error);
          // Davom etish (boshqa to'lovlarni rad etish)
        }
      }

      logger.debug(
        `✅ ${rejectedPaymentIds.length} payment(s) automatically rejected`
      );

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

export default new PaymentService();
