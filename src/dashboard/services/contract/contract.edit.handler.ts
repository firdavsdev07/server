/**
 * Contract Edit Handler - Handles all contract editing and update logic
 * 
 * This is the most complex module handling:
 * - Contract validation
 * - Impact analysis
 * - Monthly payment changes
 * - Initial payment changes
 * - Total price changes
 * - Debtor updates
 * - Edit history tracking
 */

import { Types } from "mongoose";
import Contract, { ContractStatus } from "../../../schemas/contract.schema";
import logger from "../../../utils/logger";
import Payment, {
  PaymentStatus,
  PaymentType,
  PaymentReason,
} from "../../../schemas/payment.schema";
import Notes from "../../../schemas/notes.schema";
import Customer from "../../../schemas/customer.schema";
import { Debtor } from "../../../schemas/debtor.schema";
import Employee from "../../../schemas/employee.schema";
import BaseError from "../../../utils/base.error";
import IJwtUser from "../../../types/user";
import { UpdateContractDto } from "../../../validators/contract";
import {
  verifyContractEditPermission,
  validateContractEditInput,
  createAuditLog,
  checkRateLimit,
  sanitizeContractForLogging,
} from "../contract.service.security";

export class ContractEditHandler {
  /**
   * Contract status'ni qayta tekshirish
   */
  private async recheckContractStatus(contractId: string): Promise<void> {
    try {
      const contract = await Contract.findById(contractId).populate("payments");
      if (!contract) return;

      // actualAmount yoki amount ishlatish (haqiqatda to'langan summa)
      const totalPaid = (contract.payments as any[])
        .filter((p: any) => p.isPaid)
        .reduce((sum: number, p: any) => sum + (p.actualAmount || p.amount), 0);

      // Prepaid balance ham qo'shish
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

      // Agar to'liq to'langan bo'lsa - COMPLETED
      if (totalPaidWithPrepaid >= contract.totalPrice) {
        if (contract.status !== ContractStatus.COMPLETED) {
          contract.status = ContractStatus.COMPLETED;
          await contract.save();
          logger.debug("✅ Contract status changed to COMPLETED");
        }
      } else {
        // Agar to'liq to'lanmagan bo'lsa va COMPLETED bo'lsa - ACTIVE ga qaytarish
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

  /**
   * Shartnoma tahrirlashni validatsiya qilish
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   */
  private async validateContractEdit(
    contract: any,
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      difference: number;
    }>
  ): Promise<void> {
    logger.debug("🔍 Validating contract edit...");

    for (const change of changes) {
      // 1. Manfiy qiymatlarni tekshirish
      if (change.newValue < 0) {
        throw BaseError.BadRequest(
          `${change.field} manfiy bo'lishi mumkin emas`
        );
      }

      // 2. Maksimal o'zgarishni tekshirish - 50% (faqat monthlyPayment uchun)
      if (change.field === "monthlyPayment") {
        if (change.oldValue > 0 && change.newValue > 0) {
          const changePercent = Math.abs(
            (change.difference / change.oldValue) * 100
          );

          logger.debug(
            "📊 Monthly Payment Change Percent:",
            changePercent.toFixed(2) + "%"
          );

          if (changePercent > 50) {
            throw BaseError.BadRequest(
              `Oylik to'lovni 50% dan ko'p o'zgartirish mumkin emas. ` +
                `Hozirgi o'zgarish: ${changePercent.toFixed(1)}%\n` +
                `Eski qiymat: ${change.oldValue}, Yangi qiymat: ${change.newValue}, Farq: ${change.difference}`
            );
          }
        }
      }

      // 3. Total price > initial payment tekshirish
      if (change.field === "totalPrice" || change.field === "initialPayment") {
        const totalPrice =
          change.field === "totalPrice" ? change.newValue : contract.totalPrice;
        const initialPayment =
          change.field === "initialPayment"
            ? change.newValue
            : contract.initialPayment;

        if (totalPrice <= initialPayment) {
          throw BaseError.BadRequest(
            "Umumiy narx boshlang'ich to'lovdan katta bo'lishi kerak"
          );
        }
      }
    }

    // 4. Completed shartnomalarni tahrirlashni tekshirish
    if (contract.status === ContractStatus.COMPLETED) {
      logger.debug("⚠️ Warning: Editing completed contract");
    }

    logger.debug("✅ Validation passed");
  }

  /**
   * Ta'sir tahlili - shartnoma tahrirlashning ta'sirini hisoblash
   * Requirements: 1.2, 1.3, 1.4, 1.5
   */
  private async analyzeEditImpact(
    contract: any,
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      difference: number;
    }>
  ): Promise<{
    underpaidCount: number;
    overpaidCount: number;
    totalShortage: number;
    totalExcess: number;
    additionalPaymentsCreated: number;
  }> {
    logger.debug("📊 Analyzing edit impact...");

    const impact = {
      underpaidCount: 0,
      overpaidCount: 0,
      totalShortage: 0,
      totalExcess: 0,
      additionalPaymentsCreated: 0,
    };

    // Faqat monthly payment o'zgarishi uchun tahlil qilish
    const monthlyPaymentChange = changes.find(
      (c) => c.field === "monthlyPayment"
    );

    if (!monthlyPaymentChange) {
      logger.info("ℹ️ No monthly payment change detected");
      return impact;
    }

    // Barcha to'langan oylik to'lovlarni topish
    const paidMonthlyPayments = await Payment.find({
      _id: { $in: contract.payments },
      paymentType: PaymentType.MONTHLY,
      isPaid: true,
    }).sort({ date: 1 });

    if (paidMonthlyPayments.length === 0) {
      logger.info("ℹ️ No paid monthly payments found");
      return impact;
    }

    logger.debug(`📋 Found ${paidMonthlyPayments.length} paid monthly payments`);

    // Har bir to'lov uchun diff hisoblash
    for (const payment of paidMonthlyPayments) {
      const diff = payment.amount - monthlyPaymentChange.newValue;

      if (diff < -0.01) {
        // UNDERPAID
        const shortage = Math.abs(diff);
        impact.underpaidCount++;
        impact.totalShortage += shortage;
        impact.additionalPaymentsCreated++;

        logger.debug(
          `⚠️ Payment ${payment._id}: UNDERPAID by ${shortage.toFixed(2)}`
        );
      } else if (diff > 0.01) {
        // OVERPAID
        const excess = diff;
        impact.overpaidCount++;
        impact.totalExcess += excess;

        logger.debug(
          `✅ Payment ${payment._id}: OVERPAID by ${excess.toFixed(2)}`
        );
      } else {
        logger.debug(`✓ Payment ${payment._id}: Exact match`);
      }
    }

    logger.debug("✅ Impact analysis completed:", {
      underpaidCount: impact.underpaidCount,
      overpaidCount: impact.overpaidCount,
      totalShortage: impact.totalShortage.toFixed(2),
      totalExcess: impact.totalExcess.toFixed(2),
      additionalPaymentsCreated: impact.additionalPaymentsCreated,
    });

    return impact;
  }

  /**
   * Qo'shimcha to'lov yaratish (UNDERPAID holat uchun)
   * Requirements: 2.3, 2.4, 2.5, 2.6, 2.7
   */
  private async createAdditionalPayment(
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
        targetMonth: 0, // Extra payment
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
   * Boshlang'ich to'lov o'zgarishini boshqarish
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 5.1, 5.2, 5.3
   */
  private async handleInitialPaymentChange(
    contract: any,
    diff: number,
    user: IJwtUser
  ): Promise<Types.ObjectId | null> {
    logger.debug(`💰 Initial payment changed by: ${diff}`);

    try {
      // 1. Initial payment'ni topish
      const initialPayment = await Payment.findOne({
        _id: { $in: contract.payments },
        paymentType: PaymentType.INITIAL,
      }).populate("notes");

      if (!initialPayment) {
        logger.debug("⚠️ No initial payment found");
        return null;
      }

      // 2. Payment amount'ni yangilash
      const oldAmount = initialPayment.amount;
      initialPayment.amount += diff;

      // 3. Notes yangilash
      initialPayment.notes.text += `\n\n📝 [${new Date().toLocaleDateString(
        "uz-UZ"
      )}] Boshlang'ich to'lov o'zgartirildi: ${oldAmount} → ${
        initialPayment.amount
      }`;
      initialPayment.reason = PaymentReason.INITIAL_PAYMENT_CHANGE;

      await initialPayment.save();
      await initialPayment.notes.save();

      logger.debug(
        `✅ Initial payment updated: ${oldAmount} → ${initialPayment.amount}`
      );

      // 4. Balance'ni yangilash
      const customer = await Customer.findById(contract.customer).populate(
        "manager"
      );
      if (customer && customer.manager) {
        // Use balance helper from payment helper
        const { Balance } = await import("../../../schemas/balance.schema");
        
        let balance = await Balance.findOne({ managerId: customer.manager._id });
        if (!balance) {
          balance = await Balance.create({
            managerId: customer.manager._id,
            dollar: diff,
            sum: 0,
          });
        } else {
          balance.dollar += diff;
          await balance.save();
        }

        logger.debug(
          `💵 Balance updated for manager: ${customer.manager._id}, diff: ${diff}`
        );
      }

      return initialPayment._id;
    } catch (error) {
      logger.error("❌ Error handling initial payment change:", error);
      throw error;
    }
  }

  /**
   * Umumiy narx o'zgarishini boshqarish
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  private async handleTotalPriceChange(
    contract: any,
    newTotalPrice: number
  ): Promise<void> {
    logger.debug(
      `📊 Total price changed: ${contract.totalPrice} → ${newTotalPrice}`
    );

    try {
      // 1. Contract.totalPrice yangilash
      const oldTotalPrice = contract.totalPrice;
      contract.totalPrice = newTotalPrice;

      // 2. Contract status'ni qayta tekshirish
      await this.recheckContractStatus(String(contract._id));

      // 3. Status o'zgarishini log qilish
      logger.debug(`✅ Total price change handled successfully`);
      logger.debug(`   Old total price: ${oldTotalPrice}`);
      logger.debug(`   New total price: ${newTotalPrice}`);
      logger.debug(`   Contract status: ${contract.status}`);
    } catch (error) {
      logger.error("❌ Error handling total price change:", error);
      throw error;
    }
  }

  /**
   * Debtor'larni yangilash (OPTIMIZED - Batch Update)
   * Requirements: 11.1, 11.2, 11.3, 11.4
   */
  private async handleDebtorUpdate(
    contractId: Types.ObjectId,
    oldMonthlyPayment: number,
    newMonthlyPayment: number
  ): Promise<void> {
    logger.debug("📋 === UPDATING DEBTORS (OPTIMIZED) ===");
    logger.debug(`Contract ID: ${contractId}`);
    logger.debug(`Old monthly payment: ${oldMonthlyPayment}`);
    logger.debug(`New monthly payment: ${newMonthlyPayment}`);

    try {
      // OPTIMIZATION: Batch update all debtors in single query
      const result = await Debtor.updateMany(
        { contractId },
        {
          $set: {
            debtAmount: newMonthlyPayment,
          },
        }
      );

      logger.debug(`✅ Batch updated ${result.modifiedCount} debtor(s)`);
      logger.debug("✅ === DEBTOR UPDATE COMPLETED ===");
    } catch (error) {
      logger.error("❌ Error updating debtors:", error);
      throw error;
    }
  }

  /**
   * Oylik to'lov o'zgarishini boshqarish
   * Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3
   */
  private async handleMonthlyPaymentChange(
    contract: any,
    oldAmount: number,
    newAmount: number
  ): Promise<Types.ObjectId[]> {
    logger.debug(`📅 Monthly payment changed: ${oldAmount} → ${newAmount}`);

    const affectedPayments: Types.ObjectId[] = [];

    // 1. Barcha to'langan oylik to'lovlarni topish
    const paidMonthlyPayments = await Payment.find({
      _id: { $in: contract.payments },
      paymentType: PaymentType.MONTHLY,
      isPaid: true,
    })
      .sort({ date: 1 })
      .populate("notes");

    if (paidMonthlyPayments.length === 0) {
      logger.info("ℹ️ No paid monthly payments found");
      return affectedPayments;
    }

    logger.debug(
      `📋 Processing ${paidMonthlyPayments.length} paid monthly payments`
    );

    let cumulativeExcess = 0; // Jami ortiqcha summa (kaskad logika uchun)

    // 2. Har bir to'lovni qayta hisoblash
    for (let i = 0; i < paidMonthlyPayments.length; i++) {
      const payment = paidMonthlyPayments[i];
      const originalAmount = payment.amount;

      // Oldingi oydan o'tgan summani hisobga olish (kaskad logika)
      const effectiveExpected = newAmount - cumulativeExcess;
      const diff = originalAmount - effectiveExpected;

      // expectedAmount yangilash
      payment.expectedAmount = newAmount;
      affectedPayments.push(payment._id);

      if (Math.abs(diff) < 0.01) {
        // TO'G'RI TO'LANGAN (PAID)
        payment.status = PaymentStatus.PAID;
        payment.remainingAmount = 0;
        payment.excessAmount = 0;
        cumulativeExcess = 0;

        logger.debug(`✅ Payment ${i + 1}: PAID (exact match)`);
      } else if (diff < 0) {
        // KAM TO'LANGAN (UNDERPAID)
        const shortage = Math.abs(diff);
        payment.status = PaymentStatus.UNDERPAID;
        payment.remainingAmount = shortage;
        payment.excessAmount = 0;

        // Notes yangilash
        const paymentDate = new Date(payment.date).toLocaleDateString("uz-UZ", {
          year: "numeric",
          month: "long",
        });
        payment.notes.text += `\n\n⚠️ [${new Date().toLocaleDateString(
          "uz-UZ"
        )}] Oylik to'lov o'zgartirildi: ${oldAmount} → ${newAmount}. ${shortage.toFixed(
          2
        )} yetishmayapti.`;
        await payment.notes.save();

        // Qo'shimcha to'lov yaratish
        const additionalPayment = await this.createAdditionalPayment(
          contract,
          payment,
          shortage,
          paymentDate
        );

        affectedPayments.push(additionalPayment._id);
        cumulativeExcess = 0;

        logger.debug(
          `⚠️ Payment ${i + 1}: UNDERPAID (shortage: ${shortage.toFixed(2)})`
        );
      } else {
        // KO'P TO'LANGAN (OVERPAID)
        const excess = diff;
        payment.status = PaymentStatus.OVERPAID;
        payment.excessAmount = excess;
        payment.remainingAmount = 0;

        // Notes yangilash
        const nextMonth = new Date(payment.date);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthName = nextMonth.toLocaleDateString("uz-UZ", {
          month: "long",
        });

        payment.notes.text += `\n\n✅ [${new Date().toLocaleDateString(
          "uz-UZ"
        )}] Oylik to'lov o'zgartirildi: ${oldAmount} → ${newAmount}. ${excess.toFixed(
          2
        )} ${nextMonthName} oyiga o'tkazildi.`;
        await payment.notes.save();

        // Keyingi oyga o'tkazish (kaskad logika)
        cumulativeExcess += excess;

        logger.debug(
          `✅ Payment ${i + 1}: OVERPAID (excess: ${excess.toFixed(
            2
          )}, cumulative: ${cumulativeExcess.toFixed(2)})`
        );
      }

      await payment.save();
    }

    // 3. Agar oxirida ortiqcha summa qolsa, prepaidBalance ga qo'shish
    if (cumulativeExcess > 0) {
      contract.prepaidBalance =
        (contract.prepaidBalance || 0) + cumulativeExcess;
      await contract.save();

      logger.debug(
        `💰 Prepaid balance updated: ${contract.prepaidBalance.toFixed(2)}`
      );
    }

    // 4. Barcha Debtor'larni yangilash
    await this.handleDebtorUpdate(contract._id, oldAmount, newAmount);

    logger.debug("✅ Monthly payment change handled successfully");

    return affectedPayments;
  }

  /**
   * Edit history saqlash metodi
   * Requirements: 8.1, 8.2, 8.3
   */
  private async saveEditHistory(
    contract: any,
    changes: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      difference: number;
    }>,
    affectedPayments: Types.ObjectId[],
    impactSummary: {
      underpaidCount: number;
      overpaidCount: number;
      totalShortage: number;
      totalExcess: number;
      additionalPaymentsCreated: number;
    },
    user: IJwtUser
  ): Promise<void> {
    logger.info("📝 === SAVING EDIT HISTORY ===");

    try {
      // 1. IContractEdit object yaratish
      const editEntry = {
        date: new Date(),
        editedBy: new Types.ObjectId(user.sub),
        changes: changes.map((change) => ({
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          difference: change.difference,
        })),
        affectedPayments: affectedPayments,
        impactSummary: {
          underpaidCount: impactSummary.underpaidCount,
          overpaidCount: impactSummary.overpaidCount,
          totalShortage: impactSummary.totalShortage,
          totalExcess: impactSummary.totalExcess,
          additionalPaymentsCreated: impactSummary.additionalPaymentsCreated,
        },
      };

      logger.debug("📋 Edit entry created:", {
        date: editEntry.date,
        editedBy: editEntry.editedBy,
        changesCount: editEntry.changes.length,
        affectedPaymentsCount: editEntry.affectedPayments.length,
      });

      // 2. Contract.editHistory ga qo'shish
      if (!contract.editHistory) {
        contract.editHistory = [];
      }

      contract.editHistory.push(editEntry);
      await contract.save();

      logger.debug("✅ Edit history saved successfully");
      logger.debug(
        `📊 Total edit history entries: ${contract.editHistory.length}`
      );
    } catch (error) {
      logger.error("❌ Error saving edit history:", error);
      throw error;
    }
  }

  /**
   * Shartnoma yangilash - Main update method
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
   * 
   * Bu metod barcha helper metodlarni integratsiya qiladi va
   * shartnoma tahrirlashning to'liq lifecycle'ini boshqaradi
   */
  async update(data: UpdateContractDto, user: IJwtUser) {
    const startTime = Date.now();

    try {
      logger.debug("🔄 === CONTRACT UPDATE STARTED ===");
      logger.debug("📋 Contract ID:", data.id);
      logger.debug("👤 User:", user.sub);

      // SECURITY CHECKS
      const rateLimitCheck = checkRateLimit(user.sub, 10, 60000);
      if (!rateLimitCheck.allowed) {
        throw BaseError.BadRequest(
          `Too many requests. Please try again in ${rateLimitCheck.retryAfter} seconds.`
        );
      }

      const authCheck = await verifyContractEditPermission(user.sub, data.id);
      if (!authCheck.authorized) {
        throw BaseError.ForbiddenError(
          `Shartnomani tahrirlash uchun ruxsat yo'q: ${authCheck.reason}`
        );
      }

      const inputValidation = validateContractEditInput({
        monthlyPayment: data.monthlyPayment,
        initialPayment: data.initialPayment,
        totalPrice: data.totalPrice,
        productName: data.productName,
        notes: data.notes,
      });

      if (!inputValidation.valid) {
        throw BaseError.BadRequest(
          `Input validation failed: ${inputValidation.errors.join(", ")}`
        );
      }

      // 1. Find contract
      const contract = await Contract.findOne({
        _id: data.id,
        isDeleted: false,
      })
        .populate("notes")
        .populate("payments");

      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi yoki o'chirilgan");
      }

      // 2. Calculate changes
      const changes: Array<{
        field: string;
        oldValue: any;
        newValue: any;
        difference: number;
      }> = [];

      const monthlyPaymentDiff =
        (data.monthlyPayment !== undefined
          ? data.monthlyPayment
          : contract.monthlyPayment) - contract.monthlyPayment;

      if (monthlyPaymentDiff !== 0) {
        changes.push({
          field: "monthlyPayment",
          oldValue: contract.monthlyPayment,
          newValue: data.monthlyPayment!,
          difference: monthlyPaymentDiff,
        });
      }

      const initialPaymentDiff =
        (data.initialPayment !== undefined
          ? data.initialPayment
          : contract.initialPayment) - contract.initialPayment;

      if (initialPaymentDiff !== 0) {
        changes.push({
          field: "initialPayment",
          oldValue: contract.initialPayment,
          newValue: data.initialPayment!,
          difference: initialPaymentDiff,
        });
      }

      const totalPriceDiff =
        (data.totalPrice !== undefined
          ? data.totalPrice
          : contract.totalPrice) - contract.totalPrice;

      if (totalPriceDiff !== 0) {
        changes.push({
          field: "totalPrice",
          oldValue: contract.totalPrice,
          newValue: data.totalPrice!,
          difference: totalPriceDiff,
        });
      }

      logger.debug(`✅ Detected ${changes.length} change(s)`);

      // 3. Validate
      if (changes.length > 0) {
        await this.validateContractEdit(contract, changes);
      }

      // 4. Analyze impact
      const impactSummary = await this.analyzeEditImpact(contract, changes);

      // 5. Handle changes
      const affectedPayments: Types.ObjectId[] = [];

      if (monthlyPaymentDiff !== 0) {
        const affected = await this.handleMonthlyPaymentChange(
          contract,
          contract.monthlyPayment,
          data.monthlyPayment!
        );
        affectedPayments.push(...affected);
      }

      if (initialPaymentDiff !== 0) {
        const affectedPaymentId = await this.handleInitialPaymentChange(
          contract,
          initialPaymentDiff,
          user
        );
        if (affectedPaymentId) {
          affectedPayments.push(affectedPaymentId);
        }
      }

      if (totalPriceDiff !== 0) {
        await this.handleTotalPriceChange(contract, data.totalPrice!);
      }

      // 6. Update contract
      if (data.notes && contract.notes) {
        const contractNotes = contract.notes as any;
        if (data.notes !== contractNotes.text) {
          contractNotes.text = data.notes;
          await contractNotes.save();
        }
      }

      Object.assign(contract, {
        productName: data.productName,
        originalPrice: data.originalPrice,
        price: data.price,
        initialPayment: data.initialPayment,
        percentage: data.percentage,
        period: data.period,
        monthlyPayment: data.monthlyPayment,
        totalPrice: data.totalPrice,
        initialPaymentDueDate: data.initialPaymentDueDate,
        nextPaymentDate: data.initialPaymentDueDate,
        info: {
          box: data.box,
          mbox: data.mbox,
          receipt: data.receipt,
          iCloud: data.iCloud,
        },
      });

      // 7. Save edit history
      if (changes.length > 0) {
        await this.saveEditHistory(
          contract,
          changes,
          affectedPayments,
          impactSummary,
          user
        );
      }

      await contract.save();

      // 8. Audit log
      const employee = await Employee.findById(user.sub).select(
        "firstName lastName"
      );
      await createAuditLog({
        timestamp: new Date(),
        userId: user.sub,
        userName: employee
          ? `${employee.firstName} ${employee.lastName}`
          : "Unknown",
        action: "CONTRACT_UPDATE",
        resourceType: "Contract",
        resourceId: data.id,
        changes: changes.map((c) => ({
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
        })),
        success: true,
      });

      logger.debug("🎉 CONTRACT UPDATE COMPLETED");

      return {
        message: "Shartnoma muvaffaqiyatli yangilandi",
        changes,
        impactSummary,
        affectedPayments: affectedPayments.length,
      };
    } catch (error) {
      logger.error("❌ CONTRACT UPDATE FAILED:", error);

      try {
        const employee = await Employee.findById(user.sub).select(
          "firstName lastName"
        );
        await createAuditLog({
          timestamp: new Date(),
          userId: user.sub,
          userName: employee
            ? `${employee.firstName} ${employee.lastName}`
            : "Unknown",
          action: "CONTRACT_UPDATE",
          resourceType: "Contract",
          resourceId: data.id,
          changes: [],
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (auditError) {
        logger.error("❌ Failed to create audit log:", auditError);
      }

      throw error;
    }
  }
}

export default new ContractEditHandler();
