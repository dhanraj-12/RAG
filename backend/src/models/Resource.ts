import mongoose, { Document, Model } from "mongoose";

export interface IResource extends Document {
  notebookId: mongoose.Types.ObjectId;
  fileName: string;
  type: "pdf" | "image";
  s3Url: string;
  s3Key: string;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const resourceSchema = new mongoose.Schema({
  notebookId: { type: mongoose.Schema.Types.ObjectId, ref: "Notebook", required: true },
  fileName: { type: String, required: [true, "File name is required"], trim: true },
  type: { type: String, enum: ["pdf", "image"], required: true },
  s3Url: { type: String, required: true },
  s3Key: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const Resource: Model<IResource> = mongoose.model<IResource>("Resource", resourceSchema);
export default Resource;
