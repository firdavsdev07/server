import { Request, Response, NextFunction } from "express";
import userService from "../services/user.service";

class UserController {
  async check(req: Request, res: Response, next: NextFunction) {
    try {
      const { telegramId } = req.body;
      if (!telegramId) {
        res.json({ status: "error", message: "telegram id does not exist" });
      }

      const data = await userService.check(telegramId);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }
  async phone(req: Request, res: Response, next: NextFunction) {
    try {
      const { telegramId, phoneNumber } = req.body;
      if (!telegramId || !phoneNumber) {
        res.json({ status: "error", message: "telegram id does not exist" });
      }

      const data = await userService.phone(telegramId, phoneNumber);
      res.json(data);
    } catch (error) {
      return next(error);
    }
  }
}
export default new UserController();
