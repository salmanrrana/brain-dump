/**
 * Unit tests for Docker runtime detection module.
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (what runtime is detected, what socket path is returned)
 * - Mock filesystem at the boundary to control socket existence
 * - Avoid testing internal implementation details
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectDockerRuntime,
  getDockerSocketPath,
  isDockerRuntimeAvailable,
  getAllAvailableRuntimes,
  clearDockerRuntimeCache,
} from "./docker-runtime";

// Store original values
const originalPlatform = process.platform;
const originalEnv = { ...process.env };

// Helper to mock platform
function mockPlatform(platform: string) {
  Object.defineProperty(process, "platform", {
    value: platform,
    writable: true,
    configurable: true,
  });
}

// Helper to restore platform
function restorePlatform() {
  Object.defineProperty(process, "platform", {
    value: originalPlatform,
    writable: true,
    configurable: true,
  });
}

// Mock fs module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      // Default: no sockets exist
      return mockSocketPaths.has(path);
    }),
    statSync: vi.fn((path: string) => {
      if (!mockSocketPaths.has(path)) {
        throw new Error("ENOENT");
      }
      return {
        isSocket: () => true,
      };
    }),
  };
});

// Mock child_process for version detection
vi.mock("child_process", () => ({
  exec: vi.fn(
    (
      _cmd: string,
      _opts: unknown,
      callback: (err: Error | null, result: { stdout: string }) => void
    ) => {
      // Return mock version for successful docker calls
      if (typeof callback === "function") {
        callback(null, { stdout: "24.0.7" });
      }
    }
  ),
}));

// Mock util for promisify
vi.mock("util", () => ({
  promisify: (_fn: unknown) => async () => ({ stdout: "24.0.7" }),
}));

// Track which socket paths "exist" for testing
const mockSocketPaths = new Set<string>();

describe("docker-runtime", () => {
  beforeEach(() => {
    // Clear caches and mocks before each test
    clearDockerRuntimeCache();
    mockSocketPaths.clear();
    // Restore environment
    process.env = { ...originalEnv };
    delete process.env.DOCKER_HOST;
  });

  afterEach(() => {
    restorePlatform();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  // ===========================================================================
  // DETECTION ORDER TESTS
  // ===========================================================================

  describe("detectDockerRuntime - Detection Order", () => {
    it("should check Lima first on macOS (darwin)", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // Only Lima socket exists
      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);

      const result = await detectDockerRuntime();

      expect(result.type).toBe("lima");
      expect(result.available).toBe(true);
      expect(result.socketPath).toContain(".lima");
    });

    it("should prefer Lima over Colima when both exist on macOS", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // Both Lima and Colima exist
      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);
      mockSocketPaths.add(`${home}/.colima/default/docker.sock`);

      const result = await detectDockerRuntime();

      // Lima should be detected first due to priority order
      expect(result.type).toBe("lima");
    });

    it("should detect Colima when Lima not available on macOS", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // Only Colima socket exists
      mockSocketPaths.add(`${home}/.colima/default/docker.sock`);

      const result = await detectDockerRuntime();

      expect(result.type).toBe("colima");
      expect(result.available).toBe(true);
    });

    it("should detect Docker Desktop on Linux when Lima/Colima not available", async () => {
      mockPlatform("linux");

      // Docker Desktop socket exists
      mockSocketPaths.add("/var/run/docker.sock");

      const result = await detectDockerRuntime();

      expect(result.type).toBe("docker-desktop");
      expect(result.available).toBe(true);
    });

    it("should detect Rancher Desktop cross-platform", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // Only Rancher socket exists
      mockSocketPaths.add(`${home}/.rd/docker.sock`);

      const result = await detectDockerRuntime();

      expect(result.type).toBe("rancher");
      expect(result.available).toBe(true);
    });
  });

  // ===========================================================================
  // DOCKER_HOST ENVIRONMENT VARIABLE TESTS
  // ===========================================================================

  describe("detectDockerRuntime - DOCKER_HOST Override", () => {
    it("should use DOCKER_HOST when set with unix:// prefix", async () => {
      mockPlatform("darwin");
      const customSocket = "/tmp/custom-docker.sock";

      process.env.DOCKER_HOST = `unix://${customSocket}`;
      mockSocketPaths.add(customSocket);

      const result = await detectDockerRuntime();

      expect(result.available).toBe(true);
      expect(result.socketPath).toBe(customSocket);
      // Type is unknown when using env var (we don't know which runtime)
      expect(result.type).toBe("unknown");
    });

    it("should use DOCKER_HOST when set as direct path", async () => {
      mockPlatform("linux");
      const customSocket = "/custom/path/docker.sock";

      process.env.DOCKER_HOST = customSocket;
      mockSocketPaths.add(customSocket);

      const result = await detectDockerRuntime();

      expect(result.available).toBe(true);
      expect(result.socketPath).toBe(customSocket);
    });

    it("should fall back to detection if DOCKER_HOST socket doesn't exist", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // DOCKER_HOST points to non-existent socket
      process.env.DOCKER_HOST = "unix:///nonexistent/docker.sock";
      // But Lima socket exists
      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);

      const result = await detectDockerRuntime();

      // Should fall back to Lima
      expect(result.type).toBe("lima");
      expect(result.available).toBe(true);
    });

    it("should not use TCP connections from DOCKER_HOST", async () => {
      mockPlatform("linux");

      // DOCKER_HOST points to TCP (not supported for socket detection)
      process.env.DOCKER_HOST = "tcp://localhost:2375";
      // No local sockets available
      mockSocketPaths.clear();

      const result = await detectDockerRuntime();

      // Should report not available since TCP is not supported
      expect(result.available).toBe(false);
    });
  });

  // ===========================================================================
  // PLATFORM-SPECIFIC TESTS
  // ===========================================================================

  describe("detectDockerRuntime - Platform-Specific Behavior", () => {
    it("should not check Lima/Colima on Linux", async () => {
      mockPlatform("linux");
      const home = process.env.HOME || "";

      // Add Lima socket that would be found on macOS
      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);
      // But also add Docker Desktop socket
      mockSocketPaths.add("/var/run/docker.sock");

      const result = await detectDockerRuntime();

      // Should skip Lima (not available on Linux) and find docker-desktop
      expect(result.type).toBe("docker-desktop");
    });

    it("should check Podman on Linux", async () => {
      mockPlatform("linux");
      const uid = process.getuid?.()?.toString() || "1000";

      // Only Podman socket exists
      mockSocketPaths.add(`/run/user/${uid}/podman/podman.sock`);

      const result = await detectDockerRuntime();

      expect(result.type).toBe("podman");
      expect(result.available).toBe(true);
    });

    it("should use correct Windows pipe path", async () => {
      mockPlatform("win32");

      // Windows named pipe exists
      mockSocketPaths.add("//./pipe/docker_engine");

      const result = await detectDockerRuntime();

      expect(result.type).toBe("docker-desktop");
      expect(result.socketPath).toBe("//./pipe/docker_engine");
    });
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe("detectDockerRuntime - Error Handling", () => {
    it("should return not available when no runtime found", async () => {
      mockPlatform("darwin");
      // No sockets exist
      mockSocketPaths.clear();

      const result = await detectDockerRuntime();

      expect(result.available).toBe(false);
      expect(result.type).toBe("unknown");
      expect(result.socketPath).toBe("");
    });

    it("should handle missing HOME directory gracefully", async () => {
      mockPlatform("darwin");
      const originalHome = process.env.HOME;
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      // This should not throw
      const result = await detectDockerRuntime();

      expect(result.available).toBe(false);

      // Restore HOME
      process.env.HOME = originalHome;
    });
  });

  // ===========================================================================
  // getDockerSocketPath TESTS
  // ===========================================================================

  describe("getDockerSocketPath", () => {
    it("should return socket path when runtime available", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";
      const expectedPath = `${home}/.lima/docker/sock/docker.sock`;

      mockSocketPaths.add(expectedPath);

      const result = await getDockerSocketPath();

      expect(result).toBe(expectedPath);
    });

    it("should return null when no runtime available", async () => {
      mockPlatform("darwin");
      mockSocketPaths.clear();

      const result = await getDockerSocketPath();

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // isDockerRuntimeAvailable TESTS
  // ===========================================================================

  describe("isDockerRuntimeAvailable", () => {
    it("should return true for available runtime type", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);

      const result = await isDockerRuntimeAvailable("lima");

      expect(result).toBe(true);
    });

    it("should return false for unavailable runtime type", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // Only Colima exists
      mockSocketPaths.add(`${home}/.colima/default/docker.sock`);

      const result = await isDockerRuntimeAvailable("lima");

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // getAllAvailableRuntimes TESTS
  // ===========================================================================

  describe("getAllAvailableRuntimes", () => {
    it("should return all available runtimes", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      // Multiple runtimes available
      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);
      mockSocketPaths.add(`${home}/.colima/default/docker.sock`);
      mockSocketPaths.add("/var/run/docker.sock");

      const results = await getAllAvailableRuntimes();

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.type === "lima")).toBe(true);
      expect(results.some((r) => r.type === "colima")).toBe(true);
    });

    it("should return empty array when no runtimes available", async () => {
      mockPlatform("darwin");
      mockSocketPaths.clear();

      const results = await getAllAvailableRuntimes();

      expect(results).toEqual([]);
    });

    it("should avoid duplicates from DOCKER_HOST", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";
      const limaSocket = `${home}/.lima/docker/sock/docker.sock`;

      // DOCKER_HOST points to Lima socket
      process.env.DOCKER_HOST = `unix://${limaSocket}`;
      mockSocketPaths.add(limaSocket);

      const results = await getAllAvailableRuntimes();

      // Should not have duplicate entries for the same socket
      const socketPaths = results.map((r) => r.socketPath);
      const uniquePaths = new Set(socketPaths);
      expect(socketPaths.length).toBe(uniquePaths.size);
    });
  });

  // ===========================================================================
  // CACHING TESTS
  // ===========================================================================

  describe("Caching behavior", () => {
    it("should return cached results on subsequent calls", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);

      // First call
      const result1 = await detectDockerRuntime();
      expect(result1.type).toBe("lima");

      // Remove the socket
      mockSocketPaths.clear();

      // Second call should return cached result (Lima still detected)
      const result2 = await detectDockerRuntime();
      expect(result2.type).toBe("lima");
    });

    it("should use fresh detection after cache clear", async () => {
      mockPlatform("darwin");
      const home = process.env.HOME || "";

      mockSocketPaths.add(`${home}/.lima/docker/sock/docker.sock`);

      // First call
      const result1 = await detectDockerRuntime();
      expect(result1.type).toBe("lima");

      // Clear cache and remove socket
      clearDockerRuntimeCache();
      mockSocketPaths.clear();
      mockSocketPaths.add(`${home}/.colima/default/docker.sock`);

      // Should now detect Colima
      const result2 = await detectDockerRuntime();
      expect(result2.type).toBe("colima");
    });
  });
});
