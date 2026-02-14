// import Docker from "dockerode";
// import { v4 as uuidv4 } from "uuid";
// import { pool } from "@/config/pgPool";

// const docker = new Docker();
// const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS || "3");

// interface ContainerInfo {
//   containerId: string;
//   userId: number;
//   createdAt: Date;
// }

// // Track active containers in memory
// const activeContainers = new Map<number, ContainerInfo>();

// export class DockerManager {
//   // Check if max containers reached
//   static async canCreateContainer(): Promise<boolean> {
//     return activeContainers.size < MAX_CONTAINERS;
//   }

//   // Get active container count
//   static getActiveCount(): number {
//     return activeContainers.size;
//   }

//   // Create a new container for user
//   static async createContainer(userId: number): Promise<string> {
//     // Check if user already has a container
//     if (activeContainers.has(userId)) {
//       throw new Error("User already has an active container");
//     }

//     // Check max containers limit
//     if (!(await this.canCreateContainer())) {
//       throw new Error(`Maximum ${MAX_CONTAINERS} containers reached`);
//     }

//     try {
//       // Create container with Node.js environment
//       const containerName = `sandbox-${userId}-${uuidv4().substring(0, 8)}`;

//       const container = await docker.createContainer({
//         Image: "node:18-alpine",
//         name: containerName,
//         Cmd: ["tail", "-f", "/dev/null"], // Keep container running
//         WorkingDir: "/workspace",
//         HostConfig: {
//           Memory: 512 * 1024 * 1024, // 512MB memory limit
//           MemorySwap: 512 * 1024 * 1024,
//           CpuQuota: 50000, // 50% CPU
//           AutoRemove: false,
//           NetworkMode: "none", // Disable network access for security
//         },
//         AttachStdout: true,
//         AttachStderr: true,
//         Tty: false,
//       });

//       await container.start();

//       // Create index.js file in container
//       const exec = await container.exec({
//         Cmd: [
//           "sh",
//           "-c",
//           'echo "// Write your Node.js code here\\nconsole.log(\\"Hello, World!\\");" > /workspace/index.js',
//         ],
//         AttachStdout: true,
//         AttachStderr: true,
//       });
//       await exec.start({ Detach: false });

//       const containerId = container.id;

//       // Store in memory
//       activeContainers.set(userId, {
//         containerId,
//         userId,
//         createdAt: new Date(),
//       });

//       // Store in database
//       await pool.query(
//         "INSERT INTO user_sessions (user_id, container_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET container_id = $2, last_activity = CURRENT_TIMESTAMP",
//         [userId, containerId]
//       );

//       console.log(`✅ Container created for user ${userId}: ${containerId}`);
//       return containerId;
//     } catch (error: any) {
//       console.error("❌ Error creating container:", error.message);
//       throw new Error(`Failed to create container: ${error.message}`);
//     }
//   }

//   // Execute code in container
//   static async executeCode(
//     userId: number,
//     code: string
//   ): Promise<{ output: string; error: string }> {
//     const containerInfo = activeContainers.get(userId);

//     if (!containerInfo) {
//       throw new Error("No active container for user");
//     }

//     try {
//       const container = docker.getContainer(containerInfo.containerId);

//       // Write code to index.js
//       const writeExec = await container.exec({
//         Cmd: ["sh", "-c", `cat > /workspace/index.js << 'EOF'\n${code}\nEOF`],
//         AttachStdout: true,
//         AttachStderr: true,
//       });
//       await writeExec.start({ Detach: false });

//       // Execute the code with timeout
//       const runExec = await container.exec({
//         Cmd: ["node", "/workspace/index.js"],
//         AttachStdout: true,
//         AttachStderr: true,
//       });

//       const stream = await runExec.start({ Detach: false, Tty: false });

//       let output = "";
//       let error = "";

//       // Collect output with timeout
//       await new Promise<void>((resolve, reject) => {
//         const timeout = setTimeout(() => {
//           error = "Execution timeout (10 seconds)";
//           resolve();
//         }, 10000);

//         stream.on("data", (chunk: Buffer) => {
//           const data = chunk.toString();
//           // Docker multiplexes stdout/stderr - first byte indicates stream type
//           if (chunk[0] === 1) {
//             output += data.substring(8); // stdout
//           } else if (chunk[0] === 2) {
//             error += data.substring(8); // stderr
//           }
//         });

//         stream.on("end", () => {
//           clearTimeout(timeout);
//           resolve();
//         });

//         stream.on("error", (err: Error) => {
//           clearTimeout(timeout);
//           error = err.message;
//           resolve();
//         });
//       });

//       // Update last activity
//       await pool.query(
//         "UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE user_id = $1",
//         [userId]
//       );

//       return { output: output.trim(), error: error.trim() };
//     } catch (error: any) {
//       console.error("❌ Error executing code:", error.message);
//       throw new Error(`Failed to execute code: ${error.message}`);
//     }
//   }

