import Employee, { IEmployee } from "../../schemas/employee.schema";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

import BaseError from "../../utils/base.error";
import { Balance } from "../../schemas/balance.schema";
import { Expenses } from "../../schemas/expenses.schema";
import { Types } from "mongoose";

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
    if (balance.sum !== undefined && changes.sum !== undefined) {
      balance.sum -= changes.sum;
    }

    return await balance.save();
  }

  async get(id: string, page = 1, limit = 10) {
    if (!Types.ObjectId.isValid(id)) {
      throw BaseError.BadRequest("ID formati noto‘g‘ri");
    }

    const skip = (page - 1) * limit;

    const [expenses, total] = await Promise.all([
      Expenses.aggregate([
        {
          $match: {
            managerId: new Types.ObjectId(id),
          },
        },
        {
          $sort: {
            createdAt: -1, // So‘nggi xarajatlar birinchi
          },
        },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            notes: 1,
            isActive: 1,
            createdAt: 1,
            currencyDetails: {
              dollar: "$dollar",
              sum: "$sum",
            },
          },
        },
      ]),
      Expenses.countDocuments({ managerId: new Types.ObjectId(id) }),
    ]);

    logger.debug("📊 Expenses query result:", {
      count: expenses.length,
      total,
      page,
      limit,
      employeeId: id,
      sample: expenses[0] || "No expenses found",
    });

    return {
      expenses,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async return(id: string) {
    const existingExpenses = await Expenses.findById(id).populate("managerId");

    if (!existingExpenses) {
      throw BaseError.NotFoundError("Xarajat topilmadi yoki o'chirilgan");
    }

    if (!existingExpenses.isActive) {
      throw BaseError.BadRequest("Xarajat allaqachon qaytarilgan");
    }

    // Balance'ga qaytarish (xarajat bekor qilinganda)
    const balance = await Balance.findOne({
      managerId: existingExpenses.managerId,
    });

    if (balance) {
      balance.dollar += existingExpenses.dollar || 0;
      if (balance.sum !== undefined && existingExpenses.sum !== undefined) {
        balance.sum += existingExpenses.sum;
      }
      await balance.save();
      logger.debug(
        "✅ Balance restored after expense return:",
        balance._id,
        "+",
        existingExpenses.dollar,
        "$"
      );
    }

    existingExpenses.isActive = false;
    await existingExpenses.save();

    return {
      status: "success",
      message: "Xarajat muvaffaqiyatli qaytarildi va balans tiklandi.",
    };
  }
}

export default new ExpensesSrvice();
