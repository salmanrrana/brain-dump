/**
 * Docker Runtime Detection Module
 *
 * Provides cross-platform Docker runtime detection with Lima-first strategy on macOS.
 * This module detects various Docker-compatible runtimes (Lima, Colima, Rancher Desktop,
 * Docker Desktop, Podman) and validates socket availability.
 *
 * Detection Priority Order:
 * 1. User-configured socket path (from settings - not implemented in this module)
 * 2. DOCKER_HOST environment variable
 * 3. Lima (macOS): ~/.lima/docker/sock/docker.sock or ~/.lima/default/sock/docker.sock
 * 4. Colima (macOS): ~/.colima/default/docker.sock
 * 5. Rancher Desktop: ~/.rd/docker.sock
 * 6. Docker Desktop: /var/run/docker.sock (macOS/Linux) or named pipe (Windows)
 * 7. Podman: /run/user/$UID/podman/podman.sock
 */

import { createLogger } from "./logger";

const logger = createLogger("docker-runtime");

// ============================================================================
// Types
// ============================================================================

export type DockerRuntimeType =
  | "lima"
  | "colima"
  | "rancher"
  | "docker-desktop"
  | "podman"
  | "unknown";

export interface DockerRuntimeInfo {
  type: DockerRuntimeType;
  socketPath: string;
  available: boolean;
  version?: string | undefined;
}

// ============================================================================
// Runtime Socket Configurations
// ============================================================================

interface RuntimeConfig {
  type: DockerRuntimeType;
  /** Function to get socket paths for this runtime (may return multiple to check) */
  getSocketPaths: () => string[];
  /** Platforms this runtime is available on */
  platforms: NodeJS.Platform[];
}

/**
 * Get the user's home directory
 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "";
}

/**
 * Get the user's UID for Podman socket path
 */
function getUid(): string {
  return process.getuid?.()?.toString() || process.env.UID || "1000";
}

/**
 * Runtime configurations in detection priority order.
 * Lima is checked FIRST on macOS as specified in requirements.
 */
const RUNTIME_CONFIGS: RuntimeConfig[] = [
  // Lima - macOS first priority
  {
    type: "lima",
    getSocketPaths: () => {
      const home = getHomeDir();
      return [
        `${home}/.lima/docker/sock/docker.sock`, // Lima docker VM
        `${home}/.lima/default/sock/docker.sock`, // Lima default VM
      ];
    },
    platforms: ["darwin"],
  },
  // Colima - macOS second priority
  {
    type: "colima",
    getSocketPaths: () => {
      const home = getHomeDir();
      return [`${home}/.colima/default/docker.sock`];
    },
    platforms: ["darwin"],
  },
  // Rancher Desktop - cross-platform
  {
    type: "rancher",
    getSocketPaths: () => {
      const home = getHomeDir();
      return [`${home}/.rd/docker.sock`];
    },
    platforms: ["darwin", "linux", "win32"],
  },
  // Docker Desktop - cross-platform fallback
  {
    type: "docker-desktop",
    getSocketPaths: () => {
      const home = getHomeDir();
      if (process.platform === "win32") {
        // Windows uses named pipe
        return ["//./pipe/docker_engine"];
      }
      // macOS and Linux
      return [
        "/var/run/docker.sock",
        `${home}/.docker/run/docker.sock`, // Alternative macOS location
      ];
    },
    platforms: ["darwin", "linux", "win32"],
  },
  // Podman - Linux primarily, but also macOS
  {
    type: "podman",
    getSocketPaths: () => {
      const uid = getUid();
      const home = getHomeDir();
      if (process.platform === "darwin") {
        // macOS Podman machine socket
        return [
          `${home}/.local/share/containers/podman/machine/podman.sock`,
          `${home}/.local/share/containers/podman/machine/qemu/podman.sock`,
        ];
      }
      // Linux
      return [`/run/user/${uid}/podman/podman.sock`, `/var/run/podman/podman.sock`];
    },
    platforms: ["darwin", "linux"],
  },
];

