const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { upload } = require("../config/s3");
const {
  uploadResource,
  getResources,
  deleteResource,
} = require("../controllers/resourceController");

const router = express.Router();

// All resource routes are protected
router.use(authMiddleware);

// POST /api/notebooks/:notebookId/resources
router.post("/:notebookId/resources", upload.single("file"), uploadResource);

// GET /api/notebooks/:notebookId/resources
router.get("/:notebookId/resources", getResources);

// DELETE /api/resources/:id
router.delete("/:id", deleteResource);

module.exports = router;
