import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import customerService from "../services/customer.service";
import IJwtUser from "../../types/user";
import { RoleEnum } from "../../enums/role.enum";
import logger from "../../utils/logger";

// const user: IJwtUser = {
//   sub: "686e7881ab577df7c3eb3db2",
//   name: "Farhod",
//   role: RoleEnum.MANAGER,
// };
class CustomerController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      const data = await customerService.getAll(user);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getUnpaidDebtors(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      // ✅ Query parametrdan filterDate ni olish
      const filterDate = req.query.date as string | undefined;
      const data = await customerService.getUnpaidDebtors(user, filterDate);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }
  async getPaidDebtors(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      const data = await customerService.getPaidDebtors(user);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const id = req.params.id;
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      const data = await customerService.getById(user, id);
      res.json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }

  async getCustomerContracts(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const id = req.params.id;
      if (!user) {
        return next(BaseError.ForbiddenError());
      }

      const data = await customerService.getCustomerContracts(id);
      res.json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }
}
export default new CustomerController();
