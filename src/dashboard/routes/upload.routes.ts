// import express from "express";
import logger from "../../utils/logger";
// import { uploadFile } from "../../middlewares/upload.middleware";
// import path from "path";
// import fs from "fs";

// const router = express.Router();

// router.post("/images", (req, res) => {
//   uploadFile()(req, res);
// });
// router.delete("/images", (req, res) => {
//   const { url } = req.body;

//   const filePath = path.join("uploads", path.basename(url));

//   fs.unlink(filePath, (err) => {
//     if (err) {
//       logger.error("Rasmni o'chirishda xatolik:", err);
//       return res.status(500).send({ message: "Rasmni o'chirib bo'lmadi." });
//     }
//     res.status(200).send({ message: "Rasm muvaffaqiyatli o'chirildi." });
//   });
// });

// export default router;
