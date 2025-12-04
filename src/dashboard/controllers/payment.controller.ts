import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import { RoleEnum } from "../../enums/role.enum";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PayDebtDto, PayNewDebtDto } from "../../validators/payment";
import { handleValidationErrors } from "../../validators/format";
import paymentService from "../services/payment.service";
import logger from "../../utils/logger";
// import paymentService from "../services/payment.service";

// const user: IJwtUser = {
//   sub: "686e7881ab577df7c3eb3db2",
//   name: "Farhod",
//   role: RoleEnum.MANAGER,
// };
class PaymentController {
  async update(req: Request, res: Response, next: NextFunction) {
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
      const data = await paymentService.update(payData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getPaymentHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, contractId, status, paymentType, dateFrom, dateTo, isPaid } = req.query;

      // ✅ C3: Parse filters from query params
      const filters: any = {};

      if (status) {
        filters.status = Array.isArray(status) ? status : [status];
      }

      if (paymentType) {
        filters.paymentType = Array.isArray(paymentType) ? paymentType : [paymentType];
      }

      if (dateFrom) {
        filters.dateFrom = new Date(dateFrom as string);
      }

      if (dateTo) {
        filters.dateTo = new Date(dateTo as string);
      }

      if (isPaid !== undefined) {
        filters.isPaid = isPaid === 'true';
      }

      const data = await paymentService.getPaymentHistory(
        customerId as string,
        contractId as string,
        Object.keys(filters).length > 0 ? filters : undefined
      );
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Qolgan qarzni to'lash (mavjud to'lovga qo'shimcha)
   */
  async payRemaining(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { paymentId, amount, notes, currencyDetails, currencyCourse } = req.body;

      logger.debug("💰 === PAY REMAINING (DASHBOARD) ===");
      logger.debug("Payment ID:", paymentId);
      logger.debug("Amount:", amount);

      // Validation
      if (!paymentId) {
        return next(BaseError.BadRequest("Payment ID kiritilmagan"));
      }

      if (!amount || amount <= 0) {
        return next(BaseError.BadRequest("To'lov summasi noto'g'ri"));
      }

      const data = await paymentService.payRemaining(
        {
          paymentId,
          amount,
          notes: notes || "",
          currencyDetails: currencyDetails || { dollar: amount, sum: 0 },
          currencyCourse: currencyCourse || 12500,
        },
        user
      );

      res.status(200).json(data);
    } catch (error) {
      logger.error("❌ Error in payRemaining:", error);
      return next(error);
    }
  }

