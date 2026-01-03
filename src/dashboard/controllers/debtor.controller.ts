import { Request, Response, NextFunction } from "express";
import debtorService from "../services/debtor.service";

class DebtorController {
  async getDebtors(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await debtorService.getDebtors();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getContract(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const data = await debtorService.getContract(
        startDate as string,
        endDate as string
      );
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async declareDebtors(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const contractIds = req.body.contractIds;

      const data = await debtorService.declareDebtors(user, contractIds);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async payDebt(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { debtorId, amount, date, notes, method } = req.body;

      if (!debtorId || !amount) {
        return res.status(400).json({
          message: "Debtor ID va to'lov summasi majburiy",
        });
      }

      const paymentService = (await import("../services/payment.service"))
        .default;
      const data = await paymentService.update(
        {
          id: debtorId,
          amount: Number(amount),
          notes: notes || "",
          currencyDetails: {
            dollar: Number(amount),
            sum: 0,
          },
          currencyCourse: 12500,
        },
        user
      );

      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
}

export default new DebtorController();
