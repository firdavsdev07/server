/**
 * Payment Helper - Handles payment-related operations for contracts
 */

import { Types } from "mongoose";
import logger from "../../../utils/logger";
import Payment, {
  PaymentStatus,
  PaymentType,
  PaymentReason,
} from "../../../schemas/payment.schema";
import Notes from "../../../schemas/notes.schema";
import Contract, { ContractStatus } from "../../../schemas/contract.schema";
import IJwtUser from "../../../types/user";

export class ContractPaymentHelper {
  /**
   * Create initial payment for contract
   * Requirements: 1.2, 4.1, 4.4
   */
  async createInitialPayment(
    contract: any,
    amount: number,
    user: IJwtUser
  ): Promise<any> {
    try {
      logger.debug("💰 Creating initial payment:", amount);

      // 1. Notes yaratish
      const notes = new Notes({
        text: `Boshlang'ich to'lov: ${amount}`,
        customer: contract.customer,
        createBy: user.sub,
      });
      await notes.save();

      // 2. Payment yaratish (isPaid: true, status: PAID - avtomatik tasdiqlangan)
      const payment = new Payment({
        amount,
        date: contract.startDate,
        isPaid: true,
        paymentType: PaymentType.INITIAL,
        customerId: contract.customer,
        managerId: user.sub,
        notes: notes._id,
        status: PaymentStatus.PAID,
        confirmedAt: new Date(),
        confirmedBy: user.sub,
        targetMonth: 0, // Initial payment
      });
      await payment.save();

      // 3. Contract.payments arrayga qo'shish
      if (!contract.payments) {
        contract.payments = [];
      }
      contract.payments.push(payment._id);
      await contract.save();

      logger.debug("✅ Initial payment created (PAID):", payment._id);

      return payment;
    } catch (error) {
      logger.error("❌ Error creating initial payment:", error);
      throw error;
    }
  }

  /**
   * Create additional payment for UNDERPAID case
   * Requirements: 2.3, 2.4, 2.5, 2.6, 2.7
   */
  async createAdditionalPayment(
    contract: any,
    originalPayment: any,
    amount: number,
    paymentMonth: string
  ): Promise<any> {
    logger.debug(
      `💰 Creating additional payment: ${amount} for ${paymentMonth}`
    );

    try {
      // 1. Notes yaratish
      const notes = await Notes.create({
        text: `Qo'shimcha to'lov: ${paymentMonth} oyi uchun oylik to'lov o'zgarishi tufayli ${amount.toFixed(
          2
        )} yetishmayapti.\n\nAsosiy to'lov: ${
          originalPayment.amount
        }\nYangi oylik to'lov: ${
          originalPayment.expectedAmount
        }\nYetishmayapti: ${amount.toFixed(2)}`,
        customer: contract.customer,
        createBy: originalPayment.managerId,
      });

      // 2. Qo'shimcha to'lov yaratish
      const additionalPayment = await Payment.create({
        amount: amount,
        date: new Date(),
        isPaid: false,
        paymentType: PaymentType.EXTRA,
        customerId: contract.customer,
        managerId: originalPayment.managerId,
        notes: notes._id,
        status: PaymentStatus.PENDING,
        expectedAmount: amount,
        linkedPaymentId: originalPayment._id,
        reason: PaymentReason.MONTHLY_PAYMENT_INCREASE,
      });

      // 3. Contract.payments ga qo'shish
      contract.payments.push(additionalPayment._id);
      await contract.save();

      logger.debug(`✅ Additional payment created: ${additionalPayment._id}`);

      return additionalPayment;
    } catch (error) {
      logger.error("❌ Error creating additional payment:", error);
      throw error;
    }
  }

  /**
   * Recheck contract status based on total paid
   */
  async recheckContractStatus(contractId: string): Promise<void> {
    try {
      const contract = await Contract.findById(contractId).populate("payments");
      if (!contract) return;

      // Calculate total paid
      const totalPaid = (contract.payments as any[])
        .filter((p: any) => p.isPaid)
        .reduce((sum: number, p: any) => sum + (p.actualAmount || p.amount), 0);

      // Add prepaid balance
      const totalPaidWithPrepaid = totalPaid + (contract.prepaidBalance || 0);

      logger.debug("📊 Contract status check:", {
        contractId,
        totalPaid,
        prepaidBalance: contract.prepaidBalance || 0,
        totalPaidWithPrepaid,
        totalPrice: contract.totalPrice,
        currentStatus: contract.status,
        shouldBeCompleted: totalPaidWithPrepaid >= contract.totalPrice,
      });

      // Update status
      if (totalPaidWithPrepaid >= contract.totalPrice) {
        if (contract.status !== ContractStatus.COMPLETED) {
          contract.status = ContractStatus.COMPLETED;
          await contract.save();
          logger.debug("✅ Contract status changed to COMPLETED");
        }
      } else {
        if (contract.status === ContractStatus.COMPLETED) {
          contract.status = ContractStatus.ACTIVE;
          await contract.save();
          logger.debug("✅ Contract status changed to ACTIVE");
        }
      }
    } catch (error) {
      logger.error("❌ Error rechecking contract status:", error);
      throw error;
    }
  }
}

export default new ContractPaymentHelper();
