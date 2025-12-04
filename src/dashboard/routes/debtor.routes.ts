import { Router } from "express";
import { Permission } from "../../enums/permission.enum";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import debtorController from "../controllers/debtor.controller";

const router = Router();

router.get(
  "/customers",
  checkPermission(Permission.VIEW_DEBTOR),
  debtorController.getDebtors
);

router.get(
  "/contracts",
  checkPermission(Permission.VIEW_DEBTOR),
  debtorController.getContract
);

router.post(
  "/announce",
  checkPermission(Permission.CREATE_DEBTOR),
  debtorController.declareDebtors
);

router.post(
  "/pay",
  checkPermission(Permission.UPDATE_DEBTOR),
  debtorController.payDebt
);

// router.post(
//   "/notify-debtors",
//   checkPermission(Permission.UPDATE_DEBTOR),
//   debtorController.notifyDebtors
// );
export default router;
