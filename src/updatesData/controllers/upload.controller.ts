import { Request, Response } from "express";
import { importContractsFromCSV } from "../services/upload.service";
import logger from "../../utils/logger";

// export const uploadCustomers = async (req: Request, res: Response) => {
//   if (!req.file) {
//     return res.status(400).json({ message: "CSV fayl topilmadi" });
//   }

//   try {
//     const inserted = await importCustomersFromCSV(req.file.path);
//     res
//       .status(201)
//       .json({ message: "Foydalanuvchilar qo‘shildi", count: inserted.length });
//   } catch (error) {
//     logger.error("CSV yuklashda xato:", error);
//     res.status(500).json({ message: "Xatolik yuz berdi", error });
//   }
// };

export const uploadContracts = async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: "Fayl topilmadi" });
  }

  try {
    const result = await importContractsFromCSV(req.file.path);
    res
      .status(201)
      .json({ message: "Ma'lumotlar qo‘shildi", count: result.length });
  } catch (err) {
    logger.error("Xatolik:", err);
    res.status(500).json({ message: "Ichki xatolik", error: err });
  }
};
