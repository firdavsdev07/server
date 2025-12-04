import { Router } from "express";
import employeeController from "../controllers/employee.controller";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import { Permission } from "../../enums/permission.enum";

const router = Router();

router.get(
  "/get-all",
  checkPermission(Permission.VIEW_EMPLOYEE),
  employeeController.getAll
);
router.get(
  "/by-id/:id",
  checkPermission(Permission.VIEW_EMPLOYEE),
  employeeController.get
);

router.get(
  "/manager",
  // checkPermission(Permission.VIEW_EMPLOYEE),
  employeeController.getManager
);
router.post(
  "",
  checkPermission(Permission.CREATE_EMPLOYEE),
  employeeController.create
);
router.put(
  "",
  checkPermission(Permission.UPDATE_EMPLOYEE),
  employeeController.update
);
router.put(
  "/withdraw",
  checkPermission(Permission.UPDATE_EMPLOYEE),
  employeeController.withdrawFromBalance
);
router.delete(
  "/:id",
  checkPermission(Permission.DELETE_EMPLOYEE),
  employeeController.delete
);

export default router;
