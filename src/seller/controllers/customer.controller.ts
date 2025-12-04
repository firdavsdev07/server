import { Request, Response, NextFunction } from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import BaseError from "../../utils/base.error";
import customerService from "../services/customer.service";
import { CreateCustomerDtoForSeller } from "../validators/customer";
import logger from "../../utils/logger";

class CustomerController {
  async getAllNew(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user.sub;
      const data = await customerService.getAllNew(userId);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await customerService.getOne(id);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customerData = plainToInstance(
        CreateCustomerDtoForSeller,
        req.body || {}
      );
      const errors = await validate(customerData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Mijoz ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.update(id, customerData, req.files);
      res.status(200).json(data);
    } catch (error) {
      logger.debug("error", error);
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const customerData = plainToInstance(
        CreateCustomerDtoForSeller,
        req.body || {}
      );
      const errors = await validate(customerData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Mijoz ma'lumotlari xato.", formattedErrors)
        );
      }
      const data = await customerService.create(customerData, user, req.files);
      res.status(201).json(data);
    } catch (error) {
      logger.debug("error", error);

      return next(error);
    }
  }
}

export default new CustomerController();
