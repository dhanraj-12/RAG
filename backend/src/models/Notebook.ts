import mongoose, { Document, Model } from "mongoose";

export interface INotebook extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  createdAt: Date;
}

const notebookSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: [true, "Title is required"], trim: true },
  description: { type: String, trim: true, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const Notebook: Model<INotebook> = mongoose.model<INotebook>("Notebook", notebookSchema);
export default Notebook;
