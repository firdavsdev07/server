import { Request, Response, NextFunction } from "express";
import cashService from "../services/cash.service";
import BaseError from "../../utils/base.error";
import logger from "../../utils/logger";

class CashController {

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
 

      const data = await cashService.getPendingPayments();

      return res.status(200).json({
        success: true,
        message: "Pending to'lovlar muvaffaqiyatli olindi",
        data,
        count: data.length,
      });
    } catch (error) {
      logger.error("Error in getAll controller:", error);
      return next(error);
    }
  }


  async confirmations(req: Request, res: Response, next: NextFunction) {
    try {


      const user = req.user;
      const { cashIds } = req.body;

      // Validation
      if (!user) {
        throw BaseError.UnauthorizedError(
          "Foydalanuvchi autentifikatsiya qilinmagan"
        );
      }

      if (!cashIds || !Array.isArray(cashIds) || cashIds.length === 0) {
        throw BaseError.BadRequest("To'lov ID lari kiritilmagan");
      }

      const data = await cashService.confirmPayments(cashIds, user);

      return res.status(200).json({
        success: data.success,
        message: data.message,
        data: data.results,
        summary: data.summary,
      });
    } catch (error) {
      logger.error("Error in confirmations controller:", error);
      return next(error);
    }
  }

  async getPendingPayments(req: Request, res: Response, next: NextFunction) {
    try {

      const data = await cashService.getPendingPayments();

      if (data.length > 0) {
        logger.debug("📋 First payment sample:", {
          _id: data[0]._id,
          contractId: data[0].contractId,
          amount: data[0].amount,
          hasContractId: !!data[0].contractId,
        });
      }

      // Response format standardizatsiya
      return res.status(200).json({
        success: true,
        message: "Pending to'lovlar muvaffaqiyatli olindi",
        data,
        count: data.length,
      });
    } catch (error) {
      logger.error("Error in getPendingPayments controller:", error);
      return next(error);
    }
  }


  async confirmPayments(req: Request, res: Response, next: NextFunction) {
    try {

      const user = req.user;
      const { paymentIds } = req.body;

      // Validation
      if (!user) {
        throw BaseError.UnauthorizedError(
          "Foydalanuvchi autentifikatsiya qilinmagan"
        );
      }

      // Role tekshiruvi - SELLER tasdiqlashi mumkin emas
      if (user.role === "seller") {
        throw BaseError.ForbiddenError(
          "Seller to'lovlarni tasdiqlashi mumkin emas"
        );
      }

      if (
        !paymentIds ||
        !Array.isArray(paymentIds) ||
        paymentIds.length === 0
      ) {
        throw BaseError.BadRequest("To'lov ID lari kiritilmagan");
      }



      const data = await cashService.confirmPayments(paymentIds, user);

      // Response format standardizatsiya
      return res.status(200).json({
        success: data.success,
        message: data.message,
        data: data.results,
        summary: data.summary,
      });
    } catch (error) {
      logger.error(" Error in confirmPayments controller:", error);
      return next(error);
    }
  }


  async rejectPayment(req: Request, res: Response, next: NextFunction) {
    try {

      const user = req.user;
      const { paymentId, reason } = req.body;

      // Validation
      if (!user) {
        throw BaseError.UnauthorizedError(
          "Foydalanuvchi autentifikatsiya qilinmagan"
        );
      }

      // Role tekshiruvi - SELLER rad etishi mumkin emas
      if (user.role === "seller") {
        throw BaseError.ForbiddenError(
          "Seller to'lovlarni rad etishi mumkin emas"
        );
      }

      if (!paymentId) {
        throw BaseError.BadRequest("To'lov ID si kiritilmagan");
      }

      if (!reason || reason.trim().length === 0) {
        throw BaseError.BadRequest("Rad etish sababi kiritilmagan");
      }


      const data = await cashService.rejectPayment(paymentId, reason, user);

      return res.status(200).json({
        success: true,
        message: "To'lov muvaffaqiyatli rad etildi",
        data,
      });
    } catch (error) {
      logger.error(" Error in rejectPayment controller:", error);
      return next(error);
    }
  }
}

export default new CashController();
