/**
 * Docker Command Utilities
 *
 * Provides helper functions to execute Docker commands with the correct
 * socket path based on settings or auto-detection.
 */

import { db } from "../lib/db";
import { settings } from "../lib/schema";
import { eq } from "drizzle-orm";
import {
  detectDockerRuntime,
  getDockerSocketPath,
  type DockerRuntimeInfo,
} from "../lib/docker-runtime";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Get the effective Docker socket path from settings or auto-detection.
 *
 * Priority:
 * 1. User-configured socket path (settings.dockerSocketPath)
 * 2. Socket for user-configured runtime (settings.dockerRuntime)
 * 3. Auto-detected runtime socket path
 *
 * @returns Socket path or null if Docker is not available
 */
export async function getEffectiveDockerSocketPath(): Promise<string | null> {
  // Check settings first
  const appSettings = db.select().from(settings).where(eq(settings.id, "default")).get();

  // 1. User-configured socket path takes highest priority
  if (appSettings?.dockerSocketPath) {
    return appSettings.dockerSocketPath;
  }

  // 2. If user specified a runtime, detect that specific runtime
  if (appSettings?.dockerRuntime && appSettings.dockerRuntime !== "auto") {
    // Use auto-detection but filter for the specific runtime
    const detected = await detectDockerRuntime();
    if (detected.available && detected.type === appSettings.dockerRuntime) {
      return detected.socketPath;
    }
    // If the specified runtime isn't available, fall through to auto-detect
    console.warn(
      `[docker-utils] Configured runtime "${appSettings.dockerRuntime}" not available, falling back to auto-detect`
    );
  }

  // 3. Auto-detect
  return getDockerSocketPath();
}

/**
 * Get Docker runtime information considering settings.
 *
 * @returns Runtime info from settings preference or auto-detection
 */
export async function getEffectiveDockerRuntime(): Promise<DockerRuntimeInfo> {
  const appSettings = db.select().from(settings).where(eq(settings.id, "default")).get();

  // If user has a custom socket path, return it as "unknown" type
  if (appSettings?.dockerSocketPath) {
    return {
      type: "unknown",
      socketPath: appSettings.dockerSocketPath,
      available: true, // Assume available if user configured it
    };
  }

  // Auto-detect runtime
  return detectDockerRuntime();
}

/**
 * Build the Docker command prefix with the correct DOCKER_HOST if needed.
 *
 * If using a non-default socket, returns `DOCKER_HOST=unix:///path docker`
 * Otherwise returns just `docker`.
 *
 * @returns Command prefix string to prepend to docker commands
 */
export async function getDockerCommandPrefix(): Promise<string> {
  const socketPath = await getEffectiveDockerSocketPath();

  if (!socketPath) {
    // No socket detected, use default docker command
    return "docker";
  }

  // Check if it's the default socket path (no prefix needed)
  const defaultPaths = ["/var/run/docker.sock"];

  if (defaultPaths.includes(socketPath)) {
    return "docker";
  }

  // Non-default socket - need DOCKER_HOST prefix
  // Format: unix:// for Unix sockets, npipe:// for Windows named pipes
  const prefix =
    process.platform === "win32"
      ? `DOCKER_HOST=npipe://${socketPath}`
      : `DOCKER_HOST=unix://${socketPath}`;

  return `${prefix} docker`;
}

/**
 * Build DOCKER_HOST environment variable value for the current configuration.
 *
 * @returns DOCKER_HOST value (e.g., "unix:///path/to/socket") or null if using default
 */
export async function getDockerHostEnvValue(): Promise<string | null> {
  const socketPath = await getEffectiveDockerSocketPath();

  if (!socketPath) {
    return null;
  }

  // Check if it's the default socket path
  const defaultPaths = ["/var/run/docker.sock"];

  if (defaultPaths.includes(socketPath)) {
    return null;
  }

  // Non-default socket - return DOCKER_HOST value
  return process.platform === "win32" ? `npipe://${socketPath}` : `unix://${socketPath}`;
}

/**
 * Execute a Docker command with the correct socket configuration.
 *
 * This is a convenience wrapper that:
 * 1. Gets the effective socket path from settings/auto-detection
 * 2. Executes the command with appropriate DOCKER_HOST if needed
 *
 * @param command - The docker command to execute (without "docker" prefix)
 * @param options - Optional exec options (timeout, etc.)
 * @returns Promise resolving to { stdout, stderr }
 */
export async function execDockerCommand(
  command: string,
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  const prefix = await getDockerCommandPrefix();
  const fullCommand = `${prefix} ${command}`;

  return execAsync(fullCommand, options);
}

/**
 * Check if Docker daemon is running and accessible with current configuration.
 *
 * @returns true if Docker is accessible
 */
export async function isDockerAccessible(): Promise<boolean> {
  try {
    await execDockerCommand("info", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Docker version string.
 *
 * @returns Version string or null if Docker is not accessible
 */
export async function getDockerVersion(): Promise<string | null> {
  try {
    const { stdout } = await execDockerCommand("version --format '{{.Server.Version}}'", {
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
