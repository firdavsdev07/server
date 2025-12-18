/**
 * Payment Status Helper
 * 
 * To'lov statusini hisoblash uchun helper funksiyalar
 * DRY principle - kod takrorlanishini bartaraf etish
 */

import { PaymentStatus } from "../../../schemas/payment.schema";
import { PAYMENT_CONSTANTS } from "./payment-constants";

/**
 * To'lov statusini hisoblash
 * 
 * @param actualAmount - Haqiqatda to'langan summa
 * @param expectedAmount - Kutilgan summa
 * @returns PaymentStatus (PAID, UNDERPAID, OVERPAID)
 */
export const calculatePaymentStatus = (
  actualAmount: number,
  expectedAmount: number
): PaymentStatus => {
  const difference = actualAmount - expectedAmount;
  const tolerance = PAYMENT_CONSTANTS.TOLERANCE;

  if (Math.abs(difference) < tolerance) {
    return PaymentStatus.PAID;
  }

  if (difference < -tolerance) {
    return PaymentStatus.UNDERPAID;
  }

  return PaymentStatus.OVERPAID;
};

/**
 * To'lov summalarini hisoblash
 * 
 * @param actualAmount - Haqiqatda to'langan summa
 * @param expectedAmount - Kutilgan summa
 * @returns Object with remainingAmount and excessAmount
 */
export const calculatePaymentAmounts = (
  actualAmount: number,
  expectedAmount: number
): {
  remainingAmount: number;
  excessAmount: number;
  status: PaymentStatus;
} => {
  const difference = actualAmount - expectedAmount;
  const tolerance = PAYMENT_CONSTANTS.TOLERANCE;

  let remainingAmount = 0;
  let excessAmount = 0;
  let status: PaymentStatus;

  if (Math.abs(difference) < tolerance) {
    status = PaymentStatus.PAID;
  } else if (difference < -tolerance) {
    status = PaymentStatus.UNDERPAID;
    remainingAmount = Math.abs(difference);
  } else {
    status = PaymentStatus.OVERPAID;
    excessAmount = difference;
  }

  return {
    remainingAmount,
    excessAmount,
    status,
  };
};

/**
 * Prepaid balance'dan foydalanish
 * 
 * @param actualAmount - Haqiqatda to'langan summa
 * @param expectedAmount - Kutilgan summa
 * @param prepaidBalance - Mavjud prepaid balance
 * @returns Updated amounts with prepaid usage
 */
export const applyPrepaidBalance = (
  actualAmount: number,
  expectedAmount: number,
  prepaidBalance: number
): {
  newActualAmount: number;
  prepaidUsed: number;
} => {
  let prepaidUsed = 0;

  if (prepaidBalance > PAYMENT_CONSTANTS.TOLERANCE && actualAmount < expectedAmount) {
    const shortage = expectedAmount - actualAmount;
    prepaidUsed = Math.min(shortage, prepaidBalance);
  }

  return {
    newActualAmount: actualAmount + prepaidUsed,
    prepaidUsed,
  };
};

/**
 * To'lov validatsiyasi
 * 
 * @param amount - To'lov summasi
 * @throws Error if invalid
 */
export const validatePaymentAmount = (amount: number): void => {
  if (!amount || amount <= 0) {
    throw new Error(PAYMENT_CONSTANTS.MIN_PAYMENT_AMOUNT + " dan katta bo'lishi kerak");
  }

  if (amount > PAYMENT_CONSTANTS.MAX_SINGLE_PAYMENT) {
    throw new Error(`Maksimal to'lov ${PAYMENT_CONSTANTS.MAX_SINGLE_PAYMENT} $`);
  }
};

/**
 * Ikki summani solishtirishish (tolerance bilan)
 * 
 * @param amount1 - Birinchi summa
 * @param amount2 - Ikkinchi summa
 * @returns true if equal within tolerance
 */
export const areAmountsEqual = (amount1: number, amount2: number): boolean => {
  return Math.abs(amount1 - amount2) < PAYMENT_CONSTANTS.TOLERANCE;
};

/**
 * Summani tekshirish (> 0 yoki >=)
 * 
 * @param amount - Summa
 * @returns true if amount > tolerance
 */
export const isAmountPositive = (amount: number): boolean => {
  return amount > PAYMENT_CONSTANTS.TOLERANCE;
};
