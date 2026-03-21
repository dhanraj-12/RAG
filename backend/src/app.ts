import express, { Request, Response } from "express";
import cors from "cors";

import authRoutes from "./routes/authRoutes";
import notebookRoutes from "./routes/notebookRoutes";
import resourceRoutes from "./routes/resourceRoutes";
import chatRoutes from "./routes/chatRoutes";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/notebooks", notebookRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/chats", chatRoutes);

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

export default app;
