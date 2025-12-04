import { Request, Response, NextFunction } from "express";
import cashService from "../services/cash.service";
import BaseError from "../../utils/base.error";
import logger from "../../utils/logger";

class CashController {
  /**
   * DEPRECATED: Eski getAll() metodi
   * Yangi getPendingPayments() metodidan foydalaning
   * Bu metod getPendingPayments() ga yo'naltiriladi
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      logger.warn(
        "⚠️ DEPRECATED: /cash/get-all endpoint is deprecated. Use /cash/pending instead."
      );

      // getPendingPayments ga yo'naltirish
      const data = await cashService.getPendingPayments();

      // Response format standardizatsiya
      return res.status(200).json({
        success: true,
        message: "Pending to'lovlar muvaffaqiyatli olindi",
        data,
        count: data.length,
      });
    } catch (error) {
      logger.error("❌ Error in getAll controller:", error);
      return next(error);
    }
  }

  /**
   * DEPRECATED: Eski confirmations() metodi
   * Yangi confirmPayments() metodidan foydalaning
   */
  async confirmations(req: Request, res: Response, next: NextFunction) {
    try {
      logger.warn(
        "⚠️ DEPRECATED: /cash/confirmation endpoint is deprecated. Use /cash/confirm-payments instead."
      );

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

      // confirmPayments ga yo'naltirish
      const data = await cashService.confirmPayments(cashIds, user);

      // Response format standardizatsiya
      return res.status(200).json({
        success: data.success,
        message: data.message,
        data: data.results,
        summary: data.summary,
      });
    } catch (error) {
      logger.error("❌ Error in confirmations controller:", error);
      return next(error);
    }
  }

  /**
   * Pending to'lovlarni olish
   * Requirements: 9.1, 9.2
   */
  async getPendingPayments(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug("🔍 GET /cash/pending - Fetching pending payments");

      const data = await cashService.getPendingPayments();

      // Debug: birinchi payment'ni ko'rish
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
      logger.error("❌ Error in getPendingPayments controller:", error);
      return next(error);
    }
  }

  /**
   * To'lovlarni tasdiqlash
   * Requirements: 9.3, 9.4
   * SELLER'dan boshqa barcha role'lar tasdiqlashi mumkin
   */
  async confirmPayments(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug("✅ POST /cash/confirm-payments - Confirming payments");

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

      logger.debug("📋 Confirming payments:", {
        count: paymentIds.length,
        user: user.name,
        role: user.role,
      });

      const data = await cashService.confirmPayments(paymentIds, user);

      // Response format standardizatsiya
      return res.status(200).json({
        success: data.success,
        message: data.message,
        data: data.results,
        summary: data.summary,
      });
    } catch (error) {
      logger.error("❌ Error in confirmPayments controller:", error);
      return next(error);
    }
  }

  /**
   * To'lovni rad etish
   * Requirements: 9.5
   * SELLER'dan boshqa barcha role'lar rad etishi mumkin
   */
  async rejectPayment(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug("❌ POST /cash/reject-payment - Rejecting payment");

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

      logger.debug("📋 Rejecting payment:", {
        paymentId,
        reason: reason.substring(0, 50) + (reason.length > 50 ? "..." : ""),
        user: user.name,
        role: user.role,
      });

      const data = await cashService.rejectPayment(paymentId, reason, user);

      // Response format standardizatsiya
      return res.status(200).json({
        success: true,
        message: "To'lov muvaffaqiyatli rad etildi",
        data,
      });
    } catch (error) {
      logger.error("❌ Error in rejectPayment controller:", error);
      return next(error);
    }
  }
}

export default new CashController();
