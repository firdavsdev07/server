import { Router } from "express";
import expensesController from "../controllers/expenses.controller";
const router = Router();

router.get("/get-all", expensesController.getAll);
router.post("/", expensesController.add);
router.put("/", expensesController.getAll);
router.put("/return", expensesController.return);

export default router;
