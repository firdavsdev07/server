import { Request, Response, NextFunction } from "express";
import excelImportService from "../services/excel-import.service";
import BaseError from "../../utils/base.error";
import IJwtUser from "../../types/user";
import logger from "../../utils/logger";

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

      res.status(200).json({
        status: "success",
        message: `Import yakunlandi: ${result.success} muvaffaqiyatli, ${result.failed} xato`,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }
}

export default new ExcelImportController();
