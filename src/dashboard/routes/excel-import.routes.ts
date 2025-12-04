import { Router } from "express";
import multer from "multer";
import excelImportController from "../controllers/excel-import.controller";
import { checkPermission } from "../../middlewares/CheckPermission.middleware";
import { Permission } from "../../enums/permission.enum";

const router = Router();

// Excel fayl uchun upload middleware
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `excel-${uniqueSuffix}.xlsx`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Faqat Excel fayllar (.xlsx, .xls) qabul qilinadi"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * POST /api/excel/import
 * Excel faylni upload qilish va import qilish
 * Faqat admin va moderator ruxsati bor
 */
router.post(
  "/import",
  checkPermission(Permission.CREATE_CUSTOMER),
  upload.single("file"),
  excelImportController.importExcel
);

export default router;
