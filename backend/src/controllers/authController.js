const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { sendSuccess, sendError } = require("../utils/responseHandler");

// Validation rules
const registerValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, errors.array()[0].msg, 400);
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, "User with this email already exists", 409);
    }

    // Create user (password is hashed via pre-save hook)
    const user = await User.create({
      name,
      email,
      passwordHash: password,
    });

    const token = generateToken(user._id);

    return sendSuccess(
      res,
      { user, token },
      201,
      "User registered successfully"
    );
  } catch (error) {
    console.error("Register error:", error.message);
    return sendError(res, "Failed to register user");
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, errors.array()[0].msg, 400);
    }

    const { email, password } = req.body;

    // Find user by email (include passwordHash for comparison)
    const user = await User.findOne({ email });
    if (!user) {
      return sendError(res, "Invalid email or password", 401);
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, "Invalid email or password", 401);
    }

    const token = generateToken(user._id);

    return sendSuccess(res, { user, token }, 200, "Login successful");
  } catch (error) {
    console.error("Login error:", error.message);
    return sendError(res, "Failed to login");
  }
};

module.exports = {
  register,
  login,
  registerValidation,
  loginValidation,
};
