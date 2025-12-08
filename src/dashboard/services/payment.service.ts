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

interface PaymentDto {
  contractId: string;
  amount: number;
  notes?: string;
  currencyDetails: {
    dollar: number;
    sum: number;
  };
  currencyCourse: number;
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
    
    if (excessAmount <= 0.01) {
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
      let paymentStatus: PaymentStatus;
      if (paymentAmount >= monthlyPayment - 0.01) {
        paymentStatus = PaymentStatus.PAID;
      } else {
        paymentStatus = PaymentStatus.UNDERPAID;
      }

      // Notes yaratish
      const notes = await Notes.create({
        text: `${monthNumber}-oy to'lovi (ortiqcha summadan): ${paymentAmount.toFixed(
          2
        )} $${
          shortageAmount > 0
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
    if (remainingExcess > 0.01) {
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
      let actualAmount = data.amount;
      const prepaidBalanceBefore = contract.prepaidBalance || 0;
      let prepaidUsed = 0;

      // Agar prepaid balance mavjud bo'lsa va to'lov kam bo'lsa
      if (prepaidBalanceBefore > 0.01 && actualAmount < expectedAmount) {
        const shortage = expectedAmount - actualAmount;
        const canUsePrepaid = Math.min(shortage, prepaidBalanceBefore);
        
        actualAmount += canUsePrepaid;
        prepaidUsed = canUsePrepaid;
        
        logger.debug(`💎 PREPAID BALANCE USED: ${canUsePrepaid.toFixed(2)} $ (balance: ${prepaidBalanceBefore.toFixed(2)} $)`);
        logger.debug(`💵 Total amount after prepaid: ${actualAmount.toFixed(2)} $`);
      }

      // ✅ TO'LOV TAHLILI - Kam yoki ko'p to'langanini aniqlash
      const difference = actualAmount - expectedAmount;

      let paymentStatus = PaymentStatus.PAID;
      let remainingAmount = 0;
      let excessAmount = 0;
      let prepaidAmount = 0;

      // Kam to'langan (UNDERPAID)
      if (difference < -0.01) {
        paymentStatus = PaymentStatus.UNDERPAID;
        remainingAmount = Math.abs(difference);
        logger.debug(
          `⚠️ UNDERPAID: ${remainingAmount.toFixed(2)} $ kam to'landi`
        );
      }
      // Ko'p to'langan (OVERPAID)
      else if (difference > 0.01) {
        paymentStatus = PaymentStatus.OVERPAID;
        excessAmount = difference;
        prepaidAmount = difference;
        logger.debug(`✅ OVERPAID: ${excessAmount.toFixed(2)} $ ko'p to'landi`);
      }
      // To'g'ri to'langan (PAID)
      else {
        logger.debug(`✓ EXACT PAYMENT: To'g'ri summa to'landi`);
      }

      // 1. Notes yaratish - to'lov holati haqida ma'lumot qo'shish
      let noteText = data.notes || `To'lov: ${data.amount} $`;

      // ✅ C2: Prepaid balance ishlatilganini ko'rsatish
      if (prepaidUsed > 0.01) {
        noteText += `\n💎 Prepaid balance ishlatildi: ${prepaidUsed.toFixed(2)} $`;
        noteText += `\n💵 Jami: ${actualAmount.toFixed(2)} $`;
      }

      if (paymentStatus === PaymentStatus.UNDERPAID) {
        noteText += `\n⚠️ Kam to'landi: ${remainingAmount.toFixed(2)} $ qoldi`;
      } else if (paymentStatus === PaymentStatus.OVERPAID) {
        noteText += `\n✅ Ko'p to'landi: ${excessAmount.toFixed(
          2
        )} $ ortiqcha (keyingi oyga o'tkaziladi)`;
      }

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
      if (prepaidUsed > 0.01) {
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
      let message = "To'lov muvaffaqiyatli qabul qilindi";
      
      // ✅ C2: Prepaid ishlatilganini ko'rsatish
      if (prepaidUsed > 0.01) {
        message += `\n💎 Prepaid balance ishlatildi: ${prepaidUsed.toFixed(2)} $`;
      }
      
      if (paymentStatus === PaymentStatus.UNDERPAID) {
        message = `To'lov qabul qilindi, lekin ${remainingAmount.toFixed(
          2
        )} $ kam to'landi`;
      } else if (paymentStatus === PaymentStatus.OVERPAID) {
        message = `To'lov qabul qilindi, ${excessAmount.toFixed(
          2
        )} $ ortiqcha summa keyingi oyga o'tkazildi`;
      }

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
      if (Math.abs(difference) < 0.01) {
        payment.status = PaymentStatus.PAID;
        payment.remainingAmount = 0;
        payment.excessAmount = 0;
      } else if (difference < -0.01) {
        payment.status = PaymentStatus.UNDERPAID;
        payment.remainingAmount = Math.abs(difference);
        payment.excessAmount = 0;
        logger.debug(`⚠️ UNDERPAID: ${payment.remainingAmount.toFixed(2)}$ kam to'landi`);
      } else {
        payment.status = PaymentStatus.OVERPAID;
        payment.excessAmount = difference;
        payment.remainingAmount = 0;
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
      });

      if (!contract) {
        throw BaseError.NotFoundError("Faol shartnoma topilmadi");
      }

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
      if (payment.excessAmount && payment.excessAmount > 0.01) {
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

      // 4. nextPaymentDate ni keyingi oyga o'tkazish (faqat oylik to'lovlar uchun)
      logger.debug("🔍 Checking nextPaymentDate update conditions:", {
        hasNextPaymentDate: !!contract.nextPaymentDate,
        paymentType: payment.paymentType,
        isMonthly: payment.paymentType === PaymentType.MONTHLY,
        PaymentTypeEnum: PaymentType.MONTHLY,
      });

      if (
        contract.nextPaymentDate &&
        payment.paymentType === PaymentType.MONTHLY
      ) {
        const currentDate = new Date(contract.nextPaymentDate);

        // ✅ MUHIM: Agar to'lov kechiktirilgan bo'lsa (postponed), asl sanaga qaytarish
        let nextMonth: Date;

        if (contract.previousPaymentDate && contract.postponedAt) {
          // Kechiktirilgan to'lov to'landi - asl to'lov kuniga qaytarish
          const originalDay =
            contract.originalPaymentDay ||
            new Date(contract.previousPaymentDate).getDate();

          // Hozirgi oydan keyingi oyni hisoblash
          const today = new Date();
          nextMonth = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            originalDay
          );

          logger.debug(
            "🔄 Kechiktirilgan to'lov to'landi - asl sanaga qaytarildi:",
            {
              postponedDate: currentDate.toLocaleDateString("uz-UZ"),
              originalPaymentDay: originalDay,
              nextDate: nextMonth.toLocaleDateString("uz-UZ"),
            }
          );

          // Kechiktirilgan ma'lumotlarni tozalash
          contract.previousPaymentDate = undefined;
          contract.postponedAt = undefined;
        } else {
          // Oddiy to'lov - asl to'lov kuniga qaytarish
          const originalDay =
            contract.originalPaymentDay || currentDate.getDate();

          // Hozirgi oydan keyingi oyni hisoblash
          const today = new Date();
          nextMonth = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            originalDay
          );

          logger.debug("📅 Oddiy to'lov - asl to'lov kuniga o'tkazildi:", {
            old: currentDate.toLocaleDateString("uz-UZ"),
            originalPaymentDay: originalDay,
            new: nextMonth.toLocaleDateString("uz-UZ"),
          });
        }

        logger.debug("📅 BEFORE UPDATE:", {
          currentNextPaymentDate: contract.nextPaymentDate,
          currentNextPaymentDateISO: contract.nextPaymentDate.toISOString(),
          newNextPaymentDate: nextMonth,
          newNextPaymentDateISO: nextMonth.toISOString(),
        });

        contract.nextPaymentDate = nextMonth;

        logger.debug("📅 AFTER UPDATE (before save):", {
          nextPaymentDate: contract.nextPaymentDate,
          nextPaymentDateISO: contract.nextPaymentDate.toISOString(),
          previousPaymentDate: contract.previousPaymentDate,
        });
      } else {
        logger.debug(
          "⏭️ Skipping nextPaymentDate update - conditions not met:",
          {
            hasNextPaymentDate: !!contract.nextPaymentDate,
            paymentType: payment.paymentType,
            expectedType: PaymentType.MONTHLY,
          }
        );
      }

