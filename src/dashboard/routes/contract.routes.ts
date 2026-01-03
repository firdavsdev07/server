import { Router } from "express";
import { Permission } from "../../enums/permission.enum";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import contractController from "../controllers/contract.controller";
import contractDateController from "../controllers/contract.controller.date";

const router = Router();

router.get(
  "/get-all",
  checkPermission(Permission.VIEW_CONTRACT),
  contractController.getAll
);

router.get(
  "/get-new-all",
  checkPermission(Permission.VIEW_CONTRACT),
  contractController.getNewAll
);

router.get(
  "/get-all-completed",
  // checkPermission(Permission.VIEW_CONTRACT),
  contractController.getAllCompleted
);

router.get(
  "/get-contract-by-id/:id",
  checkPermission(Permission.VIEW_CONTRACT),
  contractController.getContractById
);

router.post(
  "",
  checkPermission(Permission.CREATE_CONTRACT),
  contractController.create
);

router.put(
  "",
  checkPermission(Permission.UPDATE_CONTRACT),
  contractController.update
);

router.post(
  "/seller",
  checkPermission(Permission.CONTRACT_CREATE_MANAGER),
  contractController.sellerCreate
);

router.post(
  "/approve/:id",
  checkPermission(Permission.UPDATE_CONTRACT),
  contractController.approveContract
);

router.post(
  "/analyze-impact/:id",
  checkPermission(Permission.UPDATE_CONTRACT),
  contractController.analyzeImpact
);

router.delete(
  "/delete/:id",
  checkPermission(Permission.DELETE_CONTRACT),
  contractController.deleteContract
);

// ========================================
// 🔥 HARD DELETE CONTRACT (PERMANENT)
// ONLY: admin, moderator
// ⚠️ WARNING: This action is IRREVERSIBLE!
// ========================================
router.delete(
  "/hard-delete/:id",
  checkPermission(Permission.DELETE_CONTRACT),
  contractController.hardDeleteContract
);

// ========================================
// 📅 CONTRACT DATE EDIT ROUTES
// ONLY: admin, moderator
// ========================================

router.post(
  "/update-start-date",
  checkPermission(Permission.UPDATE_CONTRACT),
  contractDateController.updateStartDate
);

router.post(
  "/preview-date-change",
  checkPermission(Permission.VIEW_CONTRACT),
  contractDateController.previewDateChange
);

export default router;
