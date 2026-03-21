import { Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { sendSuccess, sendError } from "../utils/responseHandler";

const RAG_API_URL = process.env.RAG_API_URL || "http://localhost:8001";

/**
 * Handles the upload of queries.json, triggers CSV generation in the Python backend,
 * and facilitates the download of the resulting CSV.
 */
const generateBulkCSV = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      sendError(res, "No file uploaded", 400);
      return;
    }

    const inputPath = path.resolve(req.file.path);
    const outputFilename = `submission_${Date.now()}.csv`;
    const outputPath = path.resolve(path.dirname(inputPath), outputFilename);

    console.log(`🚀 Starting bulk CSV generation for: ${inputPath}`);

    // Call Python backend
    const response = await axios.post(`${RAG_API_URL}/api/generate_csv`, {
      input_path: inputPath,
      output_path: outputPath,
    });

    if (response.data.success) {
      const downloadUrl = `${RAG_API_URL}${response.data.download_url}`;

      // We could either redirect or fetch and stream. 
      // Fetching and streaming is safer as it hides the Python backend URL.
      const fileResponse = await axios.get(downloadUrl, { responseType: "stream" });

      res.setHeader("Content-Disposition", `attachment; filename=${outputFilename}`);
      res.setHeader("Content-Type", "text/csv");

      fileResponse.data.pipe(res);

      // Cleanup uploaded JSON after some time or immediately after stream ends
      res.on("finish", () => {
        try {
          fs.unlinkSync(inputPath);
          // We might want to keep the CSV for a bit or delete if we don't need it on disk anymore
          // But since it's on the Python side, we let it be or handle it there.
          // In this setup, both are on the same machine/filesystem.
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      });
    } else {
      sendError(res, response.data.error || "Failed to generate CSV", 500);
    }
  } catch (error: any) {
    console.error("Bulk CSV generation error:", error.message);
    sendError(res, "Failed to process bulk queries");
  }
};

export { generateBulkCSV };