//   // Stop and remove container
//   static async stopContainer(userId: number): Promise<void> {
//     const containerInfo = activeContainers.get(userId);

//     if (!containerInfo) {
//       console.log(`⚠️ No active container found for user ${userId}`);
//       return;
//     }

//     try {
//       const container = docker.getContainer(containerInfo.containerId);

//       // Stop container
//       await container.stop({ t: 5 });

//       // Remove container
//       await container.remove({ force: true });

//       // Remove from memory
//       activeContainers.delete(userId);

//       // Remove from database
//       await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [
//         userId,
//       ]);

//       console.log(`✅ Container stopped and removed for user ${userId}`);
//     } catch (error: any) {
//       console.error(
//         `❌ Error stopping container for user ${userId}:`,
//         error.message
//       );
//       // Clean up anyway
//       activeContainers.delete(userId);
//       await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [
//         userId,
//       ]);
//     }
//   }

//   // Cleanup all containers (for shutdown)
//   static async cleanupAll(): Promise<void> {
//     console.log("🧹 Cleaning up all containers...");
//     const userIds = Array.from(activeContainers.keys());

//     for (const userId of userIds) {
//       await this.stopContainer(userId);
//     }

//     console.log("✅ All containers cleaned up");
//   }

//   // Get container info for user
//   static getContainerInfo(userId: number): ContainerInfo | undefined {
//     return activeContainers.get(userId);
//   }

//   // List all active containers
//   static listActiveContainers(): ContainerInfo[] {
//     return Array.from(activeContainers.values());
//   }
// }

// // Cleanup on process exit
// process.on("SIGINT", async () => {
//   await DockerManager.cleanupAll();
//   process.exit(0);
// });

// process.on("SIGTERM", async () => {
//   await DockerManager.cleanupAll();
//   process.exit(0);
// });
import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import { pool } from "@/config/pgPool";
import tar from "tar-fs";
import path from "path";
import fs from "fs";

const docker = new Docker();

const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS || "3", 10);
const IMAGE_NAME = "custom-node-sandbox:latest";
const BASE_IMAGE = "node:18-alpine";
const DOCKERFILE_PATH = path.resolve(__dirname, "../../sandbox-image");

interface ContainerInfo {
  containerId: string;
  userId: number;
  createdAt: Date;
}

const activeContainers = new Map<number, ContainerInfo>();

