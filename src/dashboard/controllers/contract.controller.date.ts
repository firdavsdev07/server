

import { Request, Response, NextFunction } from "express";
import contractDateHandler from "../services/contract/contract.date.handler";
import BaseError from "../../utils/base.error";
import logger from "../../utils/logger";

class ContractDateController {

  async updateStartDate(req: Request, res: Response, next: NextFunction) {
    try {

      const { contractId, newStartDate, reason } = req.body;

      if (!contractId || !newStartDate) {
        throw BaseError.BadRequest("contractId va newStartDate majburiy");
      }

      const user = req.user;
      if (!user) {
        throw BaseError.UnauthorizedError("Foydalanuvchi topilmadi");
      }

      const result = await contractDateHandler.updateContractStartDate(
        {
          contractId,
          newStartDate: new Date(newStartDate),
          reason,
        },
        user
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error(" Error in updateStartDate:", error);
      next(error);
    }
  }


  async previewDateChange(req: Request, res: Response, next: NextFunction) {
    try {

      const { contractId, newStartDate } = req.body;

      if (!contractId || !newStartDate) {
        throw BaseError.BadRequest("contractId va newStartDate majburiy");
      }

      const result = await contractDateHandler.previewDateChange(
        contractId,
        new Date(newStartDate)
      );

      res.status(200).json(result);
    } catch (error) {
      logger.error("Error in previewDateChange:", error);
      next(error);
    }
  }
}

export default new ContractDateController();
