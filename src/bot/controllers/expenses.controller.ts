import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import { RoleEnum } from "../../enums/role.enum";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import expensesService from "../services/expenses.service";
import { AddExpensesDto, UpdateExpensesDto } from "../../validators/expenses";
import logger from "../../utils/logger";

// const user: IJwtUser = {
//   sub: "686e7881ab577df7c3eb3db2",
//   name: "Farhod",
//   role: RoleEnum.MANAGER,
// };

class PaymentController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      logger.debug("req.query", req.query);

      const { isActive = "true" } = req.query;

      const data = await expensesService.getAll(user, isActive == "true");
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }

  async add(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const expensesData = plainToInstance(AddExpensesDto, req.body || {});
      const errors = await validate(expensesData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Xarajat ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await expensesService.add(expensesData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const expensesData = plainToInstance(UpdateExpensesDto, req.body || {});
      const errors = await validate(expensesData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Xarajat ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await expensesService.update(expensesData, user);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async return(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const { id } = req.body;
      if (!id) {
        return next(BaseError.BadRequest("ID mavjud emas"));
      }
      const data = await expensesService.return(id, user);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
}
export default new PaymentController();
