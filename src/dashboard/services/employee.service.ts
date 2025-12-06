import BaseError from "../../utils/base.error";
import mongoose, { Types } from "mongoose";
import Employee from "../../schemas/employee.schema";
import logger from "../../utils/logger";
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from "../../validators/employee";
import bcrypt from "bcryptjs";
import Auth from "../../schemas/auth.schema";
import { RoleEnum } from "../../enums/role.enum";
import { Role } from "../../schemas/role.schema";
import IJwtUser from "../../types/user";
import { withdrawFromBalanceDto } from "../../validators/expenses";
import { Balance } from "../../schemas/balance.schema";

class EmployeeService {
  async findUserById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw BaseError.BadRequest("Invalid ID format");
    }
    return await Employee.findById(id).populate("role").select("-__v");
  }

  async getAll() {
    // ✅ YANGI: Admin ham ko'rinadi (balans uchun)
    const employees = await Employee.find({
      isDeleted: false, // Faqat o'chirilmagan xodimlar
    }).populate("role");

    const result = employees.map((emp) => ({
      _id: emp._id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      phoneNumber: emp.phoneNumber,
      telegramId: emp.telegramId,
      role: emp.role?.name,
      isDeleted: emp.isDeleted,
    }));
    return result;
  }

  async get(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw BaseError.BadRequest("ID formati noto‘g‘ri");
    }

    const result = await Employee.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "roles",
          localField: "role",
          foreignField: "_id",
          as: "role",
        },
      },
      { $unwind: "$role" },
      {
        $addFields: {
          role: "$role.name",
        },
      },
      {
        $lookup: {
          from: "balances", // Balance modelining MongoDBdagi nomi
          localField: "_id",
          foreignField: "managerId",
          as: "balance",
        },
      },
      {
        $addFields: {
          balance: { $arrayElemAt: ["$balance", 0] }, // bitta natijani olish
        },
      },
      {
        $lookup: {
          from: "currencies",
          pipeline: [{ $sort: { createdAt: -1 } }, { $limit: 1 }],
          as: "currency",
        },
      },
      {
        $addFields: {
          exchangeRate: {
            $ifNull: [{ $arrayElemAt: ["$currency.amount", 0] }, 12500],
          },
        },
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          phoneNumber: 1,
          telegramId: 1,
          isDeleted: 1,
          role: 1,
          balance: {
            dollar: "$balance.dollar",
            sum: {
              $round: {
                $multiply: [
                  { $ifNull: ["$balance.dollar", 0] },
                  "$exchangeRate"
                ],
              },
            },
          },
        },
      },
    ]);

    if (!result.length) {
      throw BaseError.NotFoundError("Foydalanuvchi topilmadi");
    }

    return result[0];
  }

  async getManager() {
    const role = await Role.findOne({
      name: "manager",
    });
    if (!role) return [];
    const managers = await Employee.find(
      {
        isDeleted: false,
        isActive: true,
        role: role._id,
      },
      "_id firstName lastName"
    );
    return managers;
  }

  async create(data: CreateEmployeeDto, user: IJwtUser) {
    const createBy = await Employee.findById(user.sub);
    if (!createBy) {
      throw BaseError.ForbiddenError();
    }
    const employeeExist = await Employee.findOne({
      phoneNumber: data.phoneNumber,
    });

    if (employeeExist) {
      throw BaseError.BadRequest(`Bu telefon raqamiga ega xodim bor!`);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const auth = new Auth({
      password: hashedPassword,
    });
    await auth.save();
    const role = await Role.findOne({ name: data.role });
    if (!role) {
      throw BaseError.BadRequest(`Role '${data.role}' not found!`);
    }

    const employee = new Employee({
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      role: role,
      permissions: [],
      auth,
      createBy,
      isActive: true,
    });

    await employee.save();

    return { message: "Xodim qo'shildi." };
  }

  async update(data: UpdateEmployeeDto) {
    const employeeExist = await Employee.findById(data.id)
      .populate("auth")
      .exec();

    if (!employeeExist) {
      throw BaseError.NotFoundError("Employee topilmadi.");
    }

    if (
      employeeExist.role?.name &&
      employeeExist.role.name === RoleEnum.ADMIN
    ) {
      throw BaseError.BadRequest(
        "Admin foydalanuvchini yangilash taqiqlangan."
      );
    }

    const role = await Role.findOne({ name: data.role });
    if (!role) {
      throw BaseError.BadRequest(`Role '${data.role}' not found!`);
    }

    await Employee.findByIdAndUpdate(
      data.id,
      {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        role: role,
        permissions: data.permissions,
        isActive: data.isActive,
      },
      { new: true }
    ).exec();

    if (data.password) {
      const hashedPassword = await bcrypt.hash(data.password, 10);

      if (employeeExist.auth) {
        employeeExist.auth.password = hashedPassword;
        await employeeExist.auth.save();
      } else {
        const newAuth = new Auth({
          password: hashedPassword,
        });
        await newAuth.save();

        employeeExist.auth = newAuth;
        await employeeExist.save();
      }
    }

    return { message: "Xodim ma'lumotlari yangilandi." };
  }

  async delete(id: string) {
    // ⚠️ DEVELOPMENT: Transaction disabled for standalone MongoDB
    // const session = await mongoose.startSession();
    // session.startTransaction();

    try {
      const employee = await Employee.findById(id).populate("role");

      if (!employee) {
        throw BaseError.NotFoundError("Employee topilmadi.");
      }

      if (employee.role && employee.role.name === RoleEnum.ADMIN) {
        throw BaseError.BadRequest(
          "Admin foydalanuvchini o'chirish taqiqlangan."
        );
      }

      // ✅ CASCADE: Employee o'chirilganda bog'liq ma'lumotlarni boshqarish
      const { cascadeDeleteEmployee } = await import("../../middlewares/cascade.middleware");
      await cascadeDeleteEmployee(id, undefined); // session = undefined for dev mode

      // Auth'ni o'chirish
      if (employee.auth) {
        await Auth.findByIdAndDelete(employee.auth);
      }

      // Employee'ni o'chirish
      await Employee.findByIdAndDelete(id);

      // await session.commitTransaction();
      logger.debug("✅ Employee va bog'liq ma'lumotlar o'chirildi (NO TRANSACTION - DEV MODE)");

      return { message: "Xodim o'chirildi." };
    } catch (error) {
      // await session.abortTransaction();
      logger.error("❌ Employee o'chirishda xatolik:", error);
      throw error;
    } finally {
      // session.endSession();
    }
  }

  async withdrawFromBalance(data: withdrawFromBalanceDto) {
    try {
      logger.debug("💰 === WITHDRAW FROM BALANCE START ===");
      logger.debug("Employee ID:", data._id);
      logger.debug("Currency Details:", JSON.stringify(data.currencyDetails));
      logger.debug("Notes:", data.notes);

      const employeeExist = await Employee.findById(data._id)
        .populate("auth")
        .exec();

      if (!employeeExist) {
        logger.error("❌ Employee not found:", data._id);
        throw BaseError.NotFoundError("Employee topilmadi.");
      }

      logger.debug(
        "✅ Employee found:",
        employeeExist.firstName,
        employeeExist.lastName
      );

      const balance = await Balance.findOne({ managerId: employeeExist._id });

      if (!balance) {
        logger.error("❌ Balance not found for employee:", data._id);
        throw BaseError.NotFoundError("Balans topilmadi");
      }

      logger.debug("✅ Current balance:", {
        dollar: balance.dollar,
        sum: balance.sum,
      });

      // 1. So'm summasini dollarga o'girish
      const changes = data.currencyDetails;
      const Currency = await import("../../schemas/currency.schema");
      const currency = await Currency.default.findOne().sort({ createdAt: -1 });
      const exchangeRate = currency?.amount || 12500;
      
      const sumInDollars = changes.sum ? changes.sum / exchangeRate : 0;
      const totalDollarsToWithdraw = (changes.dollar || 0) + sumInDollars;
      
      logger.debug("💵 Withdrawal calculation:", {
        requestedDollar: changes.dollar || 0,
        requestedSum: changes.sum || 0,
        exchangeRate: exchangeRate,
        sumInDollars: sumInDollars,
        totalDollarsToWithdraw: totalDollarsToWithdraw
      });

      // Faqat dollar balansni tekshirish
      if (balance.dollar < totalDollarsToWithdraw) {
        logger.error("❌ Insufficient dollar balance");
        throw BaseError.BadRequest(
          `Balansda yetarli dollar yo'q. Mavjud: ${balance.dollar}$, Kerak: ${totalDollarsToWithdraw.toFixed(2)}$ (${changes.dollar || 0}$ + ${changes.sum || 0} so'm)`
        );
      }

      // 2. Expense yaratish (xarajat yozuvi)
      logger.info("📝 Creating expense record...");
      const { Expenses } = await import("../../schemas/expenses.schema");
      const expense = await Expenses.create({
        managerId: employeeExist._id,
        dollar: totalDollarsToWithdraw,
        sum: 0, // Database'da faqat dollarda saqlaymiz
        isActive: true,
        notes: data.notes || `Balansdan pul yechib olindi: ${changes.dollar || 0}$ + ${changes.sum || 0} so'm = ${totalDollarsToWithdraw.toFixed(2)}$`,
      });

      logger.debug("✅ Expense created:", expense._id);

      // 3. Balansni kamaytirish (faqat dollar)
      logger.debug("💳 Updating balance...");
      balance.dollar -= totalDollarsToWithdraw;
      // balance.sum ni o'zgartirmaymiz chunki u mavjud emas
      await balance.save();

      logger.debug("✅ Balance updated successfully:", {
        newDollar: balance.dollar,
        newSum: balance.sum,
      });

      logger.debug("💰 === WITHDRAW FROM BALANCE SUCCESS ===");

      return {
        message: "Pul muvaffaqiyatli yechib olindi va xarajat yaratildi.",
        expenseId: expense._id,
        newBalance: {
          dollar: balance.dollar,
          sum: balance.sum,
        },
      };
    } catch (error) {
      logger.error("❌ === WITHDRAW FROM BALANCE ERROR ===");
      logger.error("Error details:", error);
      throw error;
    }
  }
}

export default new EmployeeService();