  async payByContract(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { contractId, amount, notes, currencyDetails, currencyCourse } =
        req.body;

      logger.debug("📥 payByContract request:", {
        contractId,
        amount,
        notes,
        currencyDetails,
        currencyCourse,
        user: user?.name,
      });

      // ✅ TEMPORARY FIX: Agar notes'da [PAY_REMAINING:paymentId] bo'lsa, payRemaining'ni chaqiramiz
      if (notes && notes.includes("[PAY_REMAINING:")) {
        logger.debug("🔍 Checking for PAY_REMAINING tag in notes:", notes);
        const match = notes.match(/\[PAY_REMAINING:([^\]]+)\]/);
        logger.debug("🔍 Regex match result:", match);

        if (match && match[1]) {
          const paymentId = match[1];
          const cleanNotes = notes.replace(/\[PAY_REMAINING:[^\]]+\]\s*/, "");

          logger.debug("💰 ✅ Detected PAY_REMAINING request:", {
            paymentId,
            amount,
            cleanNotes,
          });

          const data = await paymentService.payRemaining(
            {
              paymentId,
              amount,
              notes: cleanNotes,
              currencyDetails: currencyDetails || { dollar: amount, sum: 0 },
              currencyCourse: currencyCourse || 12500,
            },
            user
          );

          return res.status(200).json(data);
        } else {
          logger.debug("❌ PAY_REMAINING tag found but regex didn't match");
        }
      } else {
        logger.info("ℹ️ No PAY_REMAINING tag in notes, proceeding with normal payment");
      }

      // Batafsil validatsiya
      const validationErrors = [];

      if (!contractId) validationErrors.push("contractId yo'q");
      if (!amount || amount <= 0) validationErrors.push("amount noto'g'ri");
      if (!currencyDetails) validationErrors.push("currencyDetails yo'q");
      else {
        if (currencyDetails.dollar === undefined) validationErrors.push("currencyDetails.dollar yo'q");
        if (currencyDetails.sum === undefined) validationErrors.push("currencyDetails.sum yo'q");
      }
      if (!currencyCourse || currencyCourse <= 0) validationErrors.push("currencyCourse noto'g'ri");

      if (validationErrors.length > 0) {
        logger.error("❌ payByContract validation failed:", {
          errors: validationErrors,
          receivedData: {
            contractId,
            amount,
            currencyDetails,
            currencyCourse,
          },
        });
        return next(BaseError.BadRequest(`To'lov ma'lumotlari to'liq emas: ${validationErrors.join(", ")}`));
      }

      const data = await paymentService.payByContract(
        {
          contractId,
          amount,
          notes,
          currencyDetails,
          currencyCourse,
        },
        user
      );

      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  // Yangi endpoint'lar - Payment Service uchun

  async receivePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { ReceivePaymentDto } = await import("../../validators/payment");
      const payData = plainToInstance(ReceivePaymentDto, req.body || {});
      const errors = await validate(payData);

      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("To'lov ma'lumotlari xato.", formattedErrors)
        );
      }

      const data = await paymentService.receivePayment(payData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async confirmPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { paymentId } = req.body;

      if (!paymentId) {
        return next(BaseError.BadRequest("Payment ID bo'sh bo'lmasligi kerak"));
      }

      const data = await paymentService.confirmPayment(paymentId, user);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async rejectPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { paymentId, reason } = req.body;

      if (!paymentId || !reason) {
        return next(
          BaseError.BadRequest("Payment ID va sabab bo'sh bo'lmasligi kerak")
        );
      }

      const data = await paymentService.rejectPayment(paymentId, reason, user);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async payAllRemainingMonths(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug("🎯 payAllRemainingMonths CALLED!");
      logger.debug("📦 Request body:", req.body);
      logger.debug("👤 Request user:", req.user);

      const user = req.user;
      const { contractId, amount, notes, currencyDetails, currencyCourse } =
        req.body;

      logger.debug("📥 payAllRemainingMonths request:", {
        contractId,
        amount,
        notes,
        currencyDetails,
        currencyCourse,
        user: user?.name,
      });

      // Agar user yo'q bo'lsa
      if (!user) {
        logger.error("❌ User not found in request");
        return next(BaseError.UnauthorizedError("Foydalanuvchi autentifikatsiya qilinmagan"));
      }

      // Batafsil validatsiya
      const validationErrors = [];

      if (!contractId) validationErrors.push("contractId yo'q");
      if (!amount || amount <= 0) validationErrors.push("amount noto'g'ri");
      if (!currencyDetails) validationErrors.push("currencyDetails yo'q");
      else {
        if (currencyDetails.dollar === undefined) validationErrors.push("currencyDetails.dollar yo'q");
        if (currencyDetails.sum === undefined) validationErrors.push("currencyDetails.sum yo'q");
      }
      if (!currencyCourse || currencyCourse <= 0) validationErrors.push("currencyCourse noto'g'ri");

      if (validationErrors.length > 0) {
        logger.error("❌ payAllRemainingMonths validation failed:", {
          errors: validationErrors,
          receivedData: {
            contractId,
            amount,
            currencyDetails,
            currencyCourse,
          },
        });
        return next(BaseError.BadRequest(`To'lov ma'lumotlari to'liq emas: ${validationErrors.join(", ")}`));
      }

      const data = await paymentService.payAllRemainingMonths(
        {
          contractId,
          amount,
          notes,
          currencyDetails,
          currencyCourse,
        },
        user
      );

      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * ✅ YANGI: PENDING to'lovlarni tekshirish va muddati o'tganlarni rad etish
   */
  async checkAndRejectExpiredPayments(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      logger.info("🕐 checkAndRejectExpiredPayments API called");

      const result = await paymentService.checkAndRejectExpiredPayments();

      logger.debug(`✅ ${result.rejectedCount} payment(s) rejected`);

      res.status(200).json({
        status: "success",
        message: `${result.rejectedCount} muddati o'tgan PENDING to'lov rad etildi`,
        ...result,
      });
    } catch (error) {
      logger.error("❌ Error in checkAndRejectExpiredPayments:", error);
      return next(error);
    }
  }
}

export default new PaymentController();
