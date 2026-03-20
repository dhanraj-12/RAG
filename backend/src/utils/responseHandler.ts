import { Response } from "express";

const sendSuccess = (res: Response, data: any = null, statusCode: number = 200, message: string = "Success") => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res: Response, message: string = "Internal server error", statusCode: number = 500) => {
  return res.status(statusCode).json({ success: false, message });
};

export { sendSuccess, sendError };
