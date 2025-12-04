import { Router } from "express";
import dashboardController from "../controllers/dashboard.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = Router();

// Protected routes - authentication required
router.get("/", authenticate, dashboardController.dashboard);
router.get("/currency-course", authenticate, dashboardController.currencyCourse);

export default router;
