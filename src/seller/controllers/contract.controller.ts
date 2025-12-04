import { Request, Response, NextFunction } from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import BaseError from "../../utils/base.error";
import { CreateContractDtoForSeller } from "../validators/contract";
import contractService from "../services/contract.service";
import logger from "../../utils/logger";

class ContractController {
  // Faol shartnomalarni olish
  async getActiveContracts(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        return next(BaseError.UnauthorizedError());
      }
      const contracts = await contractService.getActiveContracts(req.user.sub);
      res.status(200).json(contracts);
    } catch (error) {
      logger.debug("error", error);
      return next(error);
    }
  }

  // Yangi shartnomalarni olish
  async getNewContracts(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        return next(BaseError.UnauthorizedError());
      }
      const contracts = await contractService.getNewContracts(req.user.sub);
      res.status(200).json(contracts);
    } catch (error) {
      logger.debug("error", error);
      return next(error);
    }
  }

  // Yopilgan shartnomalarni olish
  async getCompletedContracts(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        return next(BaseError.UnauthorizedError());
      }
      const contracts = await contractService.getCompletedContracts(
        req.user.sub
      );
      res.status(200).json(contracts);
    } catch (error) {
      logger.debug("error", error);
      return next(error);
    }
  }

  // Shartnoma detailini olish
  async getContractById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        return next(BaseError.UnauthorizedError());
      }
      const { id } = req.params;
      const contract = await contractService.getContractById(id, req.user.sub);
      res.status(200).json(contract);
    } catch (error) {
      logger.debug("error", error);
      return next(error);
    }
  }

  // Shartnomani tahrirlash
  async updateContract(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        return next(BaseError.UnauthorizedError());
      }
      const { id } = req.params;
      const result = await contractService.updateContract(
        id,
        req.body,
        req.user.sub
      );
      res.status(200).json(result);
    } catch (error) {
      logger.debug("error", error);
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const customerData = plainToInstance(
        CreateContractDtoForSeller,
        req.body || {}
      );
      const errors = await validate(customerData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Shartnoma ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await contractService.create(customerData, req.user?.sub);
      res.status(201).json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }

  async post(req: Request, res: Response, next: NextFunction) {
    try {
      const customerData: any = req.body;
      const data = await contractService.post(customerData);
      res.status(201).json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }
}

export default new ContractController();
