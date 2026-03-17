const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema({
  notebookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Notebook",
    required: true,
  },
  fileName: {
    type: String,
    required: [true, "File name is required"],
    trim: true,
  },
  type: {
    type: String,
    enum: ["pdf", "image"],
    required: true,
  },
  s3Url: {
    type: String,
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Resource", resourceSchema);
