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
// import jwt from "jsonwebtoken";
import Employee from "../../schemas/employee.schema";
import IEmployeeData from "../../types/employeeData";
import IJwtUser from "../../types/user";
import jwt from "../../utils/jwt";

class AuthController {
  // Check if user is registered (has phone number)
  async checkRegistration(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug("🔍 === CHECK REGISTRATION REQUEST ===");
      
      const { initData } = req.body;
      
      if (!initData) {
        return next(BaseError.BadRequest("initData topilmadi"));
      }
      
      const telegramId = checkTelegramInitData(initData);
      
      if (!telegramId) {
        return next(BaseError.UnauthorizedError("initData noto'g'ri"));
      }
      
      logger.debug("🔍 TelegramId:", telegramId, "uchun registration check");
      
      const employee = await Employee.findOne({
        telegramId: telegramId.toString(),
        isActive: true,
        isDeleted: false,
      }).populate("role");
      
      const isRegistered = !!employee;
      logger.debug(`📊 Registration status: ${isRegistered ? 'REGISTERED ✅' : 'NOT REGISTERED ❌'}`);
      
      res.json({ 
        isRegistered,
        telegramId: telegramId.toString(),
        ...(employee && {
          profile: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: employee.role?.name
          }
        })
      });
    } catch (err) {
      logger.error("❌ Check registration error:", err);
      return next(err);
    }
  }

  async telegram(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug("🔐 === BOT AUTH REQUEST ===");
      logger.debug(
        "📍 Request body:",
        JSON.stringify(req.body).substring(0, 100)
      );

      const { initData } = req.body;

      if (!initData) {
        logger.debug("❌ initData mavjud emas");
        return next(BaseError.ForbiddenError("initData topilmadi"));
      }

      logger.debug("✅ initData mavjud, uzunligi:", initData.length);
      const telegramId = checkTelegramInitData(initData);

      if (!telegramId) {
        logger.debug("❌ telegramId parse qilinmadi:", telegramId);
        return next(BaseError.UnauthorizedError("initData noto'g'ri"));
      }

      logger.debug("✅ telegramId topildi:", telegramId);
      logger.debug("🔍 Database'dan xodim qidirilmoqda...");

      const employee = await Employee.findOne({
        telegramId: telegramId.toString(),
        isActive: true,
        isDeleted: false,
      }).populate("role");

      if (!employee) {
        logger.debug("❌ Xodim topilmadi. TelegramId:", telegramId);
        logger.debug("💡 Iltimos, avval telefon raqamingizni bot'ga yuboring");
        return next(BaseError.NotFoundError("Foydalanuvchi topilmadi"));
      }

      logger.debug("✅ Xodim topildi:", employee.firstName, employee.lastName);
      logger.debug("👤 Rol:", employee.role?.name);

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
      logger.debug("✅ Token yaratildi");
      logger.debug("🎉 === AUTH SUCCESSFUL ===\n");

      res.json({ profile: employeeData, token: accessToken });
    } catch (err) {
      logger.error("❌ Telegram auth error:", err);
      return next(err);
    }
  }
}
export default new AuthController();
