import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest } from "../middleware/auth";
import { DockerManager } from "@/docker/Dockermanager";
import { getUserCode, updateUserCode } from "@/models/mongodb/utils";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Initialize container for user
router.post("/init", async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    // Check if user already has a container
    const existingContainer = DockerManager.getContainerInfo(userId);
    if (existingContainer) {
      res.json({
        message: "Container already exists",
        containerId: existingContainer.containerId,
        activeContainers: DockerManager.getActiveCount(),
        maxContainers: parseInt(process.env.MAX_CONTAINERS || "3"),
      });

      return;
    }

    // Create new container
    const containerId = await DockerManager.createContainer(userId);

    res.json({
      message: "Container initialized successfully",
      containerId,
      activeContainers: DockerManager.getActiveCount(),
      maxContainers: parseInt(process.env.MAX_CONTAINERS || "3"),
    });
  } catch (error: any) {
    console.error("Container init error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's saved code
router.get("/code", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  try {
    const code = await getUserCode(userId);
    res.json({ code });
  } catch (error: any) {
    console.error("Get code error:", error);
    res.status(500).json({ error: "Failed to retrieve code" });
  }
});

// Execute code
router.post(
  "/execute",
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: "Code is required" });
      return;
    }

    try {
      // Check if container exists
      const containerInfo = DockerManager.getContainerInfo(userId);
      if (!containerInfo) {
        res.status(400).json({
          error: "No active container. Please initialize first.",
          needsInit: true,
        });

        return;
      }

      // Execute code
      const result = await DockerManager.executeCode(userId, code);
      console.log(result);

      // Save code to MongoDB
      await updateUserCode(userId, code);

      res.json({
        success: true,
        output: result.output,
        error: result.error,
        executedAt: new Date(),
      });
    } catch (error: any) {
      console.error("Code execution error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Stop and cleanup container
router.post("/exit", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { code } = req.body; // Optional: save code before exit

  try {
    // Save code if provided
    if (code) {
      await updateUserCode(userId, code);
    }

    // Stop container
    await DockerManager.stopContainer(userId);

    res.json({
      message: "Container stopped and cleaned up successfully",
      activeContainers: DockerManager.getActiveCount(),
    });
  } catch (error: any) {
    console.error("Container exit error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get container status
router.get("/status", async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  try {
    const containerInfo = DockerManager.getContainerInfo(userId);

    res.json({
      hasContainer: !!containerInfo,
      containerId: containerInfo?.containerId,
      createdAt: containerInfo?.createdAt,
      activeContainers: DockerManager.getActiveCount(),
      maxContainers: parseInt(process.env.MAX_CONTAINERS || "3"),
      canCreateNew: await DockerManager.canCreateContainer(),
    });
  } catch (error: any) {
    console.error("Status check error:", error);
    res.status(500).json({ error: "Failed to get status" });
  }
});

// List all active containers (admin only - for demo purposes)
router.get("/containers", async (req: AuthRequest, res: Response) => {
  try {
    const containers = DockerManager.listActiveContainers();

    res.json({
      containers: containers.map((c) => ({
        userId: c.userId,
        containerId: c.containerId,
        createdAt: c.createdAt,
      })),
      count: containers.length,
      maxContainers: parseInt(process.env.MAX_CONTAINERS || "3"),
    });
  } catch (error: any) {
    console.error("List containers error:", error);
    res.status(500).json({ error: "Failed to list containers" });
  }
});

export default router;
