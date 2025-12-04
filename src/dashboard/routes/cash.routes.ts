import { Router } from "express";
import { Permission } from "../../enums/permission.enum";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import { rateLimit } from "../../middlewares/rateLimit.middleware";
import cashController from "../controllers/cash.controller";

const router = Router();

// Rate limiting: 100 requests per minute
const cashRateLimit = rateLimit(100, 60 * 1000);

/**
 * DEPRECATED: Eski route'lar
 * Yangi route'lardan foydalaning
 */
router.get(
  "/get-all",
  cashRateLimit,
  checkPermission(Permission.VIEW_CASH),
  cashController.getAll
);

router.put(
  "/confirmation",
  cashRateLimit,
  checkPermission(Permission.UPDATE_CASH),
  cashController.confirmations
);

/**
 * Yangi route'lar
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

// Pending to'lovlarni olish
router.get(
  "/pending",
  cashRateLimit,
  checkPermission(Permission.VIEW_CASH),
  cashController.getPendingPayments
);

// To'lovlarni tasdiqlash
router.post(
  "/confirm-payments",
  cashRateLimit,
  checkPermission(Permission.UPDATE_CASH),
  cashController.confirmPayments
);

// To'lovni rad etish
router.post(
  "/reject-payment",
  cashRateLimit,
  checkPermission(Permission.UPDATE_CASH),
  cashController.rejectPayment
);

export default router;
