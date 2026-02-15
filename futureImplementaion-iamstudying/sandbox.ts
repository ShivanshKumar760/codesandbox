import { Router } from "express";
import { DockerManager } from "@/docker/Dockermanager";
import { authenticateToken, AuthRequest } from "@/middleware/auth";

const router = Router();
router.use(authenticateToken);

router.post("/init", async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const containerId = await DockerManager.createContainer(userId);
  res.json({ containerId });
});

router.post("/execute", async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { code } = req.body;

  const result = await DockerManager.executeCode(userId, code);
  res.json(result);
});

router.post("/exit", async (req: AuthRequest, res) => {
  const userId = req.userId!;
  await DockerManager.stopContainer(userId);
  res.json({ message: "Container stopped" });
});

router.get("/status", async (req: AuthRequest, res) => {
  const info = DockerManager.getContainerInfo(req.userId!);
  res.json(info || { hasContainer: false });
});

export default router;
