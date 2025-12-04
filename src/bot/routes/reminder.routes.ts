import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import reminderController from "../controllers/reminder.controller";

const router = Router();

// Reminder check endpoint
router.get("/check-month", authenticate, reminderController.checkMonthReminder);

export default router;