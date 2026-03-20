import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware";
import { register, login, getProfile, updateProfile, registerValidation, loginValidation } from "../controllers/authController";

const router = Router();

router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);

export default router;
