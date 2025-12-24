import Payment, {
  PaymentStatus,
  PaymentType,
} from "../../schemas/payment.schema";
import Notes from "../../schemas/notes.schema";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

/**
 * Payment Creator Helper
 * To'lov yaratish uchun yordamchi funksiyalar
 */
export class PaymentCreatorHelper {
  /**
   * Oylik to'lov yaratish
   * @param data - To'lov ma'lumotlari
   */
  static async createMonthlyPayment(data: {
    monthNumber: number;
    amount: number;
    actualAmount: number;
    monthlyPayment: number;
    customerId: any;
    managerId: any;
    user: IJwtUser;
    noteText?: string;
    isPaid?: boolean;
  }) {
    const {
      monthNumber,
      amount,
      actualAmount,
      monthlyPayment,
      customerId,
      managerId,
      user,
      noteText,
      isPaid = true,
    } = data;

    // Status aniqlash
    let paymentStatus: PaymentStatus;
    let shortageAmount = 0;

    if (actualAmount >= monthlyPayment - 0.01) {
      paymentStatus = PaymentStatus.PAID;
    } else {
      paymentStatus = PaymentStatus.UNDERPAID;
      shortageAmount = monthlyPayment - actualAmount;
    }

    // Notes yaratish
    let finalNoteText =
      noteText ||
      `${monthNumber}-oy to'lovi: ${actualAmount.toFixed(2)} $`;

    if (paymentStatus === PaymentStatus.UNDERPAID) {
      finalNoteText += `\n⚠️ Kam to'landi: ${shortageAmount.toFixed(
        2
      )} $ qoldi`;
    }

    const notes = await Notes.create({
      text: finalNoteText,
      customer: customerId,
      createBy: String(managerId),
    });

    // Payment yaratish
    const payment = await Payment.create({
      amount: monthlyPayment,
      actualAmount: actualAmount,
      date: new Date(),
      isPaid: isPaid,
      paymentType: PaymentType.MONTHLY,
      customerId: customerId,
      managerId: managerId,
      notes: notes._id,
      status: paymentStatus,
      expectedAmount: monthlyPayment,
      remainingAmount: shortageAmount,
      excessAmount: 0,
      confirmedAt: isPaid ? new Date() : undefined,
      confirmedBy: isPaid ? user.sub : undefined,
      targetMonth: monthNumber,
    });

    logger.debug(`✅ Payment created for month ${monthNumber}:`, {
      id: payment._id,
      status: paymentStatus,
      amount: actualAmount,
      expected: monthlyPayment,
      shortage: shortageAmount,
    });

    return payment;
  }

  /**
   * ✅ YANGI: Shartnoma uchun barcha oylik to'lovlarni oldindan yaratish
   * Bu to'lovlar database'da mavjud bo'ladi, lekin isPaid: false
   * Reminder belgilash mumkin bo'ladi
   * 
   * @param contractId - Shartnoma ID
   * @param period - Shartnoma muddati (oylar)
   * @param monthlyPayment - Oylik to'lov miqdori
   * @param startDate - Shartnoma boshlanish sanasi
   * @param customerId - Mijoz ID
   * @param managerId - Manager ID
   */
  static async createAllMonthlyPaymentsForContract(data: {
    contractId: any;
    period: number;
    monthlyPayment: number;
    startDate: Date;
    customerId: any;
    managerId: any;
  }) {
    const {
      contractId,
      period,
      monthlyPayment,
      startDate,
      customerId,
      managerId,
    } = data;

    logger.debug("📅 Creating all monthly payments for contract:", {
      contractId,
      period,
      monthlyPayment,
    });

    const payments = [];
    const start = new Date(startDate);

    for (let month = 1; month <= period; month++) {
      // Har bir oy uchun to'lov sanasini hisoblash
      const paymentDate = new Date(start);
      paymentDate.setMonth(paymentDate.getMonth() + month);

      // Notes yaratish (default)
      const notes = await Notes.create({
        text: `${month}-oy to'lovi (kutilmoqda)`,
        customer: customerId,
        createBy: String(managerId),
      });

      // Payment yaratish - isPaid: false
      // ✅ MUHIM: status PENDING emas, chunki bu hali to'lov jarayonida emas
      // Faqat kutilayotgan to'lov (scheduled payment)
      const payment = await Payment.create({
        amount: monthlyPayment,
        actualAmount: 0, // Hali to'lanmagan
        date: paymentDate, // ✅ MUHIM: Haqiqiy to'lov sanasi (o'zgarmasligi kerak!)
        isPaid: false,
        paymentType: PaymentType.MONTHLY,
        customerId: customerId,
        managerId: managerId,
        notes: notes._id,
        // ✅ TUZATISH: status undefined qolsin (default PENDING bo'ladi schema'da)
        // Lekin bu "kassa kutilmoqda" emas, balki "hali to'lanmagan"
        expectedAmount: monthlyPayment,
        remainingAmount: monthlyPayment, // To'liq summa qolgan
        excessAmount: 0,
        targetMonth: month, // ✅ MUHIM: Qaysi oy
        reminderDate: null, // ✅ Manager belgilashi mumkin
      });

      payments.push(payment);

      logger.debug(`  ✓ Payment created for month ${month}: ${payment._id}`);
    }

    logger.debug(`✅ Created ${payments.length} payment(s) for contract ${contractId}`);

    return payments;
  }

  /**
   * Bir nechta oylik to'lovlar yaratish
   * @param data - To'lovlar ma'lumotlari
   */
  static async createMultipleMonthlyPayments(data: {
    totalAmount: number;
    monthlyPayment: number;
    startMonthIndex: number;
    maxMonths: number;
    customerId: any;
    managerId: any;
    user: IJwtUser;
    contract: any;
    notePrefix?: string;
  }) {
    const {
      totalAmount,
      monthlyPayment,
      startMonthIndex,
      maxMonths,
      customerId,
      managerId,
      user,
      contract,
      notePrefix = "",
    } = data;

    const createdPayments = [];
    let remainingAmount = totalAmount;
    let currentMonthIndex = startMonthIndex;

    logger.debug("📊 Creating multiple payments:", {
      totalAmount,
      monthlyPayment,
      startMonthIndex,
      maxMonths,
    });

    while (remainingAmount > 0.01 && currentMonthIndex < maxMonths) {
      const monthNumber = currentMonthIndex + 1;
      const paymentAmount = Math.min(remainingAmount, monthlyPayment);

      const noteText = notePrefix
        ? `${notePrefix} - ${monthNumber}-oy to'lovi: ${paymentAmount.toFixed(
            2
          )} $`
        : undefined;

      const payment = await this.createMonthlyPayment({
        monthNumber,
        amount: monthlyPayment,
        actualAmount: paymentAmount,
        monthlyPayment,
        customerId,
        managerId,
        user,
        noteText,
        isPaid: true,
      });

      createdPayments.push(payment);

      // Contract.payments ga qo'shish
      if (!contract.payments) {
        contract.payments = [];
      }
      (contract.payments as any[]).push(payment._id);

      remainingAmount -= paymentAmount;
      currentMonthIndex++;
    }

    logger.debug(`✅ Created ${createdPayments.length} payment(s)`);

    return {
      payments: createdPayments,
      remainingAmount,
      lastMonthIndex: currentMonthIndex,
    };
  }
}
