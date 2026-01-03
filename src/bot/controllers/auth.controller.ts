import { Request, Response, NextFunction } from "express";
import authService from "../services/user.service";
import { plainToInstance } from "class-transformer";
import { LoginDto } from "../../validators/auth";
import { handleValidationErrors } from "../../validators/format";
import { validate } from "class-validator";
import BaseError from "../../utils/base.error";
import { profile } from "console";
import { checkTelegramInitData } from "../utils/checkInitData";
import config from "../utils/config";
import logger from "../../utils/logger";
import Employee from "../../schemas/employee.schema";
import IEmployeeData from "../../types/employeeData";
import IJwtUser from "../../types/user";
import jwt from "../../utils/jwt";

class AuthController {
  async checkRegistration(req: Request, res: Response, next: NextFunction) {
    try {
      const { initData } = req.body;

      if (!initData) {
        return next(BaseError.BadRequest("initData topilmadi"));
      }

      const telegramId = checkTelegramInitData(initData);

      if (!telegramId) {
        return next(BaseError.UnauthorizedError("initData noto'g'ri"));
      }

      const employee = await Employee.findOne({
        telegramId: telegramId.toString(),
        isActive: true,
        isDeleted: false,
      }).populate("role");

      const isRegistered = !!employee;

      res.json({
        isRegistered,
        telegramId: telegramId.toString(),
        ...(employee && {
          profile: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: employee.role?.name,
          },
        }),
      });
    } catch (err) {
      return next(err);
    }
  }

  async telegram(req: Request, res: Response, next: NextFunction) {
    try {

      const { initData } = req.body;

      if (!initData) {
        return next(BaseError.ForbiddenError("initData topilmadi"));
      }

      const telegramId = checkTelegramInitData(initData);

      if (!telegramId) {
        return next(BaseError.UnauthorizedError("initData noto'g'ri"));
      }

      const employee = await Employee.findOne({
        telegramId: telegramId.toString(),
        isActive: true,
        isDeleted: false,
      }).populate("role");

      if (!employee) {
        return next(BaseError.NotFoundError("Foydalanuvchi topilmadi"));
      }

      const employeeData: IEmployeeData = {
        id: employee.id,
        firstname: employee.firstName,
        lastname: employee.lastName,
        phoneNumber: employee.phoneNumber,
        telegramId: employee.telegramId,
        role: employee.role.name,
      };

      const employeeDto: IJwtUser = {
        sub: employee.id.toString(),
        name: employee.firstName,
        role: employee.role.name,
      };

      const accessToken = jwt.signBot(employeeDto);

      res.json({ profile: employeeData, token: accessToken });
    } catch (err) {
      return next(err);
    }
  }
}
export default new AuthController();
