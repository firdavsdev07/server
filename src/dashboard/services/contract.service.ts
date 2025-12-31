/**
 * Contract Service - REFACTORED VERSION
 * Delegates complex operations to specialized modules
 */

import BaseError from "../../utils/base.error";
import Contract, { ContractStatus } from "../../schemas/contract.schema";
import logger from "../../utils/logger";
import auditLogService from "../../services/audit-log.service";
import {
  CreateContractDto,
  UpdateContractDto,
} from "../../validators/contract";
import IJwtUser from "../../types/user";
import Employee from "../../schemas/employee.schema";
import Notes from "../../schemas/notes.schema";
import Customer from "../../schemas/customer.schema";

// Import specialized modules
import contractQueryService from "./contract/contract.query.service";
import contractEditHandler from "./contract/contract.edit.handler";
import contractBalanceHelper from "./contract/contract.balance.helper";
import contractPaymentHelper from "./contract/contract.payment.helper";

class ContractService {
  // ========================================
  // QUERY METHODS (Delegated to Query Service)
  // ========================================

  async getAll() {
    return contractQueryService.getAll();
  }

  async getAllNewContract() {
    return contractQueryService.getAllNewContract();
  }

  async getAllCompleted() {
    return contractQueryService.getAllCompleted();
  }

  async getContractById(contractId: string) {
    return contractQueryService.getContractById(contractId);
  }

  // ========================================
  // EDIT METHODS (Delegated to Edit Handler)
  // ========================================

  async update(data: UpdateContractDto, user: IJwtUser) {
    return contractEditHandler.update(data, user);
  }

  /**
   * Ta'sir tahlili - shartnoma tahrirlashdan oldin preview
   * Requirements: 1.2, 1.3, 1.4, 1.5
   */
  async analyzeContractEditImpact(
    contractId: string,
    changes: {
      monthlyPayment?: number;
      initialPayment?: number;
      totalPrice?: number;
    }
  ) {
    try {
      const contract = await Contract.findById(contractId).populate("payments");
      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      // Calculate changes array
      const changesArray: Array<{
        field: string;
        oldValue: any;
        newValue: any;
        difference: number;
      }> = [];

      if (changes.monthlyPayment !== undefined) {
        changesArray.push({
          field: "monthlyPayment",
          oldValue: contract.monthlyPayment,
          newValue: changes.monthlyPayment,
          difference: changes.monthlyPayment - contract.monthlyPayment,
        });
      }

      if (changes.initialPayment !== undefined) {
        changesArray.push({
          field: "initialPayment",
          oldValue: contract.initialPayment,
          newValue: changes.initialPayment,
          difference: changes.initialPayment - contract.initialPayment,
        });
      }

      if (changes.totalPrice !== undefined) {
        changesArray.push({
          field: "totalPrice",
          oldValue: contract.totalPrice,
          newValue: changes.totalPrice,
          difference: changes.totalPrice - contract.totalPrice,
        });
      }

      // Use private method from contract.service.ts to analyze impact
      // For now, we'll do basic analysis here
      const Payment = (await import("../../schemas/payment.schema")).default;
      const { PaymentType } = await import("../../schemas/payment.schema");
      
      const impact = {
        underpaidCount: 0,
        overpaidCount: 0,
        totalShortage: 0,
        totalExcess: 0,
        additionalPaymentsCreated: 0,
      };

      // Only analyze if monthlyPayment changed
      const monthlyPaymentChange = changesArray.find(
        (c) => c.field === "monthlyPayment"
      );

      if (monthlyPaymentChange) {
        const paidMonthlyPayments = await Payment.find({
          _id: { $in: contract.payments },
          paymentType: PaymentType.MONTHLY,
          isPaid: true,
        });

        for (const payment of paidMonthlyPayments) {
          const diff = payment.amount - monthlyPaymentChange.newValue;

          if (diff < -0.01) {
            // UNDERPAID
            const shortage = Math.abs(diff);
            impact.underpaidCount++;
            impact.totalShortage += shortage;
            impact.additionalPaymentsCreated++;
          } else if (diff > 0.01) {
            // OVERPAID
            const excess = diff;
            impact.overpaidCount++;
            impact.totalExcess += excess;
          }
        }
      }

      return {
        success: true,
        changes: changesArray,
        impact,
      };
    } catch (error) {
      logger.error("❌ Error analyzing impact:", error);
      throw error;
    }
  }

  // ========================================
  // CREATE METHODS
  // ========================================

