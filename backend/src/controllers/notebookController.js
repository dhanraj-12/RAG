const Notebook = require("../models/Notebook");
const Resource = require("../models/Resource");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const { deleteFromS3 } = require("../services/s3Service");
const { sendSuccess, sendError } = require("../utils/responseHandler");

// POST /api/notebooks
const createNotebook = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return sendError(res, "Title is required", 400);
    }

    const notebook = await Notebook.create({
      userId: req.user.id,
      title,
      description: description || "",
    });

    return sendSuccess(res, notebook, 201, "Notebook created successfully");
  } catch (error) {
    console.error("Create notebook error:", error.message);
    return sendError(res, "Failed to create notebook");
  }
};

// GET /api/notebooks
const getNotebooks = async (req, res) => {
  try {
    const notebooks = await Notebook.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });

    return sendSuccess(res, notebooks, 200, "Notebooks fetched successfully");
  } catch (error) {
    console.error("Get notebooks error:", error.message);
    return sendError(res, "Failed to fetch notebooks");
  }
};

// DELETE /api/notebooks/:id
const deleteNotebook = async (req, res) => {
  try {
    const notebook = await Notebook.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!notebook) {
      return sendError(res, "Notebook not found", 404);
    }

    // Delete all resources from S3
    const resources = await Resource.find({ notebookId: notebook._id });
    for (const resource of resources) {
      try {
        await deleteFromS3(resource.s3Key);
      } catch (err) {
        console.error(`Failed to delete S3 object ${resource.s3Key}:`, err.message);
      }
    }

    // Delete all resources from MongoDB
    await Resource.deleteMany({ notebookId: notebook._id });

    // Delete all messages from chats in this notebook
    const chats = await Chat.find({ notebookId: notebook._id });
    const chatIds = chats.map((chat) => chat._id);
    await Message.deleteMany({ chatId: { $in: chatIds } });

    // Delete all chats
    await Chat.deleteMany({ notebookId: notebook._id });

    // Delete the notebook
    await Notebook.findByIdAndDelete(notebook._id);

    return sendSuccess(res, null, 200, "Notebook and all related data deleted successfully");
  } catch (error) {
    console.error("Delete notebook error:", error.message);
    return sendError(res, "Failed to delete notebook");
  }
};

module.exports = {
  createNotebook,
  getNotebooks,
  deleteNotebook,
};
