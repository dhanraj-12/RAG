import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware";
import { createChat, getChats, deleteChat, sendMessage, getMessages } from "../controllers/chatController";

const router = Router();
router.use(authMiddleware);

router.post("/", createChat);
router.get("/notebooks/:notebookId", getChats);
router.delete("/:chatId", deleteChat);
router.post("/:chatId/message", sendMessage);
router.get("/:chatId/messages", getMessages);

export default router;
