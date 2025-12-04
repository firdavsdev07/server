/**
 * CASCADE MIDDLEWARE
 * 
 * Mongoose'da avtomatik CASCADE yo'q, shuning uchun pre-remove middleware orqali boshqaramiz
 * 
 * Requirements:
 * - Employee o'chirilganda → Balance, Expenses, Payment, Notes, Debtor, Customer.manager'ni boshqarish
 * - Customer o'chirilganda → Contract, Payment, Notes'ni boshqarish
 * - Contract o'chirilganda → Payment, Notes, Debtor'ni boshqarish
 * 
 * Strategy: Logical Delete (isDeleted: true)
 */

import mongoose from "mongoose";
import Employee from "../schemas/employee.schema";
import Customer from "../schemas/customer.schema";
import Contract from "../schemas/contract.schema";
import Payment from "../schemas/payment.schema";
import { Balance } from "../schemas/balance.schema";
import { Expenses } from "../schemas/expenses.schema";
import Notes from "../schemas/notes.schema";
import { Debtor } from "../schemas/debtor.schema";
import BaseError from "../utils/base.error";
import logger from "../utils/logger";

/**
 * CASCADE: Employee o'chirilganda
 * 
 * Employee o'chirilganda quyidagilar yuz beradi:
 * 1. Balance → O'chiriladi (Employee bilan 1:1 bog'liq)
 * 2. Expenses → isDeleted = true (tarixiy ma'lumot saqlanadi)
 * 3. Payment.managerId → null (tarixiy ma'lumot saqlanadi, lekin manager yo'q)
 * 4. Notes.createBy → null (tarixiy ma'lumot saqlanadi, lekin yaratuvchi yo'q)
 * 5. Debtor.createBy → null (tarixiy ma'lumot saqlanadi, lekin yaratuvchi yo'q)
 * 6. Customer.manager → null (mijoz yangi menegerga o'tkaziladi)
 * 7. Customer.editHistory.editedBy → null (tarixiy ma'lumot saqlanadi)
 * 8. Contract.editHistory.editedBy → null (tarixiy ma'lumot saqlanadi)
 * 
 * ⚠️ MUHIM: Employee o'chirishdan oldin unga bog'liq customerlarni boshqa menegerga o'tkazish kerak!
 */
export async function cascadeDeleteEmployee(
  employeeId: string,
  session?: mongoose.ClientSession
): Promise<void> {
  try {
    logger.debug(`🗑️ CASCADE DELETE: Employee ${employeeId}`);

    // 1. Customer'larni tekshirish
    const customersCount = await Customer.countDocuments({
      manager: employeeId,
      isDeleted: false,
    }).session(session || null);

    if (customersCount > 0) {
      throw BaseError.BadRequest(
        `Employee o'chirishdan oldin ${customersCount} ta mijozni boshqa menegerga o'tkazish kerak!`
      );
    }

    // 2. Balance'ni o'chirish (1:1 bog'liq)
    const deletedBalance = await Balance.deleteOne({ managerId: employeeId }).session(
      session || null
    );
    logger.debug(`✅ Balance o'chirildi: ${deletedBalance.deletedCount} ta`);

    // 3. Expenses'ni logical delete (tarixiy ma'lumot saqlanadi)
    const updatedExpenses = await Expenses.updateMany(
      { managerId: employeeId, isActive: true },
      { $set: { isActive: false } }
    ).session(session || null);
    logger.debug(
      `✅ Expenses deactivated: ${updatedExpenses.modifiedCount} ta`
    );

    // 4. Payment.managerId → null (tarixiy ma'lumot saqlanadi)
    const updatedPayments = await Payment.updateMany(
      { managerId: employeeId },
      { $set: { managerId: null } }
    ).session(session || null);
    logger.debug(
      `✅ Payment.managerId → null: ${updatedPayments.modifiedCount} ta`
    );

    // 5. Notes.createBy → null (tarixiy ma'lumot saqlanadi)
    const updatedNotes = await Notes.updateMany(
      { createBy: employeeId },
      { $set: { createBy: null } }
    ).session(session || null);
    logger.debug(
      `✅ Notes.createBy → null: ${updatedNotes.modifiedCount} ta`
    );

    // 6. Debtor.createBy → null (tarixiy ma'lumot saqlanadi)
    const updatedDebtors = await Debtor.updateMany(
      { createBy: employeeId },
      { $set: { createBy: null } }
    ).session(session || null);
    logger.debug(
      `✅ Debtor.createBy → null: ${updatedDebtors.modifiedCount} ta`
    );

    // 7. Customer.editHistory.editedBy → null (tarixiy ma'lumot saqlanadi)
    const updatedCustomerHistory = await Customer.updateMany(
      { "editHistory.editedBy": employeeId },
      { $set: { "editHistory.$[elem].editedBy": null } },
      { arrayFilters: [{ "elem.editedBy": employeeId }] }
    ).session(session || null);
    logger.debug(
      `✅ Customer.editHistory updated: ${updatedCustomerHistory.modifiedCount} ta`
    );

    // 8. Contract.editHistory.editedBy → null (tarixiy ma'lumot saqlanadi)
    const updatedContractHistory = await Contract.updateMany(
      { "editHistory.editedBy": employeeId },
      { $set: { "editHistory.$[elem].editedBy": null } },
      { arrayFilters: [{ "elem.editedBy": employeeId }] }
    ).session(session || null);
    logger.debug(
      `✅ Contract.editHistory updated: ${updatedContractHistory.modifiedCount} ta`
    );

    logger.debug(`✅ CASCADE DELETE Employee ${employeeId} completed`);
  } catch (error) {
    logger.error(`❌ CASCADE DELETE Employee ${employeeId} failed:`, error);
    throw error;
  }
}

