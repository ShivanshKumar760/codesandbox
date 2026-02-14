import { Router } from "express";
import {
  LoginFunction,
  RegisterFunction,
  VerifyFunction,
} from "@/controllers/auth.controller";

const router = Router();

// Register new user
router.post("/register", RegisterFunction);

// Login user
router.post("/login", LoginFunction);

// Verify token (optional - for checking if user is authenticated)
router.get("/verify", VerifyFunction);

export default router;
