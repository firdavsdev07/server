import { Router } from "express";
import { updatePaymentDate } from "../controllers/contract.controller";

const router = Router();

router.put("/update-payment-date", updatePaymentDate);

export default router;
