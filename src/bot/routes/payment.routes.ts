import { Router } from "express";
import paymentController from "../controllers/payment.controller";
const router = Router();

router.post("/pay-debt", paymentController.payDebt);
router.post("/pay-new-debt", paymentController.payNewDebt);
router.post("/pay-all-remaining", paymentController.payAllRemainingMonths);

router.post("/pay-remaining", paymentController.payRemaining);

router.get("/my-pending", paymentController.getMyPendingPayments);
router.get("/my-pending-stats", paymentController.getMyPendingStats);

router.post("/set-reminder", paymentController.setReminder);
router.post("/remove-reminder", paymentController.removeReminder);

export default router;
