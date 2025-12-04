import Employee, { IEmployee } from "../../schemas/employee.schema";
import IJwtUser from "../../types/user";

import BaseError from "../../utils/base.error";
import { Balance } from "../../schemas/balance.schema";
import { Expenses } from "../../schemas/expenses.schema";
import { Types } from "mongoose";
import { AddExpensesDto, UpdateExpensesDto } from "../../validators/expenses";

class ExpensesSrvice {
  async subtractFromBalance(
    managerId: IEmployee,
    changes: {
      dollar: number;
      sum: number;
    }
  ) {
    const balance = await Balance.findOne({ managerId });

    if (!balance) {
      throw BaseError.NotFoundError("Balans topilmadi");
    }

    balance.dollar -= changes.dollar;
    balance.sum -= changes.sum;

    return await balance.save();
  }

  async getAll(user: IJwtUser, isActive: boolean) {
    const managerId = new Types.ObjectId(user.sub);

    const expenses = await Expenses.aggregate([
      { $match: { managerId, isActive } },
      {
        $project: {
          id: { $toString: "$_id" },
          currencyDetails: {
            dollar: "$dollar",
            sum: "$sum",
          },
          method: 1,
          notes: 1,
        },
      },
    ]);

    return expenses;
  }

  async add(addData: AddExpensesDto, user: IJwtUser) {
    const manager = await Employee.findById(user.sub);

    if (!manager) {
      throw BaseError.NotFoundError("Menejer topilmadi yoki o'chirilgan");
    }

    const { dollar = 0, sum = 0 } = addData.currencyDetails || {};

    await this.subtractFromBalance(manager, {
      dollar,
      sum,
    });

    const expenses = new Expenses({
      managerId: manager._id,
      dollar,
      sum,
      isActive: true,
      notes: addData.notes,
    });
    await expenses.save();
    return {
      status: "success",
      message: "Xarajat muvaffaqiyatli qo‘shildi",
    };
  }

  async update(updateData: UpdateExpensesDto, user: IJwtUser) {
    const existingExpenses = await Expenses.findById(updateData._id);

    if (!existingExpenses) {
      throw BaseError.NotFoundError("Qarizdorlik topilmadi yoki o'chirilgan");
    }

    const manager = await Employee.findById(user.sub);
    if (!manager) {
      throw BaseError.NotFoundError("Menejer topilmadi");
    }

    const oldCurrency = {
      dollar: existingExpenses.dollar,
      sum: existingExpenses.sum,
    };

    const newCurrency = {
      dollar: updateData.currencyDetails?.dollar || 0,
      sum: updateData.currencyDetails?.sum || 0,
    };

    const delta = {
      dollar: newCurrency.dollar - oldCurrency.dollar,
      sum: newCurrency.sum - oldCurrency.sum,
    };

    await this.subtractFromBalance(manager, delta);

    existingExpenses.dollar = updateData.currencyDetails?.dollar || 0;
    existingExpenses.sum = updateData.currencyDetails?.sum || 0;
    existingExpenses.notes = updateData.notes || "";
    await existingExpenses.save();

    return {
      status: "success",
      message: "Xarajat muvaffaqiyatli yangilandi.",
    };
  }

  async return(id: string, user: IJwtUser) {
    const existingExpenses = await Expenses.findById(id);

    if (!existingExpenses) {
      throw BaseError.NotFoundError("Qarizdorlik topilmadi yoki o'chirilgan");
    }

    const manager = await Employee.findById(user.sub);
    if (!manager) {
      throw BaseError.NotFoundError("Menejer topilmadi");
    }

    const oldCurrency = {
      dollar: existingExpenses.dollar,
      sum: existingExpenses.sum,
    };

    const delta = {
      dollar: -oldCurrency.dollar,
      sum: -oldCurrency.sum,
    };

    await this.subtractFromBalance(manager, delta);

    existingExpenses.isActive = false;
    await existingExpenses.save();

    return {
      status: "success",
      message: "Xarajat muvaffaqiyatli yangilandi.",
    };
  }
}

export default new ExpensesSrvice();
