import Payment, {
  PaymentStatus,
  PaymentType,
} from "../../schemas/payment.schema";
import Notes from "../../schemas/notes.schema";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

/**
 * Excess Payment Helper
 * Ortiqcha to'lovlarni qayta ishlash uchun yordamchi funksiyalar
 */
export class ExcessPaymentHelper {
  /**
   * Ortiqcha to'lovni qayta ishlash
   * Keyingi oylar uchun avtomatik to'lovlar yaratish
   */
  static async processExcessPayment(
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
        targetMonth: monthNumber, // ✅ FIXED: targetMonth qo'shildi
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
}