  /**
   * Create contract (Dashboard)
   * Requirements: 1.2, 2.3, 3.2
   */
  async create(data: CreateContractDto, user: IJwtUser) {
    try {
      logger.debug("🚀 === CONTRACT CREATION STARTED ===");
      logger.debug("📋 Input data:", {
        customer: data.customer,
        productName: data.productName,
        initialPayment: data.initialPayment,
        totalPrice: data.totalPrice,
      });

      const {
        customer,
        productName,
        originalPrice,
        price,
        initialPayment,
        percentage,
        period,
        monthlyPayment,
        initialPaymentDueDate,
        notes,
        totalPrice,
        box,
        mbox,
        receipt,
        iCloud,
        startDate,
      } = data;

      // 1. Validate employee
      const createBy = await Employee.findById(user.sub);
      if (!createBy) {
        throw BaseError.ForbiddenError("Mavjud bo'lmagan xodim");
      }
      logger.debug("👤 Employee found:", createBy._id);

      // 2. Validate customer
      const customerDoc = await Customer.findById(customer);
      if (!customerDoc) {
        throw BaseError.NotFoundError("Mijoz topilmadi");
      }
      logger.debug("🤝 Customer found:", customerDoc._id);

      // 3. Create notes
      const newNotes = new Notes({
        text: notes || "Shartnoma yaratildi",
        customer,
        createBy: createBy._id,
      });
      await newNotes.save();
      logger.info("📝 Notes created:", newNotes._id);

      // 4. Create contract
      const contractStartDate = startDate ? new Date(startDate) : new Date();

      // Next payment date - 1 month after startDate
      const nextPaymentDate = new Date(contractStartDate);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      const contract = new Contract({
        customer,
        productName,
        originalPrice,
        price,
        initialPayment,
        percentage,
        period,
        monthlyPayment,
        initialPaymentDueDate: contractStartDate,
        notes: newNotes._id,
        totalPrice,
        startDate: contractStartDate,
        nextPaymentDate: nextPaymentDate,
        isActive: true,
        createBy: createBy._id,
        info: {
          box: box || false,
          mbox: mbox || false,
          receipt: receipt || false,
          iCloud: iCloud || false,
        },
        payments: [],
        isDeclare: false,
        status: ContractStatus.ACTIVE,
      });

      await contract.save();
      logger.debug("📋 Contract created:", contract._id);

      // 🔍 AUDIT LOG: Contract yaratish
      const customerData = customerDoc as any;
      await auditLogService.logContractCreate(
        contract._id.toString(),
        customerData._id.toString(),
        customerData.fullName,
        data.productName,
        data.totalPrice,
        user.sub
      );

      // ✅ YANGI: Barcha oylik to'lovlarni oldindan yaratish
      // Bu reminder qo'yish uchun zarur
      const { PaymentCreatorHelper } = await import("../../utils/helpers/payment-creator.helper");
      const allMonthlyPayments = await PaymentCreatorHelper.createAllMonthlyPaymentsForContract({
        contractId: contract._id,
        period: period,
        monthlyPayment: monthlyPayment,
        startDate: contractStartDate,
        customerId: customer,
        managerId: createBy._id,
      });

      // Contract'ga to'lovlarni qo'shish
      contract.payments = allMonthlyPayments.map((p) => p._id) as any;
      await contract.save();
      logger.debug(`📅 Added ${allMonthlyPayments.length} monthly payments to contract`);

      // 5. Create initial payment (if exists) - DELEGATED
      if (initialPayment && initialPayment > 0) {
        await contractPaymentHelper.createInitialPayment(
          contract,
          initialPayment,
          user
        );

        // 6. Update balance - DELEGATED
        await contractBalanceHelper.updateBalance(createBy._id, {
          dollar: initialPayment,
          sum: 0,
        });
        logger.debug("💵 Balance updated with initial payment:", initialPayment);
      }

      logger.debug("🎉 === CONTRACT CREATION COMPLETED ===");
      return {
        message: "Shartnoma yaratildi.",
        contractId: contract._id,
      };
    } catch (error) {
      logger.error("❌ === CONTRACT CREATION FAILED ===");
      logger.error("Error:", error);
      throw error;
    }
  }

