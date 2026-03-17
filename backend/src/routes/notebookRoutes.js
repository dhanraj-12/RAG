const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  createNotebook,
  getNotebooks,
  deleteNotebook,
} = require("../controllers/notebookController");

const router = express.Router();

// All notebook routes are protected
router.use(authMiddleware);

// POST /api/notebooks
router.post("/", createNotebook);

// GET /api/notebooks
router.get("/", getNotebooks);

// DELETE /api/notebooks/:id
router.delete("/:id", deleteNotebook);

module.exports = router;
