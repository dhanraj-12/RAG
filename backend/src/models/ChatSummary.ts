import mongoose, { Document, Model } from "mongoose";

export interface IChatSummary extends Document {
  chatId: mongoose.Types.ObjectId;
  summaryText: string;
  fromMessageSeq: number;
  toMessageSeq: number;
  createdAt: Date;
}

const chatSummarySchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
  summaryText: { type: String, required: true },
  fromMessageSeq: { type: Number, required: true },
  toMessageSeq: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Index for quick lookup of the latest summary for a chat
chatSummarySchema.index({ chatId: 1, toMessageSeq: -1 });

const ChatSummary: Model<IChatSummary> = mongoose.model<IChatSummary>("ChatSummary", chatSummarySchema);
export default ChatSummary;
