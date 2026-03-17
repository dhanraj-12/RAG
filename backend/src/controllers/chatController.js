const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Notebook = require("../models/Notebook");
const { generateResponse } = require("../services/geminiService");
const { sendSuccess, sendError } = require("../utils/responseHandler");

// POST /api/chats
const createChat = async (req, res) => {
  try {
    const { notebookId, title } = req.body;

    if (!notebookId || !title) {
      return sendError(res, "notebookId and title are required", 400);
    }

    // Verify notebook exists and belongs to user
    const notebook = await Notebook.findOne({
      _id: notebookId,
      userId: req.user.id,
    });

    if (!notebook) {
      return sendError(res, "Notebook not found", 404);
    }

    const chat = await Chat.create({
      notebookId,
      userId: req.user.id,
      title,
    });

    return sendSuccess(res, chat, 201, "Chat created successfully");
  } catch (error) {
    console.error("Create chat error:", error.message);
    return sendError(res, "Failed to create chat");
  }
};

// GET /api/notebooks/:notebookId/chats
const getChats = async (req, res) => {
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

    const chats = await Chat.find({ notebookId, userId: req.user.id }).sort({
      createdAt: -1,
    });

    return sendSuccess(res, chats, 200, "Chats fetched successfully");
  } catch (error) {
    console.error("Get chats error:", error.message);
    return sendError(res, "Failed to fetch chats");
  }
};

// POST /api/chats/:chatId/message
const sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;

    if (!text) {
      return sendError(res, "Message text is required", 400);
    }

    // Verify chat exists and belongs to user
    const chat = await Chat.findOne({
      _id: chatId,
      userId: req.user.id,
    });

    if (!chat) {
      return sendError(res, "Chat not found", 404);
    }

    // Store user message
    const userMessage = await Message.create({
      chatId,
      role: "user",
      contentType: "text",
      text,
    });

    // Fetch recent chat history for context (last 20 messages)
    const chatHistory = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Reverse to get chronological order
    chatHistory.reverse();

    // Send to Gemini API
    const aiResponseText = await generateResponse(text, chatHistory);

    // Store AI response
    const assistantMessage = await Message.create({
      chatId,
      role: "assistant",
      contentType: "text",
      text: aiResponseText,
    });

    return sendSuccess(
      res,
      {
        userMessage,
        assistantMessage,
      },
      201,
      "Message sent and response received"
    );
  } catch (error) {
    console.error("Send message error:", error.message);
    return sendError(res, "Failed to process message");
  }
};

// GET /api/chats/:chatId/messages
const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;

    // Verify chat exists and belongs to user
    const chat = await Chat.findOne({
      _id: chatId,
      userId: req.user.id,
    });

    if (!chat) {
      return sendError(res, "Chat not found", 404);
    }

    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });

    return sendSuccess(res, messages, 200, "Messages fetched successfully");
  } catch (error) {
    console.error("Get messages error:", error.message);
    return sendError(res, "Failed to fetch messages");
  }
};

module.exports = {
  createChat,
  getChats,
  sendMessage,
  getMessages,
};
