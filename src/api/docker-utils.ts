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

// Track Docker unavailability to avoid spamming logs
let dockerUnavailableLogged = false;

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
 * Result from Docker accessibility check.
 */
export interface DockerAccessResult {
  accessible: boolean;
  error?: string;
}

/**
 * Check if Docker daemon is running and accessible with current configuration.
 *
 * @returns Object with accessible boolean and optional error message
 */
export async function isDockerAccessible(): Promise<DockerAccessResult> {
  try {
    await execDockerCommand("info", { timeout: 5000 });
    return { accessible: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[docker-utils] Docker not accessible: ${message}`);
    return { accessible: false, error: message };
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[docker-utils] Failed to get Docker version: ${message}`);
    return null;
  }
}

// =============================================================================
// CONTAINER LOG UTILITIES
// =============================================================================

/**
 * Container info returned from Docker ps.
 */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  createdAt: string;
  isRunning: boolean;
  /** Project origin - tracked via Docker labels */
  projectId?: string | undefined;
  projectName?: string | undefined;
  epicId?: string | undefined;
  epicTitle?: string | undefined;
}

/**
 * Result from listContainers with error info.
 */
export interface ListContainersResult {
  containers: ContainerInfo[];
  error?: string;
}

/**
 * Parse Docker labels from comma-separated string format.
 * Docker ps --format outputs labels as "key=value,key2=value2"
 *
 * @param labelsStr - Comma-separated labels string from docker ps
 * @returns Object with label key-value pairs
 */
function parseDockerLabels(labelsStr: string): Record<string, string> {
  if (!labelsStr || labelsStr.trim() === "") {
    return {};
  }

  const labels: Record<string, string> = {};
  // Split by comma, but handle values that might contain commas (though unlikely for our labels)
  const parts = labelsStr.split(",");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      const key = part.substring(0, eqIdx).trim();
      const value = part.substring(eqIdx + 1).trim();
      labels[key] = value;
    }
  }
  return labels;
}

/**
 * List running containers matching a name pattern.
 *
 * @param namePattern - Pattern to match container names (e.g., "ralph-*")
 * @returns Object with containers array and optional error message
 */
export async function listContainers(namePattern?: string): Promise<ListContainersResult> {
  try {
    // Use JSON format for reliable parsing
    const filterArg = namePattern ? `--filter "name=${namePattern}"` : "";
    const { stdout } = await execDockerCommand(`ps -a ${filterArg} --format '{{json .}}'`, {
      timeout: 10000,
    });

    if (!stdout.trim()) {
      return { containers: [] };
    }

    // Parse each line as JSON
    const containers: ContainerInfo[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        // Parse labels for project origin tracking
        const labels = parseDockerLabels(data.Labels || "");
        containers.push({
          id: data.ID,
          name: data.Names,
          image: data.Image,
          status: data.Status,
          createdAt: data.CreatedAt,
          isRunning: data.State === "running",
          // Extract Brain Dump project origin labels
          projectId: labels["brain-dump.project-id"],
          projectName: labels["brain-dump.project-name"],
          epicId: labels["brain-dump.epic-id"],
          epicTitle: labels["brain-dump.epic-title"],
        });
      } catch {
        // Log malformed lines for debugging
        console.warn(
          `[docker-utils] Skipped malformed container JSON: ${line.substring(0, 100)}...`
        );
      }
    }

    // Docker is working - reset the unavailable flag
    dockerUnavailableLogged = false;
    return { containers };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDockerUnavailable =
      message.includes("Cannot connect to the Docker daemon") ||
      message.includes("Is the docker daemon running");

    // Only log Docker unavailable error once to avoid spam
    if (isDockerUnavailable) {
      if (!dockerUnavailableLogged) {
        console.warn(
          `[docker-utils] Docker daemon not running - container features disabled. This message will not repeat.`
        );
        dockerUnavailableLogged = true;
      }
      return { containers: [], error: "Docker daemon not running" };
    }

    // Log other errors normally
    console.error(`[docker-utils] Failed to list containers: ${message}`);
    return { containers: [], error: `Failed to list containers: ${message}` };
  }
}

// =============================================================================
// CONTAINER STATS UTILITIES
// =============================================================================

/**
 * Resource usage stats for a single container.
 */
export interface ContainerStats {
  /** Container name */
  name: string;
  /** Container ID (short) */
  id: string;
  /** CPU usage percentage (e.g., "0.15%") */
  cpuPercent: string;
  /** CPU usage as a number (e.g., 0.15) */
  cpuValue: number;
  /** Memory usage string (e.g., "24.5MiB / 7.75GiB") */
  memUsage: string;
  /** Memory used in bytes */
  memUsedBytes: number;
  /** Memory limit in bytes */
  memLimitBytes: number;
  /** Memory percentage (e.g., "0.31%") */
  memPercent: string;
  /** Memory percentage as a number */
  memValue: number;
  /** Network I/O (e.g., "1.2kB / 500B") */
  netIO: string;
  /** Block I/O (e.g., "0B / 0B") */
  blockIO: string;
  /** Number of PIDs */
  pids: number;
}

/**
 * Result from getContainerStats.
 */
export interface ContainerStatsResult {
  stats: ContainerStats[];
  error?: string;
}

// Hoisted regex for memory parsing (js-hoist-regexp)
const MEMORY_UNIT_REGEX = /^([\d.]+)\s*([A-Za-z]+)?$/;

/**
 * Parse memory/size strings to bytes.
 * Handles: B, kB, KB, KiB, MB, MiB, GB, GiB, TB, TiB
 */