export class DockerManager {
  /* ------------------------------------------------ */
  /* 🔹 Utility: Follow Docker Build/Pull Progress   */
  /* ------------------------------------------------ */
  private static followProgress(stream: NodeJS.ReadableStream) {
    return new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err: any) => (err ? reject(err) : resolve()),
        (event: any) => {
          if (event.status) console.log(`📦 ${event.status}`);
        }
      );
    });
  }

  /* ------------------------------------------------ */
  /* 🔹 Pull Base Image                              */
  /* ------------------------------------------------ */
  private static async pullImage(image: string) {
    const stream = await docker.pull(image);
    await this.followProgress(stream);
  }

  /* ------------------------------------------------ */
  /* 🔹 Build Sandbox Image                          */
  /* ------------------------------------------------ */
  private static async buildImage() {
    if (!fs.existsSync(DOCKERFILE_PATH)) {
      throw new Error(`Dockerfile path not found: ${DOCKERFILE_PATH}`);
    }

    const tarStream = tar.pack(DOCKERFILE_PATH);

    const stream = await new Promise<NodeJS.ReadableStream>(
      (resolve, reject) => {
        docker.buildImage(tarStream, { t: IMAGE_NAME }, (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error("Build stream undefined"));
          resolve(stream);
        });
      }
    );

    await this.followProgress(stream);
  }

  /* ------------------------------------------------ */
  /* 🔹 Ensure Image Exists                          */
  /* ------------------------------------------------ */
  static async ensureImage(): Promise<void> {
    const images = await docker.listImages();

    const exists = images.some((img) =>
      img.RepoTags?.some((tag) => tag === IMAGE_NAME)
    );

    if (exists) {
      console.log("✅ Sandbox image already exists");
      return;
    }

    console.log("⬇️ Pulling base image...");
    await this.pullImage(BASE_IMAGE);

    console.log("🔨 Building sandbox image...");
    await this.buildImage();

    console.log("✅ Sandbox image built successfully");
  }

  /* ------------------------------------------------ */
  static async canCreateContainer(): Promise<boolean> {
    return activeContainers.size < MAX_CONTAINERS;
  }

  static getActiveCount(): number {
    return activeContainers.size;
  }

  /* ------------------------------------------------ */
  /* 🚀 Create Container                             */
  /* ------------------------------------------------ */
  static async createContainer(userId: number): Promise<string> {
    if (activeContainers.has(userId)) {
      throw new Error("User already has an active container");
    }

    if (!(await this.canCreateContainer())) {
      throw new Error(`Maximum ${MAX_CONTAINERS} containers reached`);
    }

    await this.ensureImage();

    const containerName = `sandbox-${userId}-${uuidv4().substring(0, 8)}`;

    const container = await docker.createContainer({
      Image: IMAGE_NAME,
      name: containerName,
      Cmd: ["tail", "-f", "/dev/null"],
      WorkingDir: "/workspace",
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        Memory: 512 * 1024 * 1024,
        MemorySwap: 512 * 1024 * 1024,
        CpuQuota: 50000,
        NetworkMode: "none",
        AutoRemove: false,
        PidsLimit: 64,
        ReadonlyRootfs: false,
      },
    });

    await container.start();

    const containerId = container.id;

    activeContainers.set(userId, {
      containerId,
      userId,
      createdAt: new Date(),
    });

    await pool.query(
      `INSERT INTO user_sessions (user_id, container_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET container_id = $2, last_activity = CURRENT_TIMESTAMP`,
      [userId, containerId]
    );

    console.log(`✅ Container created for user ${userId}`);

    return containerId;
  }

  /* ------------------------------------------------ */
  /* ▶ Execute Code                                  */
  /* ------------------------------------------------ */
  static async executeCode(
    userId: number,
    code: string
  ): Promise<{ output: string; error: string }> {
    const containerInfo = activeContainers.get(userId);
    if (!containerInfo) throw new Error("No active container for user");

    const container = docker.getContainer(containerInfo.containerId);

    /* ---------------- Write Code Safely ---------------- */

    const base64Code = Buffer.from(code, "utf8").toString("base64");

    const writeExec = await container.exec({
      Cmd: [
        "sh",
        "-c",
        `echo '${base64Code}' | base64 -d > /workspace/index.js`,
      ],
      AttachStdout: true,
      AttachStderr: true,
    });

    await this.runExec(writeExec);

    /* ---------------- Execute Code ---------------- */

    const runExec = await container.exec({
      Cmd: ["node", "/workspace/index.js"],
      AttachStdout: true,
      AttachStderr: true,
    });

    return await this.runExec(runExec, 10000);
  }

  /* ------------------------------------------------ */
  /* 🔹 Generic Exec Runner                          */
  /* ------------------------------------------------ */
  private static async runExec(
    exec: Docker.Exec,
    timeoutMs = 0
  ): Promise<{ output: string; error: string }> {
    const stream = await exec.start({ Detach: false, Tty: false });

    let stdout = "";
    let stderr = "";
    let finished = false;

    return new Promise((resolve) => {
      let timeout: NodeJS.Timeout | null = null;

      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          if (finished) return;
          finished = true;
          stderr += `\nExecution timeout (${timeoutMs / 1000} seconds)`;
          stream.destroy();
          resolve({ output: stdout.trim(), error: stderr.trim() });
        }, timeoutMs);
      }

      docker.modem.demuxStream(
        stream,
        {
          write: (chunk: Buffer) => (stdout += chunk.toString()),
        } as any,
        {
          write: (chunk: Buffer) => (stderr += chunk.toString()),
        } as any
      );

      stream.on("end", () => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        resolve({ output: stdout.trim(), error: stderr.trim() });
      });

      stream.on("error", () => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        resolve({ output: stdout.trim(), error: stderr.trim() });
      });
    });
  }

  /* ------------------------------------------------ */
  /* 🛑 Stop Container                               */
  /* ------------------------------------------------ */
  static async stopContainer(userId: number): Promise<void> {
    const containerInfo = activeContainers.get(userId);
    if (!containerInfo) return;

    const container = docker.getContainer(containerInfo.containerId);

    try {
      await container.stop({ t: 5 });
    } catch {}

    try {
      await container.remove({ force: true });
    } catch {}

    activeContainers.delete(userId);

    await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);

    console.log(`🛑 Container removed for user ${userId}`);
  }

  /* ------------------------------------------------ */
  static async cleanupAll(): Promise<void> {
    console.log("🧹 Cleaning up containers...");
    const users = Array.from(activeContainers.keys());
    for (const userId of users) {
      await this.stopContainer(userId);
    }
  }

  static getContainerInfo(userId: number): ContainerInfo | undefined {
    return activeContainers.get(userId);
  }

  static listActiveContainers(): ContainerInfo[] {
    return Array.from(activeContainers.values());
  }
}

/* ------------------------------------------------ */
/* 🔻 Graceful Shutdown                             */
/* ------------------------------------------------ */

process.on("SIGINT", async () => {
  console.log("SIGINT received. Cleaning up...");
  await DockerManager.cleanupAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Cleaning up...");
  await DockerManager.cleanupAll();
  process.exit(0);
});
