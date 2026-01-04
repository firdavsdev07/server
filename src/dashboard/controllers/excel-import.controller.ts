import { Request, Response, NextFunction } from "express";
import excelImportService from "../services/excel-import.service";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";
import * as fs from "fs";

class ExcelImportController {
  async importExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user as IJwtUser;

      if (!req.file) {
        return next(BaseError.BadRequest("Excel fayl yuklanmagan"));
      }

      const filePath = req.file.path;

      logger.debug("Starting Excel import...");
      logger.debug("File path:", filePath);
      logger.debug("User ID:", user.sub);

      const result = await excelImportService.importFromExcel(
        filePath,
        user.sub
      );

      // ✅ Import qilingandan keyin faylni o'chirish
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.debug("✅ Uploaded Excel file deleted:", filePath);
        }
      } catch (deleteError: any) {
        logger.warn("⚠️ Failed to delete uploaded file:", deleteError.message);
        // O'chirishda xato bo'lsa, davom etamiz (import muvaffaqiyatli bo'lgani uchun)
      }

      res.status(200).json({
        status: "success",
        message: `Import yakunlandi: ${result.success} muvaffaqiyatli, ${result.failed} xato`,
        data: result,
      });
    } catch (error) {
      // ❌ Import xato bo'lsa ham, faylni o'chirishga harakat qilamiz
      if (req.file && req.file.path) {
        try {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            logger.debug("✅ Uploaded Excel file deleted after error:", req.file.path);
          }
        } catch (deleteError: any) {
          logger.warn("⚠️ Failed to delete uploaded file after error:", deleteError.message);
        }
      }
      return next(error);
    }
  }
}

export default new ExcelImportController();
