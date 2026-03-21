import { Router } from "express";
import multer from "multer";
import path from "path";
import { generateBulkCSV } from "../controllers/ragController";
import authMiddleware from "../middleware/authMiddleware";

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) !== ".json") {
      return cb(new Error("Only .json files are allowed"));
    }
    cb(null, true);
  }
});

// POST /api/rag/generate-csv
// Authenticated route
router.post("/generate-csv", authMiddleware, upload.single("file"), generateBulkCSV);

export default router;
