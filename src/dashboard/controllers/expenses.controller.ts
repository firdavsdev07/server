import { Request, Response, NextFunction } from "express";
import BaseError from "../../utils/base.error";
import expensesService from "../services/expenses.service";

class EmployeeController {
  async return(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.body;
      if (!id) {
        return next(BaseError.BadRequest("ID mavjud emas"));
      }
      const data = await expensesService.return(id);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }

  async getExpenses(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const data = await expensesService.get(id, page, limit);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
}

export default new EmployeeController();
