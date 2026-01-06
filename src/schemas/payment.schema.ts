import { model, Schema } from "mongoose";
import { INotes } from "./notes.schema";
import { ICustomer } from "./customer.schema";
import { IEmployee } from "./employee.schema";

export enum PaymentStatus {
  PAID = "PAID",
  UNDERPAID = "UNDERPAID",
  OVERPAID = "OVERPAID",
  PENDING = "PENDING",       // Kassada tasdiqlash kutilmoqda
  REJECTED = "REJECTED",     // Rad etilgan to'lov
  SCHEDULED = "SCHEDULED",   // Rejalashtirilgan to'lov (hali vaqti kelmagan)
}

export enum PaymentType {
  INITIAL = "initial", // Boshlang'ich to'lov
  MONTHLY = "monthly", // Oylik to'lov
  EXTRA = "extra", // Qo'shimcha to'lov
}

export enum PaymentReason {
  MONTHLY_PAYMENT_INCREASE = "monthly_payment_increase",
  MONTHLY_PAYMENT_DECREASE = "monthly_payment_decrease",
  INITIAL_PAYMENT_CHANGE = "initial_payment_change",
  TOTAL_PRICE_CHANGE = "total_price_change",
}

export enum PaymentMethod {
  SOM_CASH = "som_cash",           // So'm naqd
  SOM_CARD = "som_card",           // So'm karta
  DOLLAR_CASH = "dollar_cash",     // Dollar naqd
  DOLLAR_CARD_VISA = "dollar_card_visa", // Dollar karta Visa
}

export interface IPayment {
  amount: number; // Oylik to'lov (expected amount)
  actualAmount?: number; // ✅ YANGI - Haqiqatda to'langan summa
  date: Date;
  isPaid: boolean;
  paymentType: PaymentType; // YANGI - to'lov turi
  paymentMethod?: PaymentMethod; // ✅ YANGI - To'lov usuli (so'm naqd, karta, dollar, va h.k.)
  notes: INotes;
  customerId: ICustomer;
  managerId: IEmployee;
  status?: PaymentStatus;
  remainingAmount?: number; // Kam to'langan bo'lsa
  excessAmount?: number; // Ko'p to'langan bo'lsa
  expectedAmount?: number; // Kutilgan summa (oylik to'lov)
  confirmedAt?: Date; // YANGI - kassa tasdiqlagan vaqt
  confirmedBy?: IEmployee; // YANGI - kassa xodimi
  linkedPaymentId?: IPayment | string; // Bog'langan to'lov (qo'shimcha to'lov uchun)
  reason?: PaymentReason; // Sabab: 'monthly_payment_increase', 'initial_payment_change'
  prepaidAmount?: number; // Oldindan to'langan summa (keyingi oydan)
  appliedToPaymentId?: IPayment | string; // Qaysi to'lovga qo'llanildi (ortiqcha summa uchun)
  targetMonth?: number; // ✅ YANGI - Qaysi oyga to'lov qilinmoqda (1, 2, 3...)
  nextPaymentDate?: Date; // ✅ YANGI - Kam to'lov bo'lsa, qolgan qismini qachon to'lash kerak
  reminderDate?: Date; // ✅ YANGI - Manager tomonidan belgilangan eslatma sanasi
  reminderComment?: string; // ✅ YANGI - Manager eslatma izohi
  postponedDays?: number; // ✅ YANGI - Kechiktirilgan kunlar soni (kassaga ko'rsatish uchun)
  isReminderNotification?: boolean; // ✅ YANGI - Bu eslatma notification'imi? (to'lov emas)
  // ✅ Mongoose timestamps (avtomatik qo'shiladi)
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    amount: { type: Number, required: true }, // Oylik to'lov
    actualAmount: { type: Number }, // ✅ YANGI - Haqiqatda to'langan summa
    date: { type: Date, required: true },
    isPaid: { type: Boolean, required: true, default: false },
    paymentType: {
      type: String,
      enum: Object.values(PaymentType),
      required: true,
      default: PaymentType.MONTHLY,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: false,
    },
    notes: {
      type: Schema.Types.ObjectId,
      ref: "Notes",
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    remainingAmount: { type: Number, default: 0 },
    excessAmount: { type: Number, default: 0 },
    expectedAmount: { type: Number },
    confirmedAt: { type: Date },
    confirmedBy: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
    },
    linkedPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: false,
    },
    reason: {
      type: String,
      enum: Object.values(PaymentReason),
      required: false,
    },
    prepaidAmount: { type: Number, default: 0 },
    appliedToPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: false,
    },
    targetMonth: { type: Number, required: true }, // ✅ YANGI - Qaysi oyga to'lov qilinmoqda (REQUIRED)
    nextPaymentDate: { type: Date, required: false }, // ✅ YANGI - Kam to'lov bo'lsa, qolgan qismini qachon to'lash kerak
    reminderDate: { type: Date, required: false }, // ✅ YANGI - Manager tomonidan belgilangan eslatma sanasi
    reminderComment: { type: String, required: false }, // ✅ YANGI - Manager eslatma izohi
    postponedDays: { type: Number, required: false }, // ✅ YANGI - Kechiktirilgan kunlar soni
    isReminderNotification: { type: Boolean, default: false }, // ✅ YANGI - Eslatma notification'i
  },
  {
    timestamps: true,
  }
);

// Indexes for performance optimization
// Compound index for pending payments query (isPaid: false, status: PENDING)
PaymentSchema.index({ isPaid: 1, status: 1 }, { name: "idx_isPaid_status" });

// Index for date-based sorting and queries
PaymentSchema.index({ date: -1 }, { name: "idx_date" });

const Payment = model<IPayment>("Payment", PaymentSchema);

export default Payment;
