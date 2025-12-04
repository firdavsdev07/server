import { Router } from "express";
import authController from "../controllers/auth.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = Router();

router.post("/login", authController.login);
router.get("/get-user", authenticate, authController.getUser);
router.get("/refresh", authController.refresh);
router.get("/logout", authController.logout);

export default router;
