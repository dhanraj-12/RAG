import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware";
import { createNotebook, getNotebooks, deleteNotebook } from "../controllers/notebookController";

const router = Router();
router.use(authMiddleware);

router.post("/", createNotebook);
router.get("/", getNotebooks);
router.delete("/:id", deleteNotebook);

export default router;
