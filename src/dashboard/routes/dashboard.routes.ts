import { Router } from "express";
import dashboardController from "../controllers/dashboard.controller";
const router = Router();

router.get("/", dashboardController.dashboard);
router.get("/statistic", dashboardController.statistic);
router.get("/currency-course", dashboardController.currencyCourse);
router.put("/currency-course", dashboardController.changeCurrency);

export default router;
