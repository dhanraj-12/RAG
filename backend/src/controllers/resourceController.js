const Resource = require("../models/Resource");
const Notebook = require("../models/Notebook");
const { deleteFromS3 } = require("../services/s3Service");
const { sendSuccess, sendError } = require("../utils/responseHandler");

// POST /api/notebooks/:notebookId/resources
const uploadResource = async (req, res) => {
  try {
    const { notebookId } = req.params;

    // Verify notebook exists and belongs to user
    const notebook = await Notebook.findOne({
      _id: notebookId,
      userId: req.user.id,
    });

    if (!notebook) {
      return sendError(res, "Notebook not found", 404);
    }

    if (!req.file) {
      return sendError(res, "No file uploaded", 400);
    }

    // Determine file type
    const fileType = req.file.mimetype === "application/pdf" ? "pdf" : "image";

    const resource = await Resource.create({
      notebookId,
      fileName: req.file.originalname,
      type: fileType,
      s3Url: req.file.location,
      s3Key: req.file.key,
      uploadedBy: req.user.id,
    });

    return sendSuccess(res, resource, 201, "Resource uploaded successfully");
  } catch (error) {
    console.error("Upload resource error:", error.message);
    return sendError(res, "Failed to upload resource");
  }
};

// GET /api/notebooks/:notebookId/resources
const getResources = async (req, res) => {
  try {
    const { notebookId } = req.params;

    // Verify notebook exists and belongs to user
    const notebook = await Notebook.findOne({
      _id: notebookId,
      userId: req.user.id,
    });

    if (!notebook) {
      return sendError(res, "Notebook not found", 404);
    }

    const resources = await Resource.find({ notebookId }).sort({
      createdAt: -1,
    });

    return sendSuccess(res, resources, 200, "Resources fetched successfully");
  } catch (error) {
    console.error("Get resources error:", error.message);
    return sendError(res, "Failed to fetch resources");
  }
};

// DELETE /api/resources/:id
const deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return sendError(res, "Resource not found", 404);
    }

    // Verify the resource belongs to the user
    const notebook = await Notebook.findOne({
      _id: resource.notebookId,
      userId: req.user.id,
    });

    if (!notebook) {
      return sendError(res, "Unauthorized to delete this resource", 403);
    }

    // Delete from S3
    await deleteFromS3(resource.s3Key);

    // Delete from MongoDB
    await Resource.findByIdAndDelete(resource._id);

    return sendSuccess(res, null, 200, "Resource deleted successfully");
  } catch (error) {
    console.error("Delete resource error:", error.message);
    return sendError(res, "Failed to delete resource");
  }
};

module.exports = {
  uploadResource,
  getResources,
  deleteResource,
};
