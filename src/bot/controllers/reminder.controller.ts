import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import reminderService from "../services/reminder.service";
import logger from "../../utils/logger";

class ReminderController {
  /**
   * Oy uchun reminder mavjudligini tekshirish
   * GET /api/bot/reminder/check-month?contractId=xxx&targetMonth=1
   */
  async checkMonthReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { contractId, targetMonth } = req.query;

      logger.debug("📅 CHECK MONTH REMINDER REQUEST:", {
        contractId,
        targetMonth,
        manager: user.name,
      });

      // Validation
      if (!contractId) {
        return next(BaseError.BadRequest("Contract ID kiritilmagan"));
      }

      if (!targetMonth) {
        return next(BaseError.BadRequest("Target month kiritilmagan"));
      }

      const data = await reminderService.checkMonthReminder(
        contractId as string,
        parseInt(targetMonth as string),
        user
      );

      res.status(200).json(data);
    } catch (error) {
      logger.error("❌ Check month reminder error:", error);
      return next(error);
    }
  }
}

export default new ReminderController();