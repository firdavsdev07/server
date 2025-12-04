import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadContracts } from "../controllers/upload.controller";

const router = Router();

// CSV fayllar uploads/ papkaga tushadi
const uploadPath = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

const storage = multer.diskStorage({
  destination: function (_, __, cb) {
    cb(null, uploadPath);
  },
  filename: function (_, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

router.post("/contracts", upload.single("file"), (req, res, next) => {
  Promise.resolve(uploadContracts(req, res)).catch(next);
});

export default router;
