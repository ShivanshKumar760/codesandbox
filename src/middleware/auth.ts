// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

interface JWTPayload extends JwtPayload {
  userId: number;
  username: string;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Token not provided" });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || "your_jwt_secret";
    const decoded = jwt.verify(token, secret) as unknown as JWTPayload;

    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (error) {
    res.status(403).json({ message: "Invalid token" });
    return;
  }
}

export function generateToken(userId: number, username: string): string {
  const secret = process.env.JWT_SECRET || "your-secret-key";
  return jwt.sign({ userId, username }, secret, { expiresIn: "24h" });
}
