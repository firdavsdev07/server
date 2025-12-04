import { Router } from "express";
import notesController from "../controllers/notes.controller";

const router = Router();

router.get("/get-by-id/:id", notesController.getById);
router.post("/add", notesController.add);

export default router;
