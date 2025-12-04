import { Request, Response, NextFunction } from "express";
import employeeService from "../services/employee.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { handleValidationErrors } from "../../validators/format";
import BaseError from "../../utils/base.error";
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
} from "../../validators/employee";
import { withdrawFromBalanceDto } from "../../validators/expenses";

class EmployeeController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await employeeService.getAll();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const data = await employeeService.get(id);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getManager(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await employeeService.getManager();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const employeeData = plainToInstance(CreateEmployeeDto, req.body || {});
      const errors = await validate(employeeData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Xodim malumotlari xato.", formattedErrors)
        );
      }
      const data = await employeeService.create(employeeData, user);
      res.status(201).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeData = plainToInstance(UpdateEmployeeDto, req.body || {});
      const errors = await validate(employeeData);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Xodim malumotlari xato.", formattedErrors)
        );
      }
      const data = await employeeService.update(employeeData);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
  async withdrawFromBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const withdraw = plainToInstance(withdrawFromBalanceDto, req.body || {});
      const errors = await validate(withdraw);
      if (errors.length > 0) {
        const formattedErrors = handleValidationErrors(errors);
        return next(
          BaseError.BadRequest("Yechish malumotlari xato.", formattedErrors)
        );
      }
      const data = await employeeService.withdrawFromBalance(withdraw);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const data = await employeeService.delete(id);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }
}

export default new EmployeeController();
