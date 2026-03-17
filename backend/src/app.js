const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const notebookRoutes = require("./routes/notebookRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/notebooks", notebookRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/chats", chatRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

module.exports = app;
