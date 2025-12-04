import { Router } from "express";
import expensesController from "../controllers/expenses.controller";
import { Permission } from "../../enums/permission.enum";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
const router = Router();

router.get(
  "/:id",
  checkPermission(Permission.VIEW_EMPLOYEE),
  expensesController.getExpenses
);

router.put("/return", expensesController.return);

export default router;
