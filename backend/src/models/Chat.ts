import mongoose, { Document, Model } from "mongoose";

export interface IChat extends Document {
  notebookId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  messageCount: number;
  lastSummaryAtMessageSeq: number;
  createdAt: Date;
}

const chatSchema = new mongoose.Schema({
  notebookId: { type: mongoose.Schema.Types.ObjectId, ref: "Notebook", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: [true, "Chat title is required"], trim: true },
  messageCount: { type: Number, default: 0 },
  lastSummaryAtMessageSeq: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const Chat: Model<IChat> = mongoose.model<IChat>("Chat", chatSchema);
export default Chat;
