/**
 * Payment Notes Helper
 * 
 * To'lov uchun notes yaratish
 * Kod takrorlanishini bartaraf etish
 */

import { PaymentStatus } from "../../../schemas/payment.schema";
import { PAYMENT_MESSAGES } from "./payment-constants";

/**
 * To'lov uchun notes yaratish
 */
export const createPaymentNoteText = (params: {
  monthNumber?: number;
  amount: number;
  status: PaymentStatus;
  remainingAmount?: number;
  excessAmount?: number;
  prepaidUsed?: number;
  customNote?: string;
  isFromExcess?: boolean;
}): string => {
  const {
    monthNumber,
    amount,
    status,
    remainingAmount,
    excessAmount,
    prepaidUsed,
    customNote,
    isFromExcess,
  } = params;

  let noteText = customNote || `To'lov: ${amount.toFixed(2)} $`;

  // Oy raqami
  if (monthNumber) {
    noteText = `${monthNumber}-oy to'lovi: ${amount.toFixed(2)} $`;
    if (isFromExcess) {
      noteText += " (ortiqcha summadan)";
    }
  }

  // Prepaid balance ishlatilgan
  if (prepaidUsed && prepaidUsed > 0.01) {
    noteText += `\n💎 Prepaid balance ishlatildi: ${prepaidUsed.toFixed(2)} $`;
  }

  // Status ga qarab qo'shimcha ma'lumot
  if (status === PaymentStatus.UNDERPAID && remainingAmount) {
    noteText += `\n⚠️ Kam to'landi: ${remainingAmount.toFixed(2)} $ qoldi`;
  } else if (status === PaymentStatus.OVERPAID && excessAmount) {
    noteText += `\n✅ Ko'p to'landi: ${excessAmount.toFixed(2)} $ ortiqcha (keyingi oyga o'tkaziladi)`;
  }

  return noteText;
};

/**
 * Qolgan qarz to'lovi uchun notes
 */
export const createRemainingPaymentNote = (params: {
  paymentAmount: number;
  customNote?: string;
}): string => {
  const { paymentAmount, customNote } = params;
  
  let noteText = `\n\n💰 [${new Date().toLocaleDateString("uz-UZ")}] Qolgan qarz to'landi: ${paymentAmount.toFixed(2)} $`;
  
  if (customNote) {
    noteText += `\nIzoh: ${customNote}`;
  }
  
  return noteText;
};

/**
 * Rad etish uchun notes
 */
export const createRejectionNote = (reason: string): string => {
  return `\n[RAD ETILDI: ${reason}]`;
};

/**
 * Avtomatik rad etish uchun notes
 */
export const createAutoRejectionNote = (timeoutHours: number): string => {
  return `\n\n[AVTOMATIK RAD ETILDI: ${timeoutHours} soat ichida kassa tomonidan tasdiqlanmadi - ${new Date().toLocaleString("uz-UZ")}]`;
};

/**
 * Barcha oylarni to'lash uchun notes
 */
export const createPayAllMonthsNote = (params: {
  monthNumber: number;
  amount: number;
  status: PaymentStatus;
  shortageAmount?: number;
}): string => {
  const { monthNumber, amount, status, shortageAmount } = params;
  
  let noteText = `${monthNumber}-oy to'lovi: ${amount.toFixed(2)} $ (Barchasini to'lash orqali)`;
  
  if (status === PaymentStatus.UNDERPAID && shortageAmount) {
    noteText += `\n⚠️ Kam to'landi: ${shortageAmount.toFixed(2)} $ yetishmayapti`;
  }
  
  return noteText;
};

/**
 * Response message yaratish
 */
export const createPaymentResponseMessage = (params: {
  status: PaymentStatus;
  remainingAmount?: number;
  excessAmount?: number;
  prepaidUsed?: number;
  isPending?: boolean;
}) => {
  const { status, remainingAmount, excessAmount, prepaidUsed, isPending } = params;
  
  if (isPending) {
    return PAYMENT_MESSAGES.PAYMENT_PENDING;
  }
  
  // Status ga qarab message yaratish
  let message: string = PAYMENT_MESSAGES.PAYMENT_RECEIVED;
  
  if (status === PaymentStatus.UNDERPAID && remainingAmount) {
    message = `To'lov qabul qilindi, lekin ${remainingAmount.toFixed(2)} $ kam to'landi`;
  } else if (status === PaymentStatus.OVERPAID && excessAmount) {
    message = `To'lov qabul qilindi, ${excessAmount.toFixed(2)} $ ortiqcha summa keyingi oyga o'tkazildi`;
  }
  
  // Prepaid ishlatilgan (message'ga qo'shimcha)
  if (prepaidUsed && prepaidUsed > 0.01) {
    message += `\n💎 Prepaid balance ishlatildi: ${prepaidUsed.toFixed(2)} $`;
  }
  
  return message;
};
