import { Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// Upload papkalarini yaratish
const createUploadDirs = () => {
  const dirs = ["uploads/passport", "uploads/shartnoma", "uploads/photo"];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req: Request, file, cb) => {
    createUploadDirs();

    // File type'ga qarab papka tanlash
    let folder = "uploads/";

    if (file.fieldname === "passport") {
      folder = "uploads/passport/";
    } else if (file.fieldname === "shartnoma") {
      folder = "uploads/shartnoma/";
    } else if (file.fieldname === "photo") {
      folder = "uploads/photo/";
    }

    cb(null, folder);
  },
  filename: (req: Request, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  },
});

// File filter - faqat rasm va PDF
const fileFilter = (req: Request, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Faqat rasm (JPEG, PNG) va PDF fayllar qabul qilinadi"));
  }
};

// Upload middleware
export const uploadCustomerFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
}).fields([
  { name: "passport", maxCount: 1 },
  { name: "shartnoma", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

// Excel upload middleware
export const uploadExcelFile = multer({
  storage: multer.diskStorage({
    destination: (req: Request, file, cb) => {
      const dir = "uploads/excel/";
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req: Request, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, `excel-${uniqueSuffix}.xlsx`);
    },
  }),
  fileFilter: (req: Request, file: any, cb: any) => {
    const allowedTypes = /xlsx|xls/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                     file.mimetype === 'application/vnd.ms-excel';

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Faqat Excel fayllar (.xlsx, .xls) qabul qilinadi"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
}).single('file');

// Faylni o'chirish funksiyasi
export const deleteFile = (filePath: string) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};
