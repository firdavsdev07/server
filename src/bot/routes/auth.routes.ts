import { Router } from "express";
import authController from "../controllers/auth.controller";

const router = Router();

router.post("/telegram", authController.telegram);
router.post("/check-registration", authController.checkRegistration);

export default router;
