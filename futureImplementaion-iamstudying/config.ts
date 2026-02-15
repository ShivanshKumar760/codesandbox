import Docker from "dockerode";

export const docker = new Docker({
  socketPath: "/var/run/docker.sock",
});

export const IMAGE_NAME = "custom-node-sandbox:latest";

export const LIMITS = {
  Memory: 512 * 1024 * 1024,
  NanoCPUs: 500000000,
  PidsLimit: 128,
};
