import { Router } from "express";
import { uploadCustomerFiles } from "../../middlewares/upload.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import customerController from "../controllers/customer.controller";

const router = Router();

router.get("/get-new-all", authenticate, customerController.getAllNew);

router.get("/get-one/:id", authenticate, customerController.getOne);

router.put(
  "/:id",
  authenticate,
  uploadCustomerFiles,
  customerController.update
);

router.post("", authenticate, uploadCustomerFiles, customerController.create);

export default router;
