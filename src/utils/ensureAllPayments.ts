import Contract from "../schemas/contract.schema";
import Payment, { PaymentType, PaymentStatus } from "../schemas/payment.schema";
import Notes from "../schemas/notes.schema";
import logger from "./logger";
import dayjs from "dayjs";

/**
 * Mavjud shartnomalar uchun qolgan oylik to'lovlarni yaratish
 * Server ishga tushganda avtomatik ishlaydi
 */
export async function ensureAllPayments(): Promise<void> {
  try {
    const contracts = await Contract.find({
      isActive: true,
      isDeleted: false,
    }).populate("payments");

    let totalCreated = 0;

    for (const contract of contracts) {
      const period = contract.period || 0;
      if (period === 0) continue;

      // Mavjud oylik to'lovlarning targetMonth'larini olish
      const existingMonths = new Set(
        (contract.payments as any[])
          .filter((p: any) => p.paymentType === "monthly")
          .map((p: any) => p.targetMonth)
      );

      const missingMonths: number[] = [];
      for (let i = 1; i <= period; i++) {
        if (!existingMonths.has(i)) {
          missingMonths.push(i);
        }
      }

      if (missingMonths.length === 0) continue;

      const nextPaymentDate = contract.nextPaymentDate || contract.initialPaymentDueDate || contract.startDate;
      const customerId = contract.customer as any;
      const managerId = (contract as any).createBy;

      for (const month of missingMonths) {
        const paymentDate = dayjs(nextPaymentDate)
          .add(month - 1, "month")
          .toDate();

        const noteText = `${month}-oy to'lovi`;
        const notes = await Notes.create({
          text: noteText,
          customer: customerId,
          createBy: managerId,
        });

        const payment = new Payment({
          amount: contract.monthlyPayment,
          date: paymentDate,
          isPaid: false,
          paymentType: PaymentType.MONTHLY,
          customerId,
          managerId,
          notes: notes._id,
          status: PaymentStatus.SCHEDULED,
          targetMonth: month,
        });
        await payment.save();

        (contract.payments as any[]).push(payment._id);
        totalCreated++;
      }

      await contract.save();
    }

    if (totalCreated > 0) {
      logger.info(`✅ Created ${totalCreated} missing payments for existing contracts`);
    }
  } catch (error) {
    logger.error("❌ Error ensuring all payments:", error);
  }
}
