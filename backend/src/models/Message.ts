import mongoose, { Document, Model } from "mongoose";

export interface IMessage extends Document {
  chatId: mongoose.Types.ObjectId;
  sequenceNumber: number;
  role: "user" | "assistant";
  contentType: "text" | "image" | "mixed";
  text: string;
  imageUrls: string[];
  createdAt: Date;
}

const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
  sequenceNumber: { type: Number, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  contentType: { type: String, enum: ["text", "image", "mixed"], default: "text" },
  text: { type: String, default: "" },
  imageUrls: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

// Compound index: enables efficient "folder-like" access pattern messages/[chatId]/
messageSchema.index({ chatId: 1, sequenceNumber: 1 });

const Message: Model<IMessage> = mongoose.model<IMessage>("Message", messageSchema);
export default Message;
