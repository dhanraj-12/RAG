const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  createChat,
  getChats,
  sendMessage,
  getMessages,
} = require("../controllers/chatController");

const router = express.Router();

// All chat routes are protected
router.use(authMiddleware);

// POST /api/chats
router.post("/", createChat);

// GET /api/notebooks/:notebookId/chats
router.get("/notebooks/:notebookId", getChats);

// POST /api/chats/:chatId/message
router.post("/:chatId/message", sendMessage);

// GET /api/chats/:chatId/messages
router.get("/:chatId/messages", getMessages);

module.exports = router;