      // Contract'ni saqlash (payments va nextPaymentDate)
      await contract.save();
      logger.debug("💾 Contract saved with updated nextPaymentDate");

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
            customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
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
   * Requirements: 7.1, 7.2, C3 - Filter support
   * 
   * @param customerId - Mijoz ID
   * @param contractId - Shartnoma ID
   * @param filters - Qo'shimcha filterlar (status, paymentType, dateRange)
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
    try {
      logger.debug("📜 Getting payment history for:", {
        customerId,
        contractId,
        filters,
      });

      // ✅ C3: Flexible filtering - faqat isPaid emas, status ham
      let matchCondition: any = {};

      // Default: faqat to'langan to'lovlar (agar filter berilmasa)
      if (filters?.isPaid !== undefined) {
        matchCondition.isPaid = filters.isPaid;
      } else if (!filters?.status) {
        // Agar status filter yo'q bo'lsa, default isPaid: true
        matchCondition.isPaid = true;
      }

      // ✅ C3: Status filter - PENDING, PAID, UNDERPAID, OVERPAID, REJECTED
      if (filters?.status && filters.status.length > 0) {
        matchCondition.status = { $in: filters.status };
      }

      // ✅ C3: Payment type filter - MONTHLY, INITIAL, EXTRA
      if (filters?.paymentType && filters.paymentType.length > 0) {
        matchCondition.paymentType = { $in: filters.paymentType };
      }

      // ✅ C3: Date range filter
      if (filters?.dateFrom || filters?.dateTo) {
        matchCondition.date = {};
        if (filters.dateFrom) {
          matchCondition.date.$gte = filters.dateFrom;
        }
        if (filters.dateTo) {
          matchCondition.date.$lte = filters.dateTo;
        }
      }

      if (customerId) {
        matchCondition.customerId = new Types.ObjectId(customerId);
      }

      if (contractId) {
        const contract = await Contract.findById(contractId);
        if (contract) {
          matchCondition.customerId = new Types.ObjectId(
            contract.customer.toString()
          );
        }
      }

      const payments = await Payment.aggregate([
        { $match: matchCondition },
        {
          $lookup: {
            from: "customers",
            localField: "customerId",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: "$customer" },
        {
          $lookup: {
            from: "employees",
            localField: "managerId",
            foreignField: "_id",
            as: "manager",
          },
        },
        { $unwind: "$manager" },
        {
          $lookup: {
            from: "notes",
            localField: "notes",
            foreignField: "_id",
            as: "notes",
          },
        },
        {
          $addFields: {
            customerName: {
              $concat: [
                "$customer.firstName",
                " ",
                { $ifNull: ["$customer.lastName", ""] },
              ],
            },
            managerName: {
              $concat: [
                "$manager.firstName",
                " ",
                { $ifNull: ["$manager.lastName", ""] },
              ],
            },
            notes: { $ifNull: [{ $arrayElemAt: ["$notes.text", 0] }, ""] },
          },
        },
        {
          $project: {
            _id: 1,
            amount: 1,
            date: 1,
            paymentType: 1,
            customerName: 1,
            managerName: 1,
            notes: 1,
            status: 1,
            actualAmount: 1,
            expectedAmount: 1,
            remainingAmount: 1,
            excessAmount: 1,
            isPaid: 1,
            confirmedAt: 1,
            createdAt: 1,
          },
        },
        { $sort: { date: -1 } },
      ]);

      logger.debug("✅ Found payments:", payments.length);
      logger.debug("✅ Filters applied:", matchCondition);

      return {
        status: "success",
        data: payments,
      };
    } catch (error) {
      logger.error("❌ Error getting payment history:", error);
      throw BaseError.InternalServerError("To'lovlar tarixini olishda xatolik");
    }
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
      if (currentRemaining < 0.01) {
        throw BaseError.BadRequest("Bu to'lovda qolgan qarz yo'q (to'liq to'langan)");
      }

      // ✅ Qo'shimcha tekshiruv: Status PAID bo'lsa va haqiqatan qarz yo'q bo'lsa
      if (existingPayment.status === PaymentStatus.PAID && currentRemaining < 0.01) {
        throw BaseError.BadRequest("Bu to'lov allaqachon to'liq to'langan");
      }

      // ⚠️ Agar status PAID lekin qarz bor bo'lsa - bu xato holat, davom ettiramiz
      if (existingPayment.status === PaymentStatus.PAID && currentRemaining >= 0.01) {
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
      if (paymentAmount > currentRemaining + 0.01) {
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
      if (excessAmount > 0.01) {
        existingPayment.excessAmount = excessAmount;
        existingPayment.status = PaymentStatus.OVERPAID;
        logger.debug(
          `✅ Payment status changed to OVERPAID (excess: ${excessAmount.toFixed(
            2
          )} $)`
        );
      }
      // 5. Status'ni yangilash
      else if (newRemainingAmount < 0.01) {
        existingPayment.status = PaymentStatus.PAID;
        existingPayment.isPaid = true;
        logger.debug("✅ Payment status changed to PAID");
      } else {
        logger.debug(`⚠️ Still UNDERPAID: ${newRemainingAmount} $ remaining`);
      }

      // ✅ TUZATISH: Bot'dan kelgan to'lovlar PENDING statusda saqlanishi kerak
      // Kassa tasdiqlashidan o'tishi kerak
      const isFromBot = user.role === RoleEnum.MANAGER || user.role === RoleEnum.SELLER;
      
      if (isFromBot) {
        // ✅ Bot'dan: PENDING statusda, kassa tasdiqlashi kerak
        existingPayment.status = PaymentStatus.PENDING;
        existingPayment.isPaid = false;
        logger.info("⏳ Payment status set to PENDING (from bot, awaiting cash confirmation)");
      }

      await existingPayment.save();

      // 6. Notes'ga qo'shish
      if (existingPayment.notes) {
        const notes = await Notes.findById(existingPayment.notes);
        if (notes) {
          notes.text += `\n\n💰 [${new Date().toLocaleDateString(
            "uz-UZ"
          )}] Qolgan qarz to'landi: ${paymentAmount} $`;
          if (payData.notes) {
            notes.text += `\nIzoh: ${payData.notes}`;
          }
          await notes.save();
        }
      }

      // ❌ TUZATISH: Bot'dan kelgan to'lovlar uchun balance yangilanmasin
      // ✅ Faqat kassa tasdiqlashidan keyin balance yangilanadi (confirmPayment'da)
      if (!isFromBot) {
        // 7. Balance yangilash (faqat web/dashboard'dan)
        await this.updateBalance(String(manager._id), {
          dollar: payData.currencyDetails.dollar || 0,
          sum: payData.currencyDetails.sum || 0,
        }, null);
        logger.debug("✅ Balance updated (from web/dashboard)");
      } else {
        logger.info("⏳ Balance NOT updated (awaiting cash confirmation)");
      }

      // 8. Contract topish va ortiqcha summani boshqarish
      const contract = await Contract.findOne({
        payments: existingPayment._id,
      });

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      // ❌ TUZATISH: Bot'dan kelgan to'lovlar uchun bu jarayonlar BAJARILMASIN
      // ✅ Faqat kassa tasdiqlashidan keyin bajariladi (confirmPayment'da)
      let createdPayments: any[] = [];
      
      if (!isFromBot) {
        // ✅ YANGI: Agar ortiqcha to'lov bo'lsa, keyingi oylar uchun avtomatik to'lovlar yaratish
        createdPayments = await this.processExcessPayment(
          excessAmount,
          contract,
          existingPayment,
          user
        );

        await contract.save();

        // 9. Agar to'liq to'langan bo'lsa, Debtor'ni o'chirish
        if (
          existingPayment.status === PaymentStatus.PAID ||
          existingPayment.status === PaymentStatus.OVERPAID
        ) {
          // Debtor'ni o'chirish
          const deletedDebtors = await Debtor.deleteMany({
            contractId: contract._id,
          });
          if (deletedDebtors.deletedCount > 0) {
            logger.debug("🗑️ Debtor(s) deleted:", deletedDebtors.deletedCount);
          }

          // Contract completion tekshirish
          await this.checkContractCompletion(String(contract._id));
        }
      } else {
        logger.info("⏳ Excess payment processing and debtor deletion will happen after cash confirmation");
      }

      logger.debug("✅ === PAY REMAINING COMPLETED ===");

      // ✅ Response'da qo'shimcha ma'lumot
      let message = "";
      
      // ✅ Bot'dan kelgan bo'lsa - kassa tasdiqlashi kerak
      if (isFromBot) {
        message = "To'lov qabul qilindi, kassa tasdiqlashi kutilmoqda";
        logger.info("⏳ Response: Payment pending cash confirmation");
      } else {
        // Web/Dashboard'dan - to'g'ridan-to'g'ri tasdiqlangan
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
      }

      return {
        status: "success",
        message: message,
        isPending: isFromBot, // ⏳ Bot'dan kelsa - PENDING
        paymentId: existingPayment._id, // ✅ Bot uchun kerak
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
    },
    user: IJwtUser
  ) {
    return withTransaction(async (session) => {
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

        // Payment yaratish
        const payment = await Payment.create({
          amount: monthlyPayment, // Kutilgan summa
          actualAmount: paymentAmount, // Haqiqatda to'langan summa
          date: new Date(),
          isPaid: true, // Dashboard darhol tasdiqlaydi
          paymentType: PaymentType.MONTHLY,
          customerId: contract.customer,
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
    },
    user: IJwtUser
  ) {
    try {
      // ✅ Bot'dan kelganini aniqlash
      const isFromBot = user.role === RoleEnum.MANAGER || user.role === RoleEnum.SELLER;
      
      logger.debug("💰 === PAY ALL REMAINING MONTHS ===");
      logger.debug("From:", isFromBot ? "BOT (Manager/Seller)" : "DASHBOARD (Admin/Kassa)");

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
          isPaid: isFromBot ? false : true, // ✅ Bot'dan: PENDING, Dashboard: PAID
          paymentType: PaymentType.MONTHLY,
          customerId: contract.customer,
          managerId: String(manager._id),
          notes: notes._id,
          status: isFromBot ? PaymentStatus.PENDING : paymentStatus, // ✅ Bot'dan: PENDING
          expectedAmount: contract.monthlyPayment,
          remainingAmount: shortageAmount,
          confirmedAt: isFromBot ? undefined : new Date(), // ✅ Faqat Dashboard'dan
          confirmedBy: isFromBot ? undefined : user.sub, // ✅ Faqat Dashboard'dan
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

      // ❌ Bot'dan kelgan to'lovlar uchun balance va debtor bilan ishlamaslik kerak
      // ✅ Faqat Dashboard'dan kelganda bajarish
      if (!isFromBot) {
        // 4. Balance yangilash (faqat Dashboard'dan)
        await this.updateBalance(String(manager._id), {
          dollar: payData.currencyDetails.dollar || 0,
          sum: payData.currencyDetails.sum || 0,
        }, null);
        logger.debug("✅ Balance updated (from dashboard)");

        // 5. Debtor o'chirish (faqat Dashboard'dan)
        const deletedDebtors = await Debtor.deleteMany({
          contractId: contract._id,
        });
        if (deletedDebtors.deletedCount > 0) {
          logger.debug("🗑️ Debtor(s) deleted:", deletedDebtors.deletedCount);
        }

        // 6. Contract completion tekshirish (faqat Dashboard'dan)
        await this.checkContractCompletion(String(contract._id));
      } else {
        logger.info("⏳ Balance, Debtor, Contract completion - will be handled after cash confirmation");
      }

      // ✅ Response'da qo'shimcha ma'lumot qaytarish
      let message = "";
      
      if (isFromBot) {
        // Bot'dan kelgan bo'lsa
        message = `${remainingMonths} oylik to'lovlar qabul qilindi, kassa tasdiqlashi kutilmoqda`;
        logger.info("⏳ Response: Payments pending cash confirmation");
      } else {
        // Dashboard'dan kelgan bo'lsa
        const underpaidPayments = createdPayments.filter(
          (p) => p.status === PaymentStatus.UNDERPAID
        );
        const totalShortage = underpaidPayments.reduce(
          (sum, p) => sum + (p.remainingAmount || 0),
          0
        );

        message = `${remainingMonths} oylik to'lovlar muvaffaqiyatli amalga oshirildi`;

        if (underpaidPayments.length > 0) {
          message += `\n⚠️ ${
            underpaidPayments.length
          } oyda kam to'landi (jami: ${totalShortage.toFixed(2)} $)`;
        }

        if (remainingAmount > 0.01) {
          message += `\n💰 ${remainingAmount.toFixed(
            2
          )} $ ortiqcha summa prepaid balance ga qo'shildi`;
        }
      }

      return {
        status: "success",
        message: message,
        isPending: isFromBot, // ⏳ Bot'dan kelsa - PENDING
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

      const TIMEOUT_HOURS = 24;
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
              notes.text += `\n\n[AVTOMATIK RAD ETILDI: ${TIMEOUT_HOURS} soat ichida kassa tomonidan tasdiqlanmadi - ${new Date().toLocaleString(
                "uz-UZ"
              )}]`;
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
