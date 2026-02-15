import { docker, IMAGE_NAME, LIMITS } from "../config/docker";
import { v4 as uuidv4 } from "uuid";
import { pool } from "@/config/pgPool";
import path from "path";
import fs from "fs";

interface ContainerInfo {
  containerId: string;
  userId: number;
  createdAt: Date;
  hostPort?: string;
}

const activeContainers = new Map<number, ContainerInfo>();
const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS || "3", 10);

export class DockerManager {
  /* ------------------------------------------------ */
  static async canCreateContainer() {
    return activeContainers.size < MAX_CONTAINERS;
  }

  static getActiveCount() {
    return activeContainers.size;
  }

  /* ------------------------------------------------ */
  static async createContainer(userId: number): Promise<string> {
    if (activeContainers.has(userId))
      throw new Error("User already has container");

    if (!(await this.canCreateContainer()))
      throw new Error("Max container limit reached");

    const containerName = `sandbox-${userId}-${uuidv4().slice(0, 8)}`;

    const workspacePath = path.join(process.cwd(), "workspaces", containerName);

    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    const container = await docker.createContainer({
      Image: IMAGE_NAME,
      name: containerName,
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ["/bin/bash"],
      WorkingDir: "/workspace",
      ExposedPorts: {
        "5173/tcp": {},
      },
      HostConfig: {
        ...LIMITS,
        Binds: [`${workspacePath}:/workspace`],
        PortBindings: {
          "5173/tcp": [{ HostPort: "" }],
        },
      },
    });

    await container.start();

    const inspect = await container.inspect();
    const hostPort = inspect.NetworkSettings.Ports["5173/tcp"]?.[0]?.HostPort;

    activeContainers.set(userId, {
      containerId: container.id,
      userId,
      createdAt: new Date(),
      hostPort,
    });

    await pool.query(
      `INSERT INTO user_sessions (user_id, container_id)
       VALUES ($1,$2)
       ON CONFLICT (user_id)
       DO UPDATE SET container_id=$2,last_activity=CURRENT_TIMESTAMP`,
      [userId, container.id]
    );

    return container.id;
  }

  /* ------------------------------------------------ */
  static async executeCode(userId: number, code: string) {
    const info = activeContainers.get(userId);
    if (!info) throw new Error("No active container");

    const container = docker.getContainer(info.containerId);

    const base64Code = Buffer.from(code).toString("base64");

    const execWrite = await container.exec({
      Cmd: [
        "sh",
        "-c",
        `echo '${base64Code}' | base64 -d > /workspace/index.js`,
      ],
      AttachStdout: true,
      AttachStderr: true,
    });

    await execWrite.start({ Detach: false });

    const execRun = await container.exec({
      Cmd: ["node", "index.js"],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await execRun.start({ Detach: false });

    let stdout = "";
    let stderr = "";

    docker.modem.demuxStream(
      stream,
      { write: (c: Buffer) => (stdout += c.toString()) } as any,
      { write: (c: Buffer) => (stderr += c.toString()) } as any
    );

    await new Promise((resolve) => stream.on("end", resolve));

    return { output: stdout.trim(), error: stderr.trim() };
  }

  /* ------------------------------------------------ */
  static async attachTerminal(containerId: string) {
    const container = docker.getContainer(containerId);

    return await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });
  }

  /* ------------------------------------------------ */
  static async stopContainer(userId: number) {
    const info = activeContainers.get(userId);
    if (!info) return;

    const container = docker.getContainer(info.containerId);

    try {
      await container.stop();
    } catch {}

    try {
      await container.remove({ force: true });
    } catch {}

    activeContainers.delete(userId);

    await pool.query("DELETE FROM user_sessions WHERE user_id=$1", [userId]);
  }

  static getContainerInfo(userId: number) {
    return activeContainers.get(userId);
  }

  static listActiveContainers() {
    return Array.from(activeContainers.values());
  }
}
