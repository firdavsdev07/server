import { Router } from "express";
import customerController from "../controllers/customer.controller";
import { botManager } from "../../middlewares/botManager.middleware";

const router = Router();

router.get("/get-all", customerController.getAll);
router.get("/get-debtor", customerController.getUnpaidDebtors);
router.get("/get-payment", customerController.getPaidDebtors);
router.get("/get-by-id/:id", customerController.getById);
router.get("/get-contract-by-id/:id", customerController.getCustomerContracts);

export default router;
