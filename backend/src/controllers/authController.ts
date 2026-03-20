import { Response } from "express";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import User from "../models/User";
import { sendSuccess, sendError } from "../utils/responseHandler";
import { AuthRequest } from "../middleware/authMiddleware";

const registerValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];

const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET as string, { expiresIn: "7d" });
};

// POST /api/auth/register
const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendError(res, errors.array()[0].msg as string, 400);
      return;
    }

    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      sendError(res, "User with this email already exists", 409);
      return;
    }

    const user = await User.create({ name, email, passwordHash: password });
    const token = generateToken(user._id as unknown as string);
    sendSuccess(res, { user, token }, 201, "User registered successfully");
  } catch (error: any) {
    console.error("Register error:", error.message);
    sendError(res, "Failed to register user");
  }
};

// POST /api/auth/login
const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendError(res, errors.array()[0].msg as string, 400);
      return;
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      sendError(res, "Invalid email or password", 401);
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      sendError(res, "Invalid email or password", 401);
      return;
    }

    const token = generateToken(user._id as unknown as string);
    sendSuccess(res, { user, token }, 200, "Login successful");
  } catch (error: any) {
    console.error("Login error:", error.message);
    sendError(res, "Failed to login");
  }
};

// GET /api/auth/profile
const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      sendError(res, "User not found", 404);
      return;
    }
    sendSuccess(res, user, 200, "Profile fetched successfully");
  } catch (error: any) {
    console.error("Get profile error:", error.message);
    sendError(res, "Failed to fetch profile");
  }
};

// PUT /api/auth/profile
const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email } = req.body;
    const updates: { name?: string; email?: string } = {};

    if (name) updates.name = name;
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: req.user?.id } });
      if (existing) {
        sendError(res, "Email is already in use", 409);
        return;
      }
      updates.email = email;
    }

    const user = await User.findByIdAndUpdate(req.user?.id, updates, { new: true, runValidators: true });
    if (!user) {
      sendError(res, "User not found", 404);
      return;
    }

    sendSuccess(res, user, 200, "Profile updated successfully");
  } catch (error: any) {
    console.error("Update profile error:", error.message);
    sendError(res, "Failed to update profile");
  }
};

export { register, login, getProfile, updateProfile, registerValidation, loginValidation };
