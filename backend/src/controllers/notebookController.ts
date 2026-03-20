import { Response } from "express";
import Notebook from "../models/Notebook";
import Resource from "../models/Resource";
import Chat from "../models/Chat";
import Message from "../models/Message";
import { deleteFromS3 } from "../services/s3Service";
import { sendSuccess, sendError } from "../utils/responseHandler";
import { AuthRequest } from "../middleware/authMiddleware";

// POST /api/notebooks
const createNotebook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, description } = req.body;
    if (!title) {
      sendError(res, "Title is required", 400);
      return;
    }

    const notebook = await Notebook.create({
      userId: req.user?.id,
      title,
      description: description || "",
    });

    sendSuccess(res, notebook, 201, "Notebook created successfully");
  } catch (error: any) {
    console.error("Create notebook error:", error.message);
    sendError(res, "Failed to create notebook");
  }
};

// GET /api/notebooks
const getNotebooks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notebooks = await Notebook.find({ userId: req.user?.id }).sort({ createdAt: -1 });
    sendSuccess(res, notebooks, 200, "Notebooks fetched successfully");
  } catch (error: any) {
    console.error("Get notebooks error:", error.message);
    sendError(res, "Failed to fetch notebooks");
  }
};

// DELETE /api/notebooks/:id
const deleteNotebook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notebook = await Notebook.findOne({ _id: req.params.id, userId: req.user?.id });
    if (!notebook) {
      sendError(res, "Notebook not found", 404);
      return;
    }

    const resources = await Resource.find({ notebookId: notebook._id });
    for (const resource of resources) {
      try {
        await deleteFromS3(resource.s3Key);
      } catch (err: any) {
        console.error(`Failed to delete S3 object ${resource.s3Key}:`, err.message);
      }
    }

    await Resource.deleteMany({ notebookId: notebook._id });
    const chats = await Chat.find({ notebookId: notebook._id });
    const chatIds = chats.map((chat) => chat._id);
    await Message.deleteMany({ chatId: { $in: chatIds } });
    await Chat.deleteMany({ notebookId: notebook._id });
    await Notebook.findByIdAndDelete(notebook._id);

    sendSuccess(res, null, 200, "Notebook and all related data deleted successfully");
  } catch (error: any) {
    console.error("Delete notebook error:", error.message);
    sendError(res, "Failed to delete notebook");
  }
};

export { createNotebook, getNotebooks, deleteNotebook };
