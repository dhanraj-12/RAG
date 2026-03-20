import { Response } from "express";
import Resource from "../models/Resource";
import Notebook from "../models/Notebook";
import { deleteFromS3 } from "../services/s3Service";
import { sendSuccess, sendError } from "../utils/responseHandler";
import { AuthRequest } from "../middleware/authMiddleware";

// POST /api/notebooks/:notebookId/resources
const uploadResource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { notebookId } = req.params;
    const notebook = await Notebook.findOne({ _id: notebookId, userId: req.user?.id });
    if (!notebook) {
      sendError(res, "Notebook not found", 404);
      return;
    }

    const file = req.file as any;
    if (!file) {
      sendError(res, "No file uploaded", 400);
      return;
    }

    const fileType = file.mimetype === "application/pdf" ? "pdf" : "image";
    const resource = await Resource.create({
      notebookId,
      fileName: file.originalname,
      type: fileType,
      s3Url: file.location,
      s3Key: file.key,
      uploadedBy: req.user?.id,
    });

    sendSuccess(res, resource, 201, "Resource uploaded successfully");
  } catch (error: any) {
    console.error("Upload resource error:", error.message);
    sendError(res, "Failed to upload resource");
  }
};

// GET /api/notebooks/:notebookId/resources
const getResources = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { notebookId } = req.params;
    const notebook = await Notebook.findOne({ _id: notebookId, userId: req.user?.id });
    if (!notebook) {
      sendError(res, "Notebook not found", 404);
      return;
    }

    const resources = await Resource.find({ notebookId }).sort({ createdAt: -1 });
    sendSuccess(res, resources, 200, "Resources fetched successfully");
  } catch (error: any) {
    console.error("Get resources error:", error.message);
    sendError(res, "Failed to fetch resources");
  }
};

// DELETE /api/resources/:id
const deleteResource = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      sendError(res, "Resource not found", 404);
      return;
    }

    const notebook = await Notebook.findOne({ _id: resource.notebookId, userId: req.user?.id });
    if (!notebook) {
      sendError(res, "Unauthorized to delete this resource", 403);
      return;
    }

    await deleteFromS3(resource.s3Key);
    await Resource.findByIdAndDelete(resource._id);
    sendSuccess(res, null, 200, "Resource deleted successfully");
  } catch (error: any) {
    console.error("Delete resource error:", error.message);
    sendError(res, "Failed to delete resource");
  }
};

export { uploadResource, getResources, deleteResource };
