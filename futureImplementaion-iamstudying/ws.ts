import { Server } from "ws";
import { DockerManager } from "@/docker/Dockermanager";

export function setupTerminal(server: any) {
  const wss = new Server({ server });

  wss.on("connection", async (ws, req) => {
    const containerId = req.url?.split("?containerId=")[1];
    if (!containerId) return ws.close();

    const stream = await DockerManager.attachTerminal(containerId);

    stream.on("data", (chunk: Buffer) => {
      ws.send(chunk.toString());
    });

    ws.on("message", (msg) => {
      stream.write(msg);
    });
  });
}
