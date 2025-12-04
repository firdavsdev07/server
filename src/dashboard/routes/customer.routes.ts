import { Router } from "express";
import { Permission } from "../../enums/permission.enum";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import { uploadCustomerFiles } from "../../middlewares/upload.middleware";
import customerController from "../controllers/customer.controller";

const router = Router();

router.get(
  "/get-all-customer",
  checkPermission(Permission.VIEW_CUSTOMER),
  customerController.getAllCustomer
);

router.get(
  "/get-all",
  checkPermission(Permission.VIEW_CUSTOMER),
  customerController.getAll
);

router.get(
  "/get-new-all",
  checkPermission(Permission.VIEW_CUSTOMER),
  customerController.getNewAll
);

router.get(
  "/get-customer-by-id/:id",
  checkPermission(Permission.VIEW_CONTRACT),
  customerController.getCustomerById
);

router.get(
  "/check-phone",
  checkPermission(Permission.VIEW_CUSTOMER),
  customerController.checkPhone
);

router.get(
  "/check-passport",
  checkPermission(Permission.VIEW_CUSTOMER),
  customerController.checkPassport
);

router.post(
  "",
  checkPermission(Permission.CREATE_CUSTOMER),
  uploadCustomerFiles,
  customerController.create
);
// seller
router.post(
  "/seller",
  checkPermission(Permission.CUSTOMER_CREATE_MANAGER),
  uploadCustomerFiles,
  customerController.sellerCreate
);
router.put(
  "",
  checkPermission(Permission.UPDATE_CUSTOMER),
  uploadCustomerFiles,
  customerController.update
);
router.delete(
  "/:id",
  checkPermission(Permission.DELETE_CUSTOMER),
  customerController.delete
);
router.put(
  "/restoration/:id",
  checkPermission(Permission.UPDATE_CUSTOMER),
  customerController.restoration
);
router.put(
  "/manager",
  checkPermission(Permission.UPDATE_CUSTOMER),
  customerController.updateManager
);
router.put(
  "/confirmation",
  checkPermission(Permission.UPDATE_CUSTOMER),
  customerController.confirmationCustomer
);

export default router;
