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

    const contract = await Contract.findOne({
      _id: existingDebtor.contractId._id,
      isDeleted: false,
      isActive: true
    }).populate('payments');

    if (!contract) {
      throw BaseError.NotFoundError("Shartnoma topilmadi");
    }


    const paidMonthlyPayments = (contract.payments as any[]).filter(
      (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
    );
    const calculatedTargetMonth = paidMonthlyPayments.length + 1;

    const amountPaid = payData.amount;
    const expectedDebtAmount = amountPaid;

    let calculatedExcessAmount = 0;
    let calculatedRemainingAmount = 0;
    let actualAmount = amountPaid;

    if (amountPaid > expectedDebtAmount) {
      calculatedExcessAmount = amountPaid - expectedDebtAmount;
      actualAmount = amountPaid; // To'liq summa actualAmount'da
    } else if (amountPaid < expectedDebtAmount) {
      calculatedRemainingAmount = expectedDebtAmount - amountPaid;
      actualAmount = amountPaid;
    } else {
      actualAmount = amountPaid;
    }

    if (calculatedRemainingAmount > 0) {
      if (!payData.nextPaymentDate) {
        throw BaseError.BadRequest(
          "Kam to'lov qilganda keyingi to'lov sanasi majburiy!"
        );
      }

      const nextDate = new Date(payData.nextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      nextDate.setHours(0, 0, 0, 0);

      if (nextDate <= today) {
        throw BaseError.BadRequest(
          "Keyingi to'lov sanasi bugundan keyingi kun bo'lishi kerak!"
        );
      }

    }

    const paymentDoc = await Payment.create({
      amount: expectedDebtAmount,
      actualAmount: actualAmount,
      date: new Date(),
      isPaid: false,
      paymentType: PaymentType.MONTHLY,
      notes: notes._id,
      customerId: customer,
      managerId: manager._id,
      status: PaymentStatus.PENDING,
      expectedAmount: expectedDebtAmount,
      excessAmount: calculatedExcessAmount,
      remainingAmount: calculatedRemainingAmount,
      targetMonth: payData.targetMonth || calculatedTargetMonth,
      nextPaymentDate: payData.nextPaymentDate ? new Date(payData.nextPaymentDate) : undefined,
    });

    // ✅ MUHIM: PENDING payment'ni contract'ga qo'shamiz (frontend uchun zarur!)
    // Frontend contract.payments arraydan o'qiyapti, shuning uchun PENDING ham bo'lishi kerak
    contract.payments.push(paymentDoc._id as any);
    await contract.save();


    return {
      status: "success",
      message: "To'lov qabul qilindi, kassa tasdiqlashi kutilmoqda",
      paymentId: paymentDoc._id,
      isPending: true,
    };
  }

  async payNewDebt(payData: PayNewDebtDto, user: IJwtUser) {
    const existingContract = await Contract.findOne({
      _id: payData.id,
      isDeleted: false,
      isActive: true
    }).populate('payments');

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

    const Payment = (await import("../../schemas/payment.schema")).default;
    const { PaymentType, PaymentStatus } = await import(
      "../../schemas/payment.schema"
    );

    const paidMonthlyPayments = (existingContract.payments as any[]).filter(
      (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
    );
    const calculatedTargetMonth = paidMonthlyPayments.length + 1;
    const amountPaid = payData.amount;
    const expectedMonthlyPayment = existingContract.monthlyPayment;

    let calculatedExcessAmount = 0;
    let calculatedRemainingAmount = 0;
    let actualAmount = amountPaid;

    if (amountPaid > expectedMonthlyPayment) {
      calculatedExcessAmount = amountPaid - expectedMonthlyPayment;
      actualAmount = amountPaid;
    } else if (amountPaid < expectedMonthlyPayment) {
      calculatedRemainingAmount = expectedMonthlyPayment - amountPaid;
      actualAmount = amountPaid;
    } else {
      actualAmount = amountPaid;
    }

    if (calculatedRemainingAmount > 0) {
      if (!payData.nextPaymentDate) {
        throw BaseError.BadRequest(
          "Kam to'lov qilganda keyingi to'lov sanasi majburiy!"
        );
      }

      const nextDate = new Date(payData.nextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      nextDate.setHours(0, 0, 0, 0);

      if (nextDate <= today) {
        throw BaseError.BadRequest(
          "Keyingi to'lov sanasi bugundan keyingi kun bo'lishi kerak!"
        );
      }

    }

    const finalTargetMonth = payData.targetMonth || calculatedTargetMonth;

    // ✅ TUZATISH: SCHEDULED yoki null statusli to'lovlarni topish
    // Dashboard'dan yaratilgan shartnomalarning to'lovlari SCHEDULED statusida bo'ladi
    const existingScheduledPayment = (existingContract.payments as any[]).find(
      (p) => Number(p.targetMonth) === Number(finalTargetMonth) &&
        p.paymentType === PaymentType.MONTHLY &&
        (p.status === PaymentStatus.SCHEDULED || p.status === null) &&  // ✅ SCHEDULED yoki null
        !p.isPaid
    );

    let paymentDoc;

    if (existingScheduledPayment) {
      // ✅ Mavjud SCHEDULED to'lovni PENDING ga o'zgartirish
      logger.info(`📅 Found existing SCHEDULED payment for month ${finalTargetMonth}, converting to PENDING`);

      paymentDoc = await Payment.findByIdAndUpdate(
        existingScheduledPayment._id,
        {
          amount: expectedMonthlyPayment,
          actualAmount: actualAmount,
          date: new Date(),
          notes: notes._id,
          managerId: manager._id,
          status: PaymentStatus.PENDING,  // ✅ SCHEDULED -> PENDING
          expectedAmount: expectedMonthlyPayment,
          excessAmount: calculatedExcessAmount,
          remainingAmount: calculatedRemainingAmount,
          nextPaymentDate: payData.nextPaymentDate ? new Date(payData.nextPaymentDate) : undefined,
        },
        { new: true }
      );

    } else {
      // Yangi to'lov yaratish (agar SCHEDULED to'lov topilmasa)
      paymentDoc = await Payment.create({
        amount: expectedMonthlyPayment,
        actualAmount: actualAmount,
        date: new Date(),
        isPaid: false,
        paymentType: PaymentType.MONTHLY,
        notes: notes._id,
        customerId: customer,
        managerId: manager._id,
        status: PaymentStatus.PENDING,
        expectedAmount: expectedMonthlyPayment,
        excessAmount: calculatedExcessAmount,
        remainingAmount: calculatedRemainingAmount,
        targetMonth: finalTargetMonth,
        nextPaymentDate: payData.nextPaymentDate ? new Date(payData.nextPaymentDate) : undefined,
      });

      existingContract.payments.push(paymentDoc._id as any);
      await existingContract.save();
    }

    if (!paymentDoc) {
      throw BaseError.InternalServerError("To'lov yaratishda xatolik yuz berdi");
    }

    return {
      status: "success",
      message: "To'lov qabul qilindi, kassa tasdiqlashi kutilmoqda",
      paymentId: paymentDoc._id,
      isPending: true,
    };
  }


  async getMyPendingPayments(user: IJwtUser) {
    try {

      const pendingPayments = await Payment.find({
        managerId: user.sub,
        status: PaymentStatus.PENDING,
        isPaid: false,
      })
        .populate({
          path: "customerId",
          select: "fullName phoneNumber",
        })
        .populate({
          path: "notes",
          select: "text",
        })
        .sort({ createdAt: -1 });


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
            name: customer.fullName,
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
      throw BaseError.InternalServerError("Statistikani olishda xatolik");
    }
  }

  async setPaymentReminder(
    contractId: string,
    targetMonth: number,
    reminderDate: string,
    user: IJwtUser,
    reminderComment?: string
  ) {
    try {

      const contract = await Contract.findOne({
        _id: contractId,
        isDeleted: false,
        isActive: true
      })
        .populate("payments")
        .populate("customer");

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const customer = contract.customer as any;
      const contractManagerId = customer?.manager?.toString();

      if (contractManagerId !== user.sub) {
        logger.warn(`403 Forbidden: Contract manager (${contractManagerId}) !== User (${user.sub})`);
        throw BaseError.ForbiddenError(
          "Siz faqat o'z mijozlaringizning shartnomalariga reminder qo'yishingiz mumkin"
        );
      }



      const payment = (contract.payments as any[]).find(
        (p: any) => {
          const monthMatch = Number(p.targetMonth) === Number(targetMonth);
          const typeMatch = p.paymentType === PaymentType.MONTHLY;

          return monthMatch && typeMatch;
        }
      );

      const reminder = new Date(reminderDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      reminder.setHours(0, 0, 0, 0);

      if (reminder < today) {
        throw BaseError.BadRequest("Eslatma sanasi bugundan oldingi kun bo'lmasligi kerak");
      }

      let paymentId: string;

      if (!payment) {

        const Notes = (await import("../../schemas/notes.schema")).default;
        const manager = await Employee.findById(user.sub);

        if (!manager) {
          throw BaseError.NotFoundError("Manager topilmadi");
        }

        const notes = new Notes({
          text: `${targetMonth}-oy uchun eslatma belgilandi`,
          customer: customer._id,
          createBy: manager._id,
        });
        await notes.save();

        const startDate = new Date(contract.startDate);
        const paymentDueDate = new Date(startDate);
        paymentDueDate.setMonth(paymentDueDate.getMonth() + targetMonth);

        const newPayment = await Payment.create({
          amount: contract.monthlyPayment,
          date: paymentDueDate,
          isPaid: false,
          paymentType: PaymentType.MONTHLY,
          notes: notes._id,
          customerId: customer._id,
          managerId: manager._id,
          status: null,
          expectedAmount: contract.monthlyPayment,
          targetMonth: targetMonth,
          reminderDate: reminder,
          reminderComment: reminderComment || null,
        });
        
        // ✅ YANGI: Kassaga eslatma notification yaratish
        const postponedDays = Math.ceil(
          (reminder.getTime() - paymentDueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // ✅ YANGI: Faqat manager izohi (agar bor bo'lsa)
        const notesText = reminderComment || 'Eslatma (izoh yo\'q)';
        
        const reminderNotes = new Notes({
          text: notesText,
          customer: customer._id,
          createBy: user.sub,
        });
        await reminderNotes.save();
        
        await Payment.create({
          amount: 0, // Summa yo'q - bu eslatma
          actualAmount: 0,
          date: reminder, // Eslatma sanasi
          isPaid: false,
          paymentType: PaymentType.MONTHLY,
          notes: reminderNotes._id,
          customerId: customer._id,
          managerId: user.sub,
          status: PaymentStatus.PENDING,
          expectedAmount: 0,
          targetMonth: targetMonth,
          reminderDate: reminder,
          reminderComment: reminderComment || null,
          postponedDays: postponedDays,
          isReminderNotification: true, // ✅ Bu eslatma notification
        });

        // Contract'ga payment qo'shish
        contract.payments.push(newPayment._id as any);
        await contract.save();

        paymentId = newPayment._id.toString();
      } else {
        if (payment.isPaid) {
          throw BaseError.BadRequest("To'langan to'lovga reminder qo'yib bo'lmaydi");
        }

        // Mavjud payment'ni yangilash
        paymentId = (payment as any)._id;
        await Payment.findByIdAndUpdate(paymentId, {
          reminderDate: reminder,
          reminderComment: reminderComment || null,
        });
        
        // ✅ YANGI: Kassaga eslatma notification yaratish
        const paymentDate = new Date((payment as any).date);
        const postponedDays = Math.ceil(
          (reminder.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // ✅ YANGI: Faqat manager izohi (agar bor bo'lsa)
        const notesText = reminderComment || 'Eslatma (izoh yo\'q)';
        
        const reminderNotes = new Notes({
          text: notesText,
          customer: customer._id,
          createBy: user.sub,
        });
        await reminderNotes.save();
        
        // Oldingi eslatma notification'ni o'chirish (agar bor bo'lsa)
        await Payment.deleteMany({
          customerId: customer._id,
          targetMonth: targetMonth,
          isReminderNotification: true,
          isPaid: false,
        });
        
        await Payment.create({
          amount: 0, // Summa yo'q - bu eslatma
          actualAmount: 0,
          date: reminder, // Eslatma sanasi
          isPaid: false,
          paymentType: PaymentType.MONTHLY,
          notes: reminderNotes._id,
          customerId: customer._id,
          managerId: user.sub,
          status: PaymentStatus.PENDING,
          expectedAmount: 0,
          targetMonth: targetMonth,
          reminderDate: reminder,
          reminderComment: reminderComment || null,
          postponedDays: postponedDays,
          isReminderNotification: true, // ✅ Bu eslatma notification
        });

      }

      return {
        status: "success",
        message: "Eslatma muvaffaqiyatli belgilandi",
        reminderDate: reminder,
      };
    } catch (error) {
      throw error;
    }
  }


  async removePaymentReminder(
    contractId: string,
    targetMonth: number,
    user: IJwtUser
  ) {
    try {

      const contract = await Contract.findOne({
        _id: contractId,
        isDeleted: false,
        isActive: true
      })
        .populate("payments")
        .populate("customer");

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const customer = contract.customer as any;
      const contractManagerId = customer?.manager?.toString();

      if (contractManagerId !== user.sub) {
        logger.warn(`403 Forbidden: Contract manager (${contractManagerId}) !== User (${user.sub})`);
        throw BaseError.ForbiddenError(
          "Siz faqat o'z mijozlaringizning shartnomalaridan reminder o'chirishingiz mumkin"
        );
      }


      const payment = (contract.payments as any[]).find(
        (p: any) => Number(p.targetMonth) === Number(targetMonth) && p.paymentType === PaymentType.MONTHLY
      );


      if (!payment) {
        return {
          status: "success",
          message: "Eslatma topilmadi (hali belgilanmagan)",
        };
      }

      // Agar reminderDate mavjud bo'lmasa ham, muvaffaqiyat qaytaramiz
      if (!payment.reminderDate) {
        return {
          status: "success",
          message: "Eslatma topilmadi (hali belgilanmagan)",
        };
      }

      const paymentId = (payment as any)._id;
      await Payment.findByIdAndUpdate(paymentId, {
        $unset: { reminderDate: 1, reminderComment: 1 },
      });

      // ✅ YANGI: Kassadagi eslatma notification'ni ham o'chirish
      await Payment.deleteMany({
        customerId: customer._id,
        targetMonth: targetMonth,
        isReminderNotification: true,
        isPaid: false,
      });

      return {
        status: "success",
        message: "Eslatma o'chirildi",
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bot uchun: Qolgan qarzni to'lash (PENDING status bilan)
   * Dashboard service'dan farqi - to'lovlar kassaga yuboriladi
   */
  async payRemaining(data: any, user: IJwtUser) {
    try {
      const contract = await Contract.findOne({
        _id: data.contractId,
        isDeleted: false,
        isActive: true
      }).populate("payments").populate("customer");

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const manager = await Employee.findById(user.sub);
      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi");
      }

      // Hozirgi oyni topish
      const allPayments = contract.payments as any[];
      const paidPayments = allPayments.filter(
        (p) => p.paymentType === PaymentType.MONTHLY && p.isPaid
      );
      const currentMonth = paidPayments.length + 1;

      // Hozirgi oy uchun to'lovni topish
      const existingPayment = allPayments.find(
        (p) => p.targetMonth === currentMonth && p.paymentType === PaymentType.MONTHLY
      );

      if (!existingPayment) {
        throw BaseError.NotFoundError("Hozirgi oy uchun to'lov topilmadi");
      }

      if (existingPayment.isPaid) {
        throw BaseError.BadRequest("Bu to'lov allaqachon to'langan");
      }

      // Qolgan qarzni hisoblash
      const remainingAmount = existingPayment.remainingAmount || existingPayment.amount;
      const amountPaid = data.amount;

      if (amountPaid <= 0) {
        throw BaseError.BadRequest("To'lov summasi 0 dan katta bo'lishi kerak");
      }

      // Notes yaratish
      const notes = new Notes({
        text: data.notes || `${currentMonth}-oy uchun qolgan qarz to'landi`,
        customer: contract.customer,
        createBy: manager._id,
      });
      await notes.save();

      // To'lovni PENDING statusga o'zgartirish
      existingPayment.actualAmount = (existingPayment.actualAmount || 0) + amountPaid;
      existingPayment.status = PaymentStatus.PENDING;
      existingPayment.notes = notes._id;
      existingPayment.managerId = manager._id;
      
      // Yangi qolgan qarzni hisoblash
      const newRemainingAmount = remainingAmount - amountPaid;
      const excessAmount = amountPaid > remainingAmount ? amountPaid - remainingAmount : 0;

      existingPayment.remainingAmount = Math.max(0, newRemainingAmount);
      existingPayment.excessAmount = (existingPayment.excessAmount || 0) + excessAmount;

      await existingPayment.save();

      return {
        status: "success",
        message: "To'lov qabul qilindi, kassa tasdiqlashi kutilmoqda",
        paymentId: existingPayment._id,
        isPending: true,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bot uchun: Barcha qolgan oylarni to'lash (PENDING status bilan)
   */
  async payAllRemaining(data: any, user: IJwtUser) {
    try {
      const contract = await Contract.findOne({
        _id: data.contractId,
        isDeleted: false,
        isActive: true
      }).populate("payments").populate("customer");

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      const manager = await Employee.findById(user.sub);
      if (!manager) {
        throw BaseError.NotFoundError("Manager topilmadi");
      }

      const allPayments = contract.payments as any[];
      const unpaidPayments = allPayments.filter(
        (p) => p.paymentType === PaymentType.MONTHLY && !p.isPaid
      );

      if (unpaidPayments.length === 0) {
        throw BaseError.BadRequest("Barcha to'lovlar allaqachon to'langan");
      }

      // Qolgan qarzni hisoblash
      const totalRemaining = unpaidPayments.reduce(
        (sum, p) => sum + (p.remainingAmount || p.amount),
        0
      );

      const amountPaid = data.amount;

      if (amountPaid <= 0) {
        throw BaseError.BadRequest("To'lov summasi 0 dan katta bo'lishi kerak");
      }

      // Notes yaratish
      const notes = new Notes({
        text: data.notes || `Barcha qolgan oylar uchun to'lov`,
        customer: contract.customer,
        createBy: manager._id,
      });
      await notes.save();

      // Barcha to'lovlarni PENDING statusga o'zgartirish
      let remainingToPay = amountPaid;
      const updatedPayments = [];

      for (const payment of unpaidPayments) {
        if (remainingToPay <= 0) break;

        const paymentDue = payment.remainingAmount || payment.amount;
        const paymentAmount = Math.min(remainingToPay, paymentDue);

        payment.actualAmount = (payment.actualAmount || 0) + paymentAmount;
        payment.status = PaymentStatus.PENDING;
        payment.notes = notes._id;
        payment.managerId = manager._id;
        payment.remainingAmount = Math.max(0, paymentDue - paymentAmount);
        
        if (paymentAmount > paymentDue) {
          payment.excessAmount = (payment.excessAmount || 0) + (paymentAmount - paymentDue);
        }

        await payment.save();
        updatedPayments.push(payment._id);
        remainingToPay -= paymentAmount;
      }

      return {
        status: "success",
        message: `${updatedPayments.length} oylik to'lovlar qabul qilindi, kassa tasdiqlashi kutilmoqda`,
        paymentIds: updatedPayments,
        isPending: true,
      };
    } catch (error) {
      throw error;
    }
  }
}

export default new PaymentService();
