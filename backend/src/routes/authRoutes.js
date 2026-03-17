const express = require("express");
const {
  register,
  login,
  registerValidation,
  loginValidation,
} = require("../controllers/authController");

const router = express.Router();

// POST /api/auth/register
router.post("/register", registerValidation, register);

// POST /api/auth/login
router.post("/login", loginValidation, login);

module.exports = router;
