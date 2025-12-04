import { Request, Response, NextFunction } from "express";
import IJwtUser from "../../types/user";
import { RoleEnum } from "../../enums/role.enum";
import dashboardService from "../services/dashboard.service";

// const user: IJwtUser = {
//   sub: "686e7881ab577df7c3eb3db2",
//   name: "Farhod",
//   role: RoleEnum.MANAGER,
// };
class DashboardController {
  async dashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const data = await dashboardService.dashboard(user);
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
  async currencyCourse(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const data = await dashboardService.currencyCourse();
      res.status(200).json(data);
    } catch (error) {
      return next(error);
    }
  }
}
export default new DashboardController();
