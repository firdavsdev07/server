import { Router } from "express";
import paymentFixController from "../controllers/payment-fix.controller";

const router = Router();

/**
 * @route GET /api/payment/fix-unpaid/:contractId
 * @desc To'lanmagan to'lovlarni tuzatish
 * @access Public (for testing)
 */
router.get(
  "/fix-unpaid/:contractId",
  paymentFixController.fixUnpaidPayments
);

export default router;
