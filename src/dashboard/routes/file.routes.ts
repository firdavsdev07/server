import { Router } from "express";
import fileController from "../controllers/file.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = Router();

// Download file endpoint - faqat authentication kerak
router.get(
  "/download/:type/:filename",
  authenticate,
  fileController.downloadFile
);

// Delete file endpoint
router.delete(
  "/delete/:customerId/:type",
  authenticate,
  fileController.deleteFile
);

export default router;
