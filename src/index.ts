import dotenv from "dotenv";

dotenv.config();
import express from "express";
import cors from "cors";
import authRoutes from "@/routes/auth";
import sandboxRoutes from "@/routes/sandbox";
import { connectMongoDB } from "@/models/mongodb/utils";
import { initializeDatabase } from "./models/sql/initializeDatabase";
import { DockerManager } from "./docker/Dockermanager";

const app = express();
const PORT = process.env.PORT || 5000;
const API_PREFIX = process.env.API_PREFIX || "/api/v1";

//middleware

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/sandbox`, sandboxRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

//error handling middleware
app.use((err: any, req: express.Request, res: express.Response) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Initialize and start server
async function startServer() {
  try {
    console.log("🚀 Starting Code Sandbox Platform...\n");

    // Initialize databases
    console.log("📦 Connecting to databases...");
    await initializeDatabase();
    await connectMongoDB();
    await DockerManager.ensureImage();
    // Start server
    app.listen(PORT, () => {
      console.log("\n✅ Server started successfully!");
      console.log(`🌐 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth`);
      console.log(`🐳 Sandbox endpoints: http://localhost:${PORT}/api/sandbox`);
      console.log(`\n🎯 Max containers: ${process.env.MAX_CONTAINERS || 3}`);
      console.log("📝 Ready to accept requests!\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

export default app;
