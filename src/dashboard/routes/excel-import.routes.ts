import { Router } from "express";
import excelImportController from "../controllers/excel-import.controller";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import { Permission } from "../../enums/permission.enum";
import { uploadExcelFile } from "../../middlewares/upload.middleware";

const router = Router();

/**
 * POST /api/excel/import
 * Excel faylni upload qilish va import qilish
 * Faqat admin va moderator ruxsati bor
 */
router.post(
  "/import",
  checkPermission(Permission.CREATE_CUSTOMER),
  uploadExcelFile,
  excelImportController.importExcel
);

export default router;
