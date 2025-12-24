import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import { RoleEnum } from "../../enums/role.enum";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PayDebtDto, PayNewDebtDto } from "../../validators/payment";
import { handleValidationErrors } from "../../validators/format";
import paymentService from "../services/payment.service";
import dashboardPaymentController from "../../dashboard/controllers/payment.controller";
import logger from "../../utils/logger";

// const user: IJwtUser = {
//   sub: "686e7881ab577df7c3eb3db2",
//   name: "Farhod",
//   role: RoleEnum.MANAGER,
// };

class PaymentController {
  async payDebt(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const payData = plainToInstance(PayDebtDto, req.body || {});
      const errors = await validate(payData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("To'lov ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await paymentService.payDebt(payData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }
  async payNewDebt(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const payData = plainToInstance(PayNewDebtDto, req.body || {});
      const errors = await validate(payData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("To'lov ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await paymentService.payNewDebt(payData, user);
      res.status(201).json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }


  async payAllRemainingMonths(req: Request, res: Response, next: NextFunction) {
    return dashboardPaymentController.payAllRemainingMonths(req, res, next);
  }

  /**
   * ✅ YANGI: Qolgan qarzni to'lash
   * Bot'dan qolgan qarzni to'lash uchun
   * Dashboard payRemaining controller'idan foydalaniladi
   */
  async payRemaining(req: Request, res: Response, next: NextFunction) {
    return dashboardPaymentController.payRemaining(req, res, next);
  }

  /**
   * Manager'ning PENDING to'lovlarini olish
   * GET /api/bot/payment/my-pending
   */
  async getMyPendingPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "Autentifikatsiya qilinmagan",
        });
      }

      const result = await paymentService.getMyPendingPayments(user);
      res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * PENDING to'lovlar statistikasi
   * GET /api/bot/payment/my-pending-stats
   */
  async getMyPendingStats(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "Autentifikatsiya qilinmagan",
        });
      }

      const result = await paymentService.getMyPendingStats(user);
      res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * ✅ YANGI: To'lov uchun eslatma sanasini belgilash
   * POST /api/bot/payment/set-reminder
   * Body: { contractId, targetMonth, reminderDate }
   */
  async setReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "Autentifikatsiya qilinmagan",
        });
      }

      const { contractId, targetMonth, reminderDate } = req.body;

      if (!contractId || !targetMonth || !reminderDate) {
        return res.status(400).json({
          status: "error",
          message: "contractId, targetMonth va reminderDate majburiy",
        });
      }

      const result = await paymentService.setPaymentReminder(
        contractId,
        targetMonth,
        reminderDate,
        user
      );
      
      res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * ✅ YANGI: To'lov eslatmasini o'chirish
   * POST /api/bot/payment/remove-reminder
   * Body: { contractId, targetMonth }
   */
  async removeReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "Autentifikatsiya qilinmagan",
        });
      }

      const { contractId, targetMonth } = req.body;

      if (!contractId || !targetMonth) {
        return res.status(400).json({
          status: "error",
          message: "contractId va targetMonth majburiy",
        });
      }

      const result = await paymentService.removePaymentReminder(
        contractId,
        targetMonth,
        user
      );
      
      res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

export default new PaymentController();
