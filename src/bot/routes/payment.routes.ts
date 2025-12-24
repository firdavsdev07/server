import { Router } from "express";
import paymentController from "../controllers/payment.controller";
const router = Router();

router.post("/pay-debt", paymentController.payDebt);
router.post("/pay-new-debt", paymentController.payNewDebt);
router.post("/pay-all-remaining", paymentController.payAllRemainingMonths);

// ✅ TUZATISH: Qolgan qarzni to'lash endpoint (404 xatosini tuzatish uchun)
router.post("/pay-remaining", paymentController.payRemaining);

// ✅ YANGI: A5 - PENDING to'lovlar API
router.get("/my-pending", paymentController.getMyPendingPayments);
router.get("/my-pending-stats", paymentController.getMyPendingStats);

// ✅ YANGI: Reminder API
router.post("/set-reminder", paymentController.setReminder);
router.post("/remove-reminder", paymentController.removeReminder);

export default router;