function parseMemoryToBytes(memStr: string): number {
  const cleaned = memStr.trim();
  const match = cleaned.match(MEMORY_UNIT_REGEX);
  if (!match) return 0;

  const value = parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "B").toLowerCase();

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1000,
    kib: 1024,
    mb: 1000 * 1000,
    mib: 1024 * 1024,
    gb: 1000 * 1000 * 1000,
    gib: 1024 * 1024 * 1024,
    tb: 1000 * 1000 * 1000 * 1000,
    tib: 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] ?? 1);
}

/**
 * Parse percentage string to number.
 * "0.15%" -> 0.15
 */
function parsePercentToNumber(percentStr: string): number {
  const cleaned = percentStr.replace("%", "").trim();
  return parseFloat(cleaned) || 0;
}

/**
 * Get resource usage stats for running containers.
 *
 * Uses `docker stats --no-stream` which returns a snapshot (not streaming).
 * This is a heavier operation than `docker ps`, so should be polled less frequently.
 *
 * @param containerNames - Optional list of container names to filter (default: all Ralph containers)
 * @returns Object with stats array and optional error message
 */
export async function getContainerStats(containerNames?: string[]): Promise<ContainerStatsResult> {
  try {
    // Build command - filter by container names if provided
    let command = "stats --no-stream --format '{{json .}}'";
    if (containerNames && containerNames.length > 0) {
      // Add container names to filter
      command += " " + containerNames.map((n) => `"${n}"`).join(" ");
    }

    const { stdout } = await execDockerCommand(command, {
      timeout: 15000, // Stats can be slow
    });

    if (!stdout.trim()) {
      return { stats: [] };
    }

    // Parse each line as JSON
    const stats: ContainerStats[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as Record<string, unknown>;
        // Validate required fields exist
        if (typeof data.Name !== "string" || typeof data.ID !== "string") {
          console.warn(
            `[docker-utils] Container stats JSON missing required fields: ${line.substring(0, 100)}...`
          );
          continue;
        }
        // Parse memory usage "24.5MiB / 7.75GiB"
        const memUsageStr = typeof data.MemUsage === "string" ? data.MemUsage : "0B / 0B";
        const memParts = memUsageStr.split("/").map((s) => s.trim());
        const memUsedBytes = parseMemoryToBytes(memParts[0] ?? "0B");
        const memLimitBytes = parseMemoryToBytes(memParts[1] ?? "0B");

        stats.push({
          name: data.Name,
          id: data.ID,
          cpuPercent: typeof data.CPUPerc === "string" ? data.CPUPerc : "0%",
          cpuValue: parsePercentToNumber(typeof data.CPUPerc === "string" ? data.CPUPerc : "0%"),
          memUsage: memUsageStr,
          memUsedBytes,
          memLimitBytes,
          memPercent: typeof data.MemPerc === "string" ? data.MemPerc : "0%",
          memValue: parsePercentToNumber(typeof data.MemPerc === "string" ? data.MemPerc : "0%"),
          netIO: typeof data.NetIO === "string" ? data.NetIO : "0B / 0B",
          blockIO: typeof data.BlockIO === "string" ? data.BlockIO : "0B / 0B",
          pids: typeof data.PIDs === "string" ? parseInt(data.PIDs, 10) : 0,
        });
      } catch (error) {
        // Only catch JSON parse errors specifically
        if (error instanceof SyntaxError) {
          console.warn(
            `[docker-utils] Malformed container stats JSON (parse error): ${line.substring(0, 100)}...`
          );
        } else {
          // Re-throw unexpected errors
          throw error;
        }
      }
    }

    // Docker is working - reset the unavailable flag
    dockerUnavailableLogged = false;
    return { stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDockerUnavailable =
      message.includes("Cannot connect to the Docker daemon") ||
      message.includes("Is the docker daemon running");

    // Silently return empty stats if Docker is unavailable (already logged in listContainers)
    if (isDockerUnavailable) {
      return { stats: [], error: "Docker daemon not running" };
    }

    console.error(`[docker-utils] Failed to get container stats: ${message}`);
    return { stats: [], error: `Failed to get container stats: ${message}` };
  }
}

/**
 * Get logs from a Docker container.
 *
 * @param containerName - Name or ID of the container
 * @param options - Options for log retrieval
 * @returns Log content string
 */
export async function getContainerLogs(
  containerName: string,
  options: {
    /** Number of lines to retrieve (default: 500) */
    tail?: number;
    /** Get logs since this timestamp (ISO 8601 or relative like "5m") */
    since?: string;
    /** Include timestamps in output */
    timestamps?: boolean;
  } = {}
): Promise<{ logs: string; containerRunning: boolean }> {
  const { tail = 500, since, timestamps = false } = options;

  try {
    // Build command arguments
    const args: string[] = ["logs"];

    if (tail > 0) {
      args.push(`--tail=${tail}`);
    }

    if (since) {
      args.push(`--since="${since}"`);
    }

    if (timestamps) {
      args.push("--timestamps");
    }

    args.push(`"${containerName}"`);

    // Docker logs outputs to stderr for some content, so we combine both
    const { stdout, stderr } = await execDockerCommand(args.join(" "), {
      timeout: 30000,
    });

    // Docker logs sends some output to stderr (like progress indicators)
    const logs = stdout + stderr;

    // Check if container is still running
    const { stdout: stateOutput } = await execDockerCommand(
      `inspect --format='{{.State.Running}}' "${containerName}"`,
      { timeout: 5000 }
    );
    const containerRunning = stateOutput.trim() === "true";

    return { logs, containerRunning };
  } catch (error) {
    // Check if container doesn't exist
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("No such container")) {
      return { logs: "", containerRunning: false };
    }
    throw error;
  }
}