/**
 * CASCADE: Customer o'chirilganda
 * 
 * Customer o'chirilganda quyidagilar yuz beradi:
 * 1. Contract → isDeleted = true (tarixiy ma'lumot saqlanadi)
 * 2. Payment → isDeleted = true (tarixiy ma'lumot saqlanadi)
 * 3. Notes → isDeleted = true (tarixiy ma'lumot saqlanadi)
 * 
 * ⚠️ MUHIM: Customer'da active contract bo'lsa, o'chirib bo'lmaydi!
 */
export async function cascadeDeleteCustomer(
  customerId: string,
  session?: mongoose.ClientSession
): Promise<void> {
  try {
    logger.debug(`🗑️ CASCADE DELETE: Customer ${customerId}`);

    // 1. Active contract'larni tekshirish
    const activeContractsCount = await Contract.countDocuments({
      customer: customerId,
      status: "active",
      isDeleted: false,
    }).session(session || null);

    if (activeContractsCount > 0) {
      throw BaseError.BadRequest(
        `Customer o'chirishdan oldin ${activeContractsCount} ta active shartnomani yopish kerak!`
      );
    }

    // 2. Contract'larni logical delete
    const updatedContracts = await Contract.updateMany(
      { customer: customerId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    ).session(session || null);
    logger.debug(
      `✅ Contract logical delete: ${updatedContracts.modifiedCount} ta`
    );

    // 3. Payment'larni logical delete (Customer bilan bog'liq)
    const updatedPayments = await Payment.updateMany(
      { customerId: customerId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    ).session(session || null);
    logger.debug(
      `✅ Payment logical delete: ${updatedPayments.modifiedCount} ta`
    );

    // 4. Notes'ni logical delete
    const updatedNotes = await Notes.updateMany(
      { customer: customerId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    ).session(session || null);
    logger.debug(
      `✅ Notes logical delete: ${updatedNotes.modifiedCount} ta`
    );

    logger.debug(`✅ CASCADE DELETE Customer ${customerId} completed`);
  } catch (error) {
    logger.error(`❌ CASCADE DELETE Customer ${customerId} failed:`, error);
    throw error;
  }
}

/**
 * CASCADE: Contract o'chirilganda
 * 
 * Contract o'chirilganda quyidagilar yuz beradi:
 * 1. Payment → isDeleted = true (tarixiy ma'lumot saqlanadi)
 * 2. Debtor → o'chiriladi (Debtor faqat active contract uchun)
 * 
 * ⚠️ MUHIM: Active contract bo'lsa, o'chirib bo'lmaydi!
 */
export async function cascadeDeleteContract(
  contractId: string,
  session?: mongoose.ClientSession
): Promise<void> {
  try {
    logger.debug(`🗑️ CASCADE DELETE: Contract ${contractId}`);

    // 1. Active contract'ni tekshirish
    const contract = await Contract.findById(contractId).session(
      session || null
    );

    if (contract && contract.status === "active") {
      throw BaseError.BadRequest(
        "Active shartnomani o'chirib bo'lmaydi! Avval shartnomani yoping (status: completed yoki cancelled)."
      );
    }

    // 2. Payment'larni logical delete
    const updatedPayments = await Payment.updateMany(
      { contractId: contractId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    ).session(session || null);
    logger.debug(
      `✅ Payment logical delete: ${updatedPayments.modifiedCount} ta`
    );

    // 3. Debtor'ni o'chirish (Debtor faqat active contract uchun kerak)
    const deletedDebtors = await Debtor.deleteMany({
      contractId: contractId,
    }).session(session || null);
    logger.debug(`✅ Debtor o'chirildi: ${deletedDebtors.deletedCount} ta`);

    logger.debug(`✅ CASCADE DELETE Contract ${contractId} completed`);
  } catch (error) {
    logger.error(`❌ CASCADE DELETE Contract ${contractId} failed:`, error);
    throw error;
  }
}
