import Contract from "../../schemas/contract.schema";
import Employee, { IEmployee } from "../../schemas/employee.schema";
import IJwtUser from "../../types/user";
import Payment, { IPayment, PaymentStatus, PaymentType } from "../../schemas/payment.schema";
import { Debtor } from "../../schemas/debtor.schema";
import BaseError from "../../utils/base.error";
import { PayDebtDto, PayNewDebtDto } from "../../validators/payment";
import Notes from "../../schemas/notes.schema";
import { Balance } from "../../schemas/balance.schema";
import logger from "../../utils/logger";

class PaymentService {
  async updateBalance(
    managerId: IEmployee,
    changes: {
      dollar?: number;
      sum?: number;
    }
  ) {
    const balance = await Balance.findOne({ managerId });

    if (!balance) {
      return await Balance.create({
        managerId,
        ...changes,
      });
    }

    balance.dollar += changes.dollar || 0;
    if (balance.sum !== undefined && changes.sum !== undefined) {
      balance.sum += changes.sum;
    }

    return await balance.save();
  }

  async payDebt(payData: PayDebtDto, user: IJwtUser) {
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

    const notes = new Notes({
      text: payData.notes || "To'lov amalga oshirildi", // Default text agar notes bo'sh bo'lsa
      customer,
      createBy: manager,
    });
    await notes.save();

    // ⏳ YANGI LOGIKA - To'lovlar PENDING statusda yaratiladi (kassa tasdiqlashi kerak)
    const Payment = (await import("../../schemas/payment.schema")).default;
    const { PaymentType, PaymentStatus } = await import(
      "../../schemas/payment.schema"
    );
    const Contract = (await import("../../schemas/contract.schema")).default;

    const contract = await Contract.findById(existingDebtor.contractId._id).populate('payments');

    if (!contract) {
      throw BaseError.NotFoundError("Shartnoma topilmadi");
    }

    // ✅ TUZATISH: targetMonth'ni to'g'ri hisoblash
    // To'langan oylik to'lovlar sonini hisoblash
    const paidMonthlyPayments = (contract.payments as any[]).filter(
      (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
    );
    const calculatedTargetMonth = paidMonthlyPayments.length + 1;
    
    logger.debug(`📊 Debtor payment - calculated target month: ${calculatedTargetMonth}`, {
      paidMonths: paidMonthlyPayments.length,
      totalPeriod: contract.period,
      providedTargetMonth: payData.targetMonth,
    });

    // ✅ TUZATISH: Qarzdorlik uchun expectedAmount = debtor.debtAmount
    const amountPaid = payData.amount;
    // ✅ TUZATISH: amountPaid aslida frontend'dan kelgan remainingAmount (qarzning o'zi)
    // Masalan: Oylik $100, to'landi $60 → remainingAmount: $48 (bu amountPaid ga teng)
    const expectedDebtAmount = amountPaid; // ✅ Frontend'dan kelgan qarz summasi

    let calculatedExcessAmount = 0;
    let calculatedRemainingAmount = 0;
    let actualAmount = amountPaid; // ✅ Haqiqatda to'langan summa

    if (amountPaid > expectedDebtAmount) {
      // ✅ Ortiqcha to'lov: faqat qarzga teng qismni amount sifatida saqlash
      calculatedExcessAmount = amountPaid - expectedDebtAmount;
      actualAmount = amountPaid; // To'liq summa actualAmount'da
    } else if (amountPaid < expectedDebtAmount) {
      // ✅ Kam to'lov: qolgan qarzni remainingAmount'da saqlash
      calculatedRemainingAmount = expectedDebtAmount - amountPaid;
      actualAmount = amountPaid;
    } else {
      actualAmount = amountPaid;
    }

    logger.debug("💰 Debtor payment calculation:", {
      amountPaid,
      expectedDebtAmount,
      actualAmount,
      excessAmount: calculatedExcessAmount,
      remainingAmount: calculatedRemainingAmount,
      debtorDebtAmount: existingDebtor.debtAmount,
    });

    // ✅ YANGI: Kam to'lov bo'lsa, nextPaymentDate MAJBURIY
    if (calculatedRemainingAmount > 0) {
      if (!payData.nextPaymentDate) {
        throw BaseError.BadRequest(
          "Kam to'lov qilganda keyingi to'lov sanasi majburiy!"
        );
      }
      
      // ✅ Validation: nextPaymentDate must be in future
      const nextDate = new Date(payData.nextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      nextDate.setHours(0, 0, 0, 0);
      
      if (nextDate <= today) {
        throw BaseError.BadRequest(
          "Keyingi to'lov sanasi bugundan keyingi kun bo'lishi kerak!"
        );
      }
      
      logger.debug(`✅ nextPaymentDate validated: ${nextDate.toISOString()}`);
    }

    const paymentDoc = await Payment.create({
      amount: expectedDebtAmount, // ✅ Qarzning asl summasi (masalan $48) - KASSADA SHU KO'RINADI
      actualAmount: actualAmount, // ✅ Haqiqatda to'langan summa (masalan $48 yoki ko'proq)
      date: new Date(),
      isPaid: false,
      paymentType: PaymentType.MONTHLY,
      notes: notes._id,
      customerId: customer,
      managerId: manager._id,
      status: PaymentStatus.PENDING,
      expectedAmount: expectedDebtAmount, // Kutilgan qarz ($48)
      excessAmount: calculatedExcessAmount, // Hisoblangan ortiqcha (agar ko'p to'lasa)
      remainingAmount: calculatedRemainingAmount, // Hisoblangan kam to'langan (agar kam to'lasa)
      targetMonth: payData.targetMonth || calculatedTargetMonth, // ✅ Frontend'dan yoki backend'da hisoblangan
      nextPaymentDate: payData.nextPaymentDate ? new Date(payData.nextPaymentDate) : undefined, // ✅ YANGI
    });

    // ✅ MUHIM: PENDING payment'ni contract'ga qo'shamiz (frontend uchun zarur!)
    // Frontend contract.payments arraydan o'qiyapti, shuning uchun PENDING ham bo'lishi kerak
    contract.payments.push(paymentDoc._id as any);
    await contract.save();
    
    logger.info("⏳ Payment created in PENDING status and added to contract.payments");
    logger.info("⏳ Waiting for cash confirmation");
    logger.info("⏳ Contract.payments will be updated after confirmation (isPaid, status)");
    
    // ❌ Balance yangilanmaydi - faqat kassa tasdiqlanganda
    // ❌ Debtor o'chirilmaydi - faqat kassa tasdiqlanganda
    // ❌ nextPaymentDate yangilanmaydi - faqat kassa tasdiqlanganda

    return {
      status: "success",
      message: "To'lov qabul qilindi, kassa tasdiqlashi kutilmoqda",
      paymentId: paymentDoc._id,
      isPending: true, // ⏳ Kassa tasdiqlashi kerak
    };
  }

  async payNewDebt(payData: PayNewDebtDto, user: IJwtUser) {
    const existingContract = await Contract.findById(payData.id).populate('payments');

    if (!existingContract) {
      throw BaseError.NotFoundError("Shartnoma topilmadi yoki o'chirilgan");
    }
    const customer = existingContract.customer;
    const manager = await Employee.findById(user.sub);

    if (!manager) {
      throw BaseError.NotFoundError("Menejer topilmadi yoki o'chirilgan");
    }

    const notes = new Notes({
      text: payData.notes || "To'lov amalga oshirildi", // Default text agar notes bo'sh bo'lsa
      customer: customer,
      createBy: manager,
    });
    await notes.save();

    // ⏳ YANGI LOGIKA - To'lovlar PENDING statusda yaratiladi (kassa tasdiqlashi kerak)
    const Payment = (await import("../../schemas/payment.schema")).default;
    const { PaymentType, PaymentStatus } = await import(
      "../../schemas/payment.schema"
    );

    // ✅ TUZATISH: targetMonth'ni to'g'ri hisoblash
    // To'langan oylik to'lovlar sonini hisoblash
    const paidMonthlyPayments = (existingContract.payments as any[]).filter(
      (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
    );
    const calculatedTargetMonth = paidMonthlyPayments.length + 1;
    
    logger.debug(`📊 New debt payment - calculated target month: ${calculatedTargetMonth}`, {
      paidMonths: paidMonthlyPayments.length,
      totalPeriod: existingContract.period,
      providedTargetMonth: payData.targetMonth,
    });

    // ✅ TUZATISH: Ortiqcha/kam summani hisoblash
    const amountPaid = payData.amount;
    const expectedMonthlyPayment = existingContract.monthlyPayment;

    let calculatedExcessAmount = 0;
    let calculatedRemainingAmount = 0;
    let actualAmount = amountPaid; // ✅ Haqiqatda to'langan summa

    if (amountPaid > expectedMonthlyPayment) {
      // ✅ Ortiqcha to'lov: faqat oylik to'lovga teng qismni amount sifatida saqlash
      calculatedExcessAmount = amountPaid - expectedMonthlyPayment;
      actualAmount = amountPaid; // To'liq summa actualAmount'da
    } else if (amountPaid < expectedMonthlyPayment) {
      calculatedRemainingAmount = expectedMonthlyPayment - amountPaid;
      actualAmount = amountPaid;
    } else {
      actualAmount = amountPaid;
    }

    logger.info("💰 BOT Payment calculation (payNewDebt):", {
      amountPaid,
      expectedMonthlyPayment,
      actualAmount,
      excessAmount: calculatedExcessAmount,
      remainingAmount: calculatedRemainingAmount,
      targetMonth: payData.targetMonth || calculatedTargetMonth,
    });

    // ✅ YANGI: Kam to'lov bo'lsa, nextPaymentDate MAJBURIY
    if (calculatedRemainingAmount > 0) {
      if (!payData.nextPaymentDate) {
        throw BaseError.BadRequest(
          "Kam to'lov qilganda keyingi to'lov sanasi majburiy!"
        );
      }
      
      // ✅ Validation: nextPaymentDate must be in future
      const nextDate = new Date(payData.nextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      nextDate.setHours(0, 0, 0, 0);
      
      if (nextDate <= today) {
        throw BaseError.BadRequest(
          "Keyingi to'lov sanasi bugundan keyingi kun bo'lishi kerak!"
        );
      }
      
      logger.debug(`✅ nextPaymentDate validated: ${nextDate.toISOString()}`);
    }

    const paymentDoc = await Payment.create({
      amount: expectedMonthlyPayment, // ✅ Kutilgan oylik to'lov (faqat 148$)
      actualAmount: actualAmount, // ✅ Haqiqatda to'langan summa (296$)
      date: new Date(),
      isPaid: false,
      paymentType: PaymentType.MONTHLY,
      notes: notes._id,
      customerId: customer,
      managerId: manager._id,
      status: PaymentStatus.PENDING, // PENDING - kassaga tushadi
      expectedAmount: expectedMonthlyPayment, // Kutilgan oylik to'lov
      excessAmount: calculatedExcessAmount, // Hisoblangan ortiqcha (148$)
      remainingAmount: calculatedRemainingAmount, // Hisoblangan kam to'langan
      targetMonth: payData.targetMonth || calculatedTargetMonth, // ✅ Frontend'dan yoki backend'da hisoblangan
      nextPaymentDate: payData.nextPaymentDate ? new Date(payData.nextPaymentDate) : undefined, // ✅ YANGI
    });

    // ✅ MUHIM: PENDING payment'ni contract'ga qo'shamiz (frontend uchun zarur!)
    // Frontend contract.payments arraydan o'qiyapti, shuning uchun PENDING ham bo'lishi kerak
    existingContract.payments.push(paymentDoc._id as any);
    await existingContract.save();
    
    logger.info("⏳ Payment created in PENDING status and added to contract.payments");
    logger.info("⏳ Waiting for cash confirmation");
    logger.info("⏳ Contract.payments will be updated after confirmation (isPaid, status)");

    // ❌ Balance yangilanmaydi - faqat kassa tasdiqlanganda
    // ❌ nextPaymentDate yangilanmaydi - faqat kassa tasdiqlanganda

    return {
      status: "success",
      message: "To'lov qabul qilindi, kassa tasdiqlashi kutilmoqda",
      paymentId: paymentDoc._id,
      isPending: true, // ⏳ Kassa tasdiqlashi kerak
    };
  }


  /**
   * Manager'ning PENDING to'lovlarini olish
   * Requirements: A5 - Backend API
   */
  async getMyPendingPayments(user: IJwtUser) {
    try {
      logger.debug("📋 === GETTING MY PENDING PAYMENTS ===");
      logger.debug("Manager ID:", user.sub);

      const pendingPayments = await Payment.find({
        managerId: user.sub,
        status: PaymentStatus.PENDING,
        isPaid: false,
      })
        .populate({
          path: "customerId",
          select: "firstName lastName phone",
        })
        .populate({
          path: "notes",
          select: "text",
        })
        .sort({ createdAt: -1 });

      logger.debug(`✅ Found ${pendingPayments.length} PENDING payment(s)`);

      const formattedPayments = pendingPayments.map((payment) => {
        const customer = payment.customerId as any;
        const notes = payment.notes as any;

        return {
          _id: payment._id,
          amount: payment.amount,
          actualAmount: payment.actualAmount,
          expectedAmount: payment.expectedAmount,
          remainingAmount: payment.remainingAmount,
          excessAmount: payment.excessAmount,
          status: payment.status,
          createdAt: payment.createdAt,
          customer: {
            _id: customer._id,
            name: `${customer.firstName} ${customer.lastName || ""}`.trim(),
            phone: customer.phone,
          },
          notes: notes?.text || "",
          hoursAgo: payment.createdAt
            ? Math.floor(
                (Date.now() - new Date(payment.createdAt).getTime()) /
                  (1000 * 60 * 60)
              )
            : 0,
        };
      });

      return {
        status: "success",
        count: formattedPayments.length,
        payments: formattedPayments,
      };
    } catch (error) {
      logger.error("❌ Error getting my pending payments:", error);
      throw BaseError.InternalServerError(
        "PENDING to'lovlarni olishda xatolik"
      );
    }
  }

  /**
   * PENDING to'lovlar statistikasi
   */
  async getMyPendingStats(user: IJwtUser) {
    try {
      logger.debug("📊 === GETTING MY PENDING STATS ===");

      const pendingPayments = await Payment.find({
        managerId: user.sub,
        status: PaymentStatus.PENDING,
        isPaid: false,
      });

      const totalAmount = pendingPayments.reduce(
        (sum, p) => sum + (p.actualAmount || 0),
        0
      );

      const now = Date.now();
      const lessThan12h = pendingPayments.filter(
        (p) =>
          p.createdAt &&
          now - new Date(p.createdAt).getTime() < 12 * 60 * 60 * 1000
      ).length;

      const moreThan12h = pendingPayments.filter(
        (p) =>
          p.createdAt &&
          now - new Date(p.createdAt).getTime() >= 12 * 60 * 60 * 1000 &&
          now - new Date(p.createdAt).getTime() < 24 * 60 * 60 * 1000
      ).length;

      const moreThan24h = pendingPayments.filter(
        (p) =>
          p.createdAt &&
          now - new Date(p.createdAt).getTime() >= 24 * 60 * 60 * 1000
      ).length;

      return {
        status: "success",
        stats: {
          total: pendingPayments.length,
          totalAmount: totalAmount,
          lessThan12h: lessThan12h,
          moreThan12h: moreThan12h,
          moreThan24h: moreThan24h,
        },
      };
    } catch (error) {
      logger.error("❌ Error getting pending stats:", error);
      throw BaseError.InternalServerError("Statistikani olishda xatolik");
    }
  }
}

export default new PaymentService();
