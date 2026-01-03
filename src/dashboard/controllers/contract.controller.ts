import { Request, Response, NextFunction } from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import BaseError from "../../utils/base.error";
import contractService from "../services/contract.service";
import {
  CreateContractDto,
  SellerCreateContractDto,
  UpdateContractDto,
} from "../../validators/contract";

class ContractController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await contractService.getAll();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getNewAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await contractService.getAllNewContract();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getAllCompleted(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await contractService.getAllCompleted();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getContractById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const data = await contractService.getContractById(id);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const contractData = plainToInstance(CreateContractDto, req.body || {});
      const errors = await validate(contractData);

      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Shartnoma ma'lumotlari xato.", formattedErrors)
        );
      }

      const data = await contractService.create(contractData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }


  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return next(
          BaseError.UnauthorizedError(
            "Foydalanuvchi autentifikatsiya qilinmagan"
          )
        );
      }

      const contractData = plainToInstance(UpdateContractDto, req.body || {});
      const errors = await validate(contractData);

      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Shartnoma ma'lumotlari xato.", formattedErrors)
        );
      }

      const result = await contractService.update(contractData, user);

      const response = {
        success: true,
        message: result.message,
        data: {
          changes: result.changes,
          impactSummary: {
            underpaidCount: result.impactSummary.underpaidCount,
            overpaidCount: result.impactSummary.overpaidCount,
            totalShortage: result.impactSummary.totalShortage,
            totalExcess: result.impactSummary.totalExcess,
            additionalPaymentsCreated:
              result.impactSummary.additionalPaymentsCreated,
          },
          affectedPaymentsCount: result.affectedPayments,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      return next(error);
    }
  }

  async sellerCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const contractData = plainToInstance(CreateContractDto, req.body || {});
      const errors = await validate(contractData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Shartnoma ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await contractService.sellerCreate(contractData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async approveContract(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = req.user;
      const data = await contractService.approveContract(id, user);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Ta'sir tahlili - shartnoma tahrirlashdan oldin
   * Requirements: 1.2, 1.3, 1.4, 1.5
   */
  async analyzeImpact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { monthlyPayment, initialPayment, totalPrice } = req.body;

      if (!monthlyPayment || monthlyPayment < 0) {
        throw BaseError.BadRequest("Oylik to'lov noto'g'ri");
      }

      if (initialPayment !== undefined && initialPayment < 0) {
        throw BaseError.BadRequest("Boshlang'ich to'lov noto'g'ri");
      }

      if (totalPrice !== undefined && totalPrice <= initialPayment) {
        throw BaseError.BadRequest(
          "Umumiy narx boshlang'ich to'lovdan katta bo'lishi kerak"
        );
      }

      const result = await contractService.analyzeContractEditImpact(id, {
        monthlyPayment,
        initialPayment,
        totalPrice,
      });

      res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * O'chirish - shartnomani o'chirish (soft delete)
   */
  async deleteContract(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        return next(
          BaseError.UnauthorizedError(
            "Foydalanuvchi autentifikatsiya qilinmagan"
          )
        );
      }

      const result = await contractService.deleteContract(id, user);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  }

  async hardDeleteContract(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        return next(
          BaseError.UnauthorizedError(
            "Foydalanuvchi autentifikatsiya qilinmagan"
          )
        );
      }

      const result = await contractService.hardDeleteContract(id, user);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  }
}

export default new ContractController();
