import mongoose from "mongoose";
import { Code } from "./mongodb";
import dotenv from "dotenv";
dotenv.config();
// Connect to MongoDB
export async function connectMongoDB() {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/code_sandbox";
    await mongoose.connect(mongoUri);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
}

// Get or create code for user
export async function getUserCode(userId: number): Promise<string> {
  let codeDoc = await Code.findOne({ userId });

  if (!codeDoc) {
    codeDoc = await Code.create({
      userId,
      code: '// Write your Node.js code here\nconsole.log("Hello, World!");',
    });
  }

  return codeDoc.code;
}

// Update user code
export async function updateUserCode(
  userId: number,
  code: string
): Promise<void> {
  await Code.findOneAndUpdate(
    { userId },
    {
      code,
      lastExecuted: new Date(),
      $inc: { executionCount: 1 },
    },
    { upsert: true, new: true }
  );
}
