import { Router } from "express";
import resetController from "../controllers/reset.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = Router();

/**
 * Reset routes - faqat super admin va admin uchun
 */

// Reset statistikasini olish
router.get("/stats", authenticate, resetController.getStats);

// Barcha ma'lumotlarni tozalash
router.post("/all", authenticate, resetController.resetAll);

// Barcha shartnomalarning statusini tekshirish
router.post("/check-contracts", authenticate, resetController.checkContracts);

export default router;
