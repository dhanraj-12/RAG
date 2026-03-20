import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware";
import { upload } from "../config/s3";
import { uploadResource, getResources, deleteResource } from "../controllers/resourceController";

const router = Router();
router.use(authMiddleware);

router.post("/:notebookId/resources", upload.single("file"), uploadResource);
router.get("/:notebookId/resources", getResources);
router.delete("/:id", deleteResource);

export default router;