// ============================================================================
// Caching
// ============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

// Cache duration: 30 seconds (avoids repeated filesystem checks)
const CACHE_TTL_MS = 30_000;

let detectionCache: CacheEntry<DockerRuntimeInfo> | null = null;
let allRuntimesCache: CacheEntry<DockerRuntimeInfo[]> | null = null;

/**
 * Check if a cache entry is still valid
 */
function isCacheValid<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
  if (!cache) return false;
  return Date.now() - cache.timestamp < CACHE_TTL_MS;
}

/**
 * Clear all cached detection results.
 * Useful when settings change or for testing.
 */
export function clearDockerRuntimeCache(): void {
  detectionCache = null;
  allRuntimesCache = null;
  logger.debug("Docker runtime cache cleared");
}

// ============================================================================
// Socket Validation
// ============================================================================

/**
 * Check if a socket path exists and is accessible.
 * Uses fs.existsSync for synchronous validation as specified in requirements.
 */
async function socketExists(socketPath: string): Promise<boolean> {
  const { existsSync, statSync } = await import("fs");

  try {
    if (!existsSync(socketPath)) {
      return false;
    }

    // On Unix, also verify it's a socket file
    if (process.platform !== "win32") {
      const stats = statSync(socketPath);
      return stats.isSocket();
    }

    // On Windows, named pipes exist if the path resolves
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse DOCKER_HOST environment variable to extract socket path.
 * Supports formats:
 * - unix:///path/to/socket
 * - /path/to/socket (direct path)
 * - npipe:////./pipe/docker_engine (Windows)
 */
function parseDockerHost(dockerHost: string): string | null {
  if (!dockerHost) return null;

  // Unix socket format: unix:///path/to/socket
  if (dockerHost.startsWith("unix://")) {
    return dockerHost.slice(7); // Remove "unix://"
  }

  // Windows named pipe: npipe:////./pipe/name
  if (dockerHost.startsWith("npipe://")) {
    return dockerHost.slice(8); // Remove "npipe://"
  }

  // Direct path (no protocol)
  if (dockerHost.startsWith("/") || dockerHost.startsWith("//")) {
    return dockerHost;
  }

  // TCP connections are not supported for this module (we need socket paths)
  if (dockerHost.startsWith("tcp://")) {
    logger.warn("TCP Docker hosts are not supported for socket detection");
    return null;
  }

  return null;
}

// ============================================================================
// Version Detection
// ============================================================================

/**
 * Get Docker version by running 'docker version' with the specified socket.
 * Returns undefined if version cannot be determined.
 */
async function getDockerVersion(socketPath: string): Promise<string | undefined> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    // Build the docker command with socket path
    const dockerHost =
      process.platform === "win32" ? `npipe://${socketPath}` : `unix://${socketPath}`;

    const { stdout } = await execAsync(
      `DOCKER_HOST="${dockerHost}" docker version --format "{{.Server.Version}}"`,
      { timeout: 5000 }
    );

    return stdout.trim() || undefined;
  } catch (error) {
    // Version check failed - Docker may not be running
    logger.debug(`Failed to get Docker version: ${error}`);
    return undefined;
  }
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect the primary Docker runtime available on this system.
 * Uses Lima-first strategy on macOS.
 *
 * Detection order:
 * 1. DOCKER_HOST environment variable (if set)
 * 2. Lima (macOS only)
 * 3. Colima (macOS only)
 * 4. Rancher Desktop
 * 5. Docker Desktop
 * 6. Podman
 *
 * Results are cached for 30 seconds to avoid repeated filesystem checks.
 */
export async function detectDockerRuntime(): Promise<DockerRuntimeInfo> {
  // Check cache first
  if (isCacheValid(detectionCache)) {
    logger.debug("Returning cached Docker runtime detection");
    return detectionCache.value;
  }

  const platform = process.platform;
  logger.debug(`Detecting Docker runtime on platform: ${platform}`);

  // 1. Check DOCKER_HOST environment variable first
  const dockerHostEnv = process.env.DOCKER_HOST;
  if (dockerHostEnv) {
    const socketPath = parseDockerHost(dockerHostEnv);
    if (socketPath && (await socketExists(socketPath))) {
      logger.info(`Using DOCKER_HOST environment variable: ${socketPath}`);
      const version = await getDockerVersion(socketPath);
      const result: DockerRuntimeInfo = {
        type: "unknown", // We don't know which runtime from env var alone
        socketPath,
        available: true,
        version,
      };
      detectionCache = { value: result, timestamp: Date.now() };
      return result;
    }
    logger.warn(`DOCKER_HOST set but socket not accessible: ${dockerHostEnv}`);
  }

  // 2. Check runtimes in priority order
  for (const config of RUNTIME_CONFIGS) {
    // Skip runtimes not available on this platform
    if (!config.platforms.includes(platform)) {
      continue;
    }

    const socketPaths = config.getSocketPaths();
    for (const socketPath of socketPaths) {
      if (await socketExists(socketPath)) {
        logger.info(`Detected ${config.type} runtime at: ${socketPath}`);
        const version = await getDockerVersion(socketPath);
        const result: DockerRuntimeInfo = {
          type: config.type,
          socketPath,
          available: true,
          version,
        };
        detectionCache = { value: result, timestamp: Date.now() };
        return result;
      }
    }
  }

  // No runtime found
  logger.warn("No Docker runtime detected");
  const result: DockerRuntimeInfo = {
    type: "unknown",
    socketPath: "",
    available: false,
  };
  detectionCache = { value: result, timestamp: Date.now() };
  return result;
}

/**
 * Get the Docker socket path for the detected runtime.
 * Returns null if no runtime is available.
 */
export async function getDockerSocketPath(): Promise<string | null> {
  const runtime = await detectDockerRuntime();
  return runtime.available ? runtime.socketPath : null;
}

/**
 * Check if a specific Docker runtime type is available.
 */
export async function isDockerRuntimeAvailable(type: DockerRuntimeType): Promise<boolean> {
  const allRuntimes = await getAllAvailableRuntimes();
  return allRuntimes.some((r) => r.type === type && r.available);
}

/**
 * Get all available Docker runtimes on this system.
 * Unlike detectDockerRuntime(), this checks ALL runtimes, not just the first available.
 * Results are cached for 30 seconds.
 */
export async function getAllAvailableRuntimes(): Promise<DockerRuntimeInfo[]> {
  // Check cache first
  if (isCacheValid(allRuntimesCache)) {
    logger.debug("Returning cached all runtimes list");
    return allRuntimesCache.value;
  }

  const platform = process.platform;
  const results: DockerRuntimeInfo[] = [];

  logger.debug(`Scanning all Docker runtimes on platform: ${platform}`);

  // Check DOCKER_HOST first
  const dockerHostEnv = process.env.DOCKER_HOST;
  if (dockerHostEnv) {
    const socketPath = parseDockerHost(dockerHostEnv);
    if (socketPath && (await socketExists(socketPath))) {
      const version = await getDockerVersion(socketPath);
      results.push({
        type: "unknown",
        socketPath,
        available: true,
        version,
      });
    }
  }

  // Check all runtimes
  for (const config of RUNTIME_CONFIGS) {
    if (!config.platforms.includes(platform)) {
      continue;
    }

    const socketPaths = config.getSocketPaths();
    for (const socketPath of socketPaths) {
      if (await socketExists(socketPath)) {
        // Avoid duplicates (DOCKER_HOST might point to one of these)
        const isDuplicate = results.some((r) => r.socketPath === socketPath);
        if (!isDuplicate) {
          const version = await getDockerVersion(socketPath);
          results.push({
            type: config.type,
            socketPath,
            available: true,
            version,
          });
        }
        // Only report first available socket per runtime type
        break;
      }
    }
  }

  allRuntimesCache = { value: results, timestamp: Date.now() };
  return results;
}