  /**
   * Create contract (Seller)
   */
  async sellerCreate(data: CreateContractDto, user: IJwtUser) {
    try {
      logger.debug("🚀 === SELLER CONTRACT CREATION STARTED ===");

      const {
        customer,
        productName,
        originalPrice,
        price,
        initialPayment,
        percentage,
        period,
        monthlyPayment,
        initialPaymentDueDate,
        notes,
        totalPrice,
        box,
        mbox,
        receipt,
        iCloud,
        startDate,
      } = data;

      // 1. Validate employee
      const createBy = await Employee.findById(user.sub);
      if (!createBy) {
        throw BaseError.ForbiddenError("Mavjud bo'lmagan xodim");
      }

      // 2. Validate customer
      const customerDoc = await Customer.findById(customer);
      if (!customerDoc) {
        throw BaseError.NotFoundError("Mijoz topilmadi");
      }

      // 3. Create notes
      const newNotes = new Notes({
        text: notes || "Shartnoma yaratildi (Sotuvchi)",
        customer,
        createBy: createBy._id,
      });
      await newNotes.save();

      // 4. Create contract (NOT ACTIVE - needs approval)
      const contractStartDate = startDate ? new Date(startDate) : new Date();
      const nextPaymentDate = new Date(contractStartDate);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      const contract = new Contract({
        customer,
        productName,
        originalPrice,
        price,
        initialPayment,
        percentage,
        period,
        monthlyPayment,
        initialPaymentDueDate: contractStartDate,
        notes: newNotes._id,
        totalPrice,
        startDate: contractStartDate,
        nextPaymentDate: nextPaymentDate,
        isActive: false, // ⚠️ Needs approval
        createBy: createBy._id,
        info: {
          box: box || false,
          mbox: mbox || false,
          receipt: receipt || false,
          iCloud: iCloud || false,
        },
        payments: [],
        isDeclare: false,
        status: ContractStatus.ACTIVE,
      });

      await contract.save();

      logger.debug("🎉 === SELLER CONTRACT CREATION COMPLETED ===");
      return {
        message: "Shartnoma yaratildi. Tasdiqlashni kutmoqda.",
        contractId: contract._id,
      };
    } catch (error) {
      logger.error("❌ === SELLER CONTRACT CREATION FAILED ===");
      throw error;
    }
  }

  /**
   * Approve contract (Manager only)
   */
  async approveContract(contractId: string, user: IJwtUser) {
    try {
      logger.debug("✅ === CONTRACT APPROVAL STARTED ===");

      const contract = await Contract.findById(contractId).populate("customer");
      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      if (contract.isActive) {
        throw BaseError.BadRequest("Shartnoma allaqachon tasdiqlangan");
      }

      // Activate contract
      contract.isActive = true;
      await contract.save();

      // Create initial payment if exists - DELEGATED
      if (contract.initialPayment && contract.initialPayment > 0) {
        await contractPaymentHelper.createInitialPayment(
          contract,
          contract.initialPayment,
          user
        );

        // Update balance - DELEGATED
        const employee = await Employee.findById(user.sub);
        if (employee) {
          await contractBalanceHelper.updateBalance(employee._id, {
            dollar: contract.initialPayment,
            sum: 0,
          });
        }
      }

      logger.debug("🎉 === CONTRACT APPROVAL COMPLETED ===");
      return {
        message: "Shartnoma tasdiqlandi",
        contractId: contract._id,
      };
    } catch (error) {
      logger.error("❌ === CONTRACT APPROVAL FAILED ===");
      throw error;
    }
  }

  /**
   * Delete contract (soft delete with cascade)
   * Requirements: DELETE_CONTRACT permission
   */
  async deleteContract(contractId: string, user: IJwtUser) {
    try {
      logger.debug("🗑️ === CONTRACT DELETE STARTED ===");
      logger.debug(`Contract ID: ${contractId}`);

      // 1. Find contract
      const contract = await Contract.findById(contractId).populate("customer");
      if (!contract) {
        throw BaseError.NotFoundError("Shartnoma topilmadi");
      }

      // 2. Check if contract is active (only Super Admin can delete active contracts)
      if (contract.status === ContractStatus.ACTIVE) {
        // Check if user is Super Admin
        const employee = await Employee.findById(user.sub).populate("role");
        const roleName = (employee?.role as any)?.name;
        const isSuperAdmin = roleName === "admin";

        logger.debug(`👤 User role: ${roleName}, isSuperAdmin: ${isSuperAdmin}`);

        if (!isSuperAdmin) {
          throw BaseError.BadRequest(
            "Aktiv shartnomani o'chirish uchun Super Admin huquqi kerak!"
          );
        }

        logger.debug("⚠️ Super Admin active shartnomani o'chirmoqda");
      }

      // 3. Import cascade delete handler
      const { cascadeDeleteContract } = await import("../../middlewares/cascade.middleware");
      
      // 4. Execute cascade delete (will handle payments and debtors)
      await cascadeDeleteContract(contractId);

      // 5. Soft delete contract
      contract.isDeleted = true;
      contract.deletedAt = new Date();
      await contract.save();

      // 6. Audit log
      const customerData = contract.customer as any;
      await auditLogService.logContractDelete(
        contractId,
        customerData._id.toString(),
        customerData.fullName,
        contract.productName,
        user.sub
      );

      logger.debug("🎉 === CONTRACT DELETE COMPLETED ===");
      return {
        message: "Shartnoma muvaffaqiyatli o'chirildi",
        contractId: contract._id,
      };
    } catch (error) {
      logger.error("❌ === CONTRACT DELETE FAILED ===");
      throw error;
    }
  }
}

export default new ContractService();
