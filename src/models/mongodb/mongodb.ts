import mongoose from "mongoose";
import { exec } from "child_process";
const codeSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      default: '// Write your Node.js code here\nconsole.log("Hello, World!");',
    },

    lastExecuted: {
      type: Date,
      default: Date.now,
    },

    executionCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Code = mongoose.model("Code", codeSchema);
