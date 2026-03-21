import { Response } from "express";
import Chat from "../models/Chat";
import Message from "../models/Message";
import ChatSummary from "../models/ChatSummary";
import Notebook from "../models/Notebook";
import { checkContext, ChatMessage } from "../services/geminiService";
import { queryRAG } from "../services/ragService";
import { checkAndSummarize } from "../services/summarizationService";
import { sendSuccess, sendError } from "../utils/responseHandler";
import { AuthRequest } from "../middleware/authMiddleware";

// POST /api/chats
const createChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { notebookId, title } = req.body;
    if (!notebookId || !title) {
      sendError(res, "notebookId and title are required", 400);
      return;
    }

    const notebook = await Notebook.findOne({ _id: notebookId, userId: req.user?.id });
    if (!notebook) {
      sendError(res, "Notebook not found", 404);
      return;
    }

    const chat = await Chat.create({ notebookId, userId: req.user?.id, title });
    sendSuccess(res, chat, 201, "Chat created successfully");
  } catch (error: any) {
    console.error("Create chat error:", error.message);
    sendError(res, "Failed to create chat");
  }
};

// GET /api/notebooks/:notebookId/chats
const getChats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { notebookId } = req.params;
    const notebook = await Notebook.findOne({ _id: notebookId, userId: req.user?.id });
    if (!notebook) {
      sendError(res, "Notebook not found", 404);
      return;
    }

    const chats = await Chat.find({ notebookId, userId: req.user?.id }).sort({ createdAt: -1 });
    sendSuccess(res, chats, 200, "Chats fetched successfully");
  } catch (error: any) {
    console.error("Get chats error:", error.message);
    sendError(res, "Failed to fetch chats");
  }
};

// DELETE /api/chats/:chatId
const deleteChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findOne({ _id: chatId, userId: req.user?.id });
    if (!chat) {
      sendError(res, "Chat not found", 404);
      return;
    }

    // Clean up messages, summaries, and the chat itself
    await Message.deleteMany({ chatId: chat._id });
    await ChatSummary.deleteMany({ chatId: chat._id });
    await Chat.findByIdAndDelete(chat._id);
    sendSuccess(res, null, 200, "Chat deleted successfully");
  } catch (error: any) {
    console.error("Delete chat error:", error.message);
    sendError(res, "Failed to delete chat");
  }
};

// POST /api/chats/:chatId/message
const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;
    if (!text) {
      sendError(res, "Message text is required", 400);
      return;
    }

    const chat = await Chat.findOne({ _id: chatId, userId: req.user?.id });
    if (!chat) {
      sendError(res, "Chat not found", 404);
      return;
    }

    // --- Save user message with sequence number ---
    const userSeq = chat.messageCount + 1;
    const userMessage = await Message.create({
      chatId,
      sequenceNumber: userSeq,
      role: "user",
      contentType: "text",
      text,
    });

    // --- Build context for Gemini ---
    // Fetch latest summary
    const latestSummary = await ChatSummary.findOne({ chatId })
      .sort({ toMessageSeq: -1 })
      .lean();

    // Fetch recent messages (after last summary, using compound index for efficient folder-like access)
    const recentMessagesQuery = latestSummary
      ? { chatId, sequenceNumber: { $gt: chat.lastSummaryAtMessageSeq } }
      : { chatId };

    const recentMessages = await Message.find(recentMessagesQuery)
      .sort({ sequenceNumber: 1 })
      .limit(20)
      .lean();

    const chatHistory: ChatMessage[] = recentMessages.map((msg) => ({
      role: msg.role,
      text: msg.text,
    }));

    const summaryText = latestSummary?.summaryText || null;

    // --- Step 1: Context Check ---
    const { enhancedPrompt } = await checkContext(text, summaryText, chatHistory);

    // --- Step 2: Query RAG Backend ---
    const ragResponse = await queryRAG(enhancedPrompt);

    // --- Save assistant message with next sequence number ---
    const assistantSeq = userSeq + 1;
    const assistantMessage = await Message.create({
      chatId,
      sequenceNumber: assistantSeq,
      role: "assistant",
      contentType: "text",
      text: ragResponse.answer,
      citations: ragResponse.citations,
    });

    // --- Update chat message count ---
    await Chat.findByIdAndUpdate(chatId, { messageCount: assistantSeq });

    // --- Trigger summarization asynchronously (fire-and-forget) ---
    checkAndSummarize(chatId as string).catch((err) =>
      console.error("Background summarization error:", err.message)
    );

    sendSuccess(res, { userMessage, assistantMessage }, 201, "Message sent and response received");
  } catch (error: any) {
    console.error("Send message error:", error.message);
    sendError(res, "Failed to process message");
  }
};

// GET /api/chats/:chatId/messages
const getMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findOne({ _id: chatId, userId: req.user?.id });
    if (!chat) {
      sendError(res, "Chat not found", 404);
      return;
    }

    // Efficient folder-like access using the compound index (chatId, sequenceNumber)
    const messages = await Message.find({ chatId }).sort({ sequenceNumber: 1 });
    sendSuccess(res, messages, 200, "Messages fetched successfully");
  } catch (error: any) {
    console.error("Get messages error:", error.message);
    sendError(res, "Failed to fetch messages");
  }
};

export { createChat, getChats, deleteChat, sendMessage, getMessages };
