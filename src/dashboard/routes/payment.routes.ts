import { Router } from "express";
import paymentController from "../controllers/payment.controller";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import { Permission } from "../../enums/permission.enum";
const router = Router();

router.put(
  "",
  checkPermission(Permission.UPDATE_CASH),
  paymentController.update
);

router.post(
  "/contract",
  authenticate, // Oddiy authentication
  paymentController.payByContract
);

router.get(
  "/history",
  checkPermission(Permission.VIEW_PAYMENT),
  paymentController.getPaymentHistory
);

// Yangi route'lar - Payment Service uchun
router.post(
  "/receive",
  checkPermission(Permission.UPDATE_CASH),
  paymentController.receivePayment
);

router.post(
  "/confirm",
  checkPermission(Permission.UPDATE_CASH),
  paymentController.confirmPayment
);

router.post(
  "/reject",
  checkPermission(Permission.UPDATE_CASH),
  paymentController.rejectPayment
);

// Barcha oylarni to'lash endpoint
router.post(
  "/pay-all-remaining",
  authenticate, // Oddiy authentication (permission tekshirilmaydi)
  paymentController.payAllRemainingMonths
);

// Qolgan qarzni to'lash endpoint (mavjud to'lovga qo'shimcha)
router.post(
  "/pay-remaining",
  authenticate, // Oddiy authentication
  paymentController.payRemaining
);

// ✅ YANGI: PENDING to'lovlarni tekshirish va muddati o'tganlarni rad etish
router.post(
  "/check-expired",
  checkPermission(Permission.UPDATE_CASH), // Faqat kassa uchun
  paymentController.checkAndRejectExpiredPayments
);

export default router;
