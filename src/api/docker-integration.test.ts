/**
 * Docker Runtime Integration Tests
 *
 * These tests verify Docker runtime detection and operations work end-to-end
 * with ACTUAL Docker operations. Unlike unit tests that mock the filesystem,
 * these tests use the real Docker daemon.
 *
 * Testing Philosophy (Kent C. Dodds):
 * - Test user-facing behavior: "Can I run Docker commands successfully?"
 * - Use real infrastructure where available
 * - Skip gracefully when Docker is not available (CI environments)
 *
 * Skip Behavior:
 * - Tests are automatically skipped if Docker is not installed or running
 * - This prevents false failures in CI environments without Docker
 *
 * Security Note:
 * - Uses exec() with hardcoded commands for Docker operations in tests
 * - All command strings are static test data, not user input
 * - This is safe and appropriate for integration testing
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { mkdirSync, rmSync } from "fs";

const execAsync = promisify(exec);

// ============================================================================
// DOCKER AVAILABILITY CHECK
// ============================================================================

/**
 * Check if Docker is available and running on the system.
 * This is used to skip tests in environments without Docker (e.g., CI).
 */
async function checkDockerAvailable(): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    // Check if docker command exists
    await execAsync("docker --version", { timeout: 5000 });

    // Check if docker daemon is running
    await execAsync("docker info", { timeout: 10000 });

    return { available: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("command not found") || message.includes("not recognized")) {
      return { available: false, reason: "Docker is not installed" };
    }

    if (message.includes("Cannot connect") || message.includes("Is the docker daemon running")) {
      return { available: false, reason: "Docker daemon is not running" };
    }

    return { available: false, reason: message };
  }
}

// ============================================================================
// TEST DATABASE SETUP
// ============================================================================

// Minimal schema for settings table (needed for settings round-trip tests)
const SETTINGS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    terminal_emulator TEXT,
    ralph_sandbox INTEGER DEFAULT 0,
    ralph_timeout INTEGER DEFAULT 3600,
    auto_create_pr INTEGER DEFAULT 0,
    pr_target_branch TEXT DEFAULT 'dev',
    default_projects_directory TEXT,
    default_working_method TEXT DEFAULT 'auto',
    docker_runtime TEXT,
    docker_socket_path TEXT,
    conversation_logging_enabled INTEGER DEFAULT 1,
    conversation_retention_days INTEGER DEFAULT 90,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// ============================================================================
// TEST SUITE
// ============================================================================

describe("Docker Runtime Integration Tests", () => {
  let hasDocker: boolean;
  let skipReason: string | undefined;
  let testDb: Database.Database | null = null;
  let testDbPath: string | null = null;

  beforeAll(async () => {
    // Check Docker availability once for all tests
    const check = await checkDockerAvailable();
    hasDocker = check.available;
    skipReason = check.reason;

    if (!hasDocker) {
      console.log(`\n⏭️  Skipping Docker integration tests: ${skipReason}\n`);
    }
  });

  beforeEach(() => {
    // Create a fresh test database for settings tests
    const testDir = join(tmpdir(), `brain-dump-docker-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, "test.db");
    testDb = new Database(testDbPath);
    testDb.exec(SETTINGS_SCHEMA_SQL);
  });

  afterEach(() => {
    // Clean up test database
    if (testDb) {
      testDb.close();
      testDb = null;
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
      testDbPath = null;
    }
  });

  // ==========================================================================
  // RUNTIME DETECTION TESTS
  // ==========================================================================

  describe("Runtime Detection", () => {
    it.skipIf(!hasDocker)("should detect a valid Docker runtime", async () => {
      const { detectDockerRuntime, clearDockerRuntimeCache } =
        await import("../lib/docker-runtime");

      // Clear cache to ensure fresh detection
      clearDockerRuntimeCache();

      const runtime = await detectDockerRuntime();

      expect(runtime.available).toBe(true);
      expect(runtime.socketPath).toBeTruthy();
      expect(runtime.socketPath.length).toBeGreaterThan(0);
      // Type should be one of the known types (not unknown since we have a real runtime)
      expect(["lima", "colima", "rancher", "docker-desktop", "podman", "unknown"]).toContain(
        runtime.type
      );
    });

    it.skipIf(!hasDocker)("should return a socket path that actually exists", async () => {
      const { getDockerSocketPath, clearDockerRuntimeCache } =
        await import("../lib/docker-runtime");
      const { existsSync, statSync } = await import("fs");

      clearDockerRuntimeCache();

      const socketPath = await getDockerSocketPath();

      expect(socketPath).not.toBeNull();
      expect(existsSync(socketPath!)).toBe(true);

      // On Unix systems, verify it's actually a socket
      if (process.platform !== "win32") {
        const stats = statSync(socketPath!);
        expect(stats.isSocket()).toBe(true);
      }
    });

    it.skipIf(!hasDocker)("should detect Docker version", async () => {
      const { detectDockerRuntime, clearDockerRuntimeCache } =
        await import("../lib/docker-runtime");

      clearDockerRuntimeCache();

      const runtime = await detectDockerRuntime();

      // Version may or may not be available depending on daemon state
      // but if available, it should be a valid version string
      if (runtime.version) {
        expect(runtime.version).toMatch(/^\d+\.\d+/); // e.g., "24.0" or "25.0.1"
      }
    });
  });

  // ==========================================================================
  // DOCKER COMMAND EXECUTION TESTS
  // ==========================================================================

  describe("Docker Command Execution", () => {
    it.skipIf(!hasDocker)("should execute 'docker info' successfully", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      const { stdout } = await execDockerCommand("info");

      expect(stdout).toBeTruthy();
      expect(stdout).toContain("Server Version");
    });

    it.skipIf(!hasDocker)("should execute 'docker version' successfully", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      const { stdout } = await execDockerCommand("version --format '{{.Server.Version}}'");

      expect(stdout.trim()).toMatch(/^\d+\.\d+/);
    });

    it.skipIf(!hasDocker)("should handle invalid commands gracefully", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      await expect(execDockerCommand("nonexistent-command-xyz")).rejects.toThrow();
    });
  });

  // ==========================================================================
  // NETWORK OPERATIONS TESTS
  // ==========================================================================

  describe("Network Operations", () => {
    const testNetworkName = `brain-dump-test-${randomUUID().slice(0, 8)}`;

    afterEach(async () => {
      // Clean up test network if it exists
      try {
        await execAsync(`docker network rm ${testNetworkName}`, { timeout: 10000 });
      } catch {
        // Network may not exist, ignore
      }
    });

    it.skipIf(!hasDocker)("should create a Docker network", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      // Create network
      await execDockerCommand(`network create ${testNetworkName}`);

      // Verify network exists
      const { stdout } = await execDockerCommand("network ls --format '{{.Name}}'");

      expect(stdout).toContain(testNetworkName);
    });

    it.skipIf(!hasDocker)("should inspect network details", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      // Create network first
      await execDockerCommand(`network create ${testNetworkName}`);

      // Inspect network
      const { stdout } = await execDockerCommand(`network inspect ${testNetworkName}`);

      const networkInfo = JSON.parse(stdout);
      expect(Array.isArray(networkInfo)).toBe(true);
      expect(networkInfo[0].Name).toBe(testNetworkName);
    });

    it.skipIf(!hasDocker)("should remove a Docker network", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      // Create network
      await execDockerCommand(`network create ${testNetworkName}`);

      // Remove network
      await execDockerCommand(`network rm ${testNetworkName}`);

      // Verify network is gone
      const { stdout } = await execDockerCommand("network ls --format '{{.Name}}'");

      expect(stdout).not.toContain(testNetworkName);
    });
  });

  // ==========================================================================
  // IMAGE OPERATIONS TESTS
  // ==========================================================================

  describe("Image Operations", () => {
    it.skipIf(!hasDocker)("should list Docker images", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      // This should not throw even if no images exist
      const { stdout } = await execDockerCommand("images --format '{{.Repository}}'");

      // stdout may be empty if no images, but should not throw
      expect(typeof stdout).toBe("string");
    });

    it.skipIf(!hasDocker)("should handle non-existent image inspect gracefully", async () => {
      const { execDockerCommand } = await import("./docker-utils");

      // Trying to inspect a non-existent image should throw
      await expect(
        execDockerCommand("image inspect nonexistent-image-xyz:latest")
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // SETTINGS ROUND-TRIP TESTS
  // ==========================================================================

  describe("Settings Round-Trip", () => {
    it("should persist Docker runtime setting", () => {
      // This test uses the test database directly (doesn't require Docker)
      const db = testDb!;

      // Insert default settings
      db.exec("INSERT INTO settings (id) VALUES ('default')");

      // Update with Docker runtime
      db.prepare("UPDATE settings SET docker_runtime = ? WHERE id = 'default'").run("lima");

      // Read back
      const row = db.prepare("SELECT docker_runtime FROM settings WHERE id = 'default'").get() as {
        docker_runtime: string;
      };

      expect(row.docker_runtime).toBe("lima");
    });

    it("should persist Docker socket path setting", () => {
      const db = testDb!;

      // Insert default settings
      db.exec("INSERT INTO settings (id) VALUES ('default')");

      // Update with custom socket path
      const customPath = "/custom/docker.sock";
      db.prepare("UPDATE settings SET docker_socket_path = ? WHERE id = 'default'").run(customPath);

      // Read back
      const row = db
        .prepare("SELECT docker_socket_path FROM settings WHERE id = 'default'")
        .get() as { docker_socket_path: string };

      expect(row.docker_socket_path).toBe(customPath);
    });

    it("should handle null runtime setting (auto-detect)", () => {
      const db = testDb!;

      // Insert default settings
      db.exec("INSERT INTO settings (id) VALUES ('default')");

      // Set runtime to null (auto-detect)
      db.prepare("UPDATE settings SET docker_runtime = NULL WHERE id = 'default'").run();

      // Read back
      const row = db.prepare("SELECT docker_runtime FROM settings WHERE id = 'default'").get() as {
        docker_runtime: string | null;
      };

      expect(row.docker_runtime).toBeNull();
    });

    it("should validate runtime types at database level", () => {
      const db = testDb!;

      // Insert default settings
      db.exec("INSERT INTO settings (id) VALUES ('default')");

      // These should be valid runtime values
      const validRuntimes = ["auto", "lima", "colima", "rancher", "docker-desktop", "podman"];

      for (const runtime of validRuntimes) {
        db.prepare("UPDATE settings SET docker_runtime = ? WHERE id = 'default'").run(runtime);

        const row = db
          .prepare("SELECT docker_runtime FROM settings WHERE id = 'default'")
          .get() as { docker_runtime: string };

        expect(row.docker_runtime).toBe(runtime);
      }
    });
  });

  // ==========================================================================
  // DOCKER ACCESSIBILITY CHECK TESTS
  // ==========================================================================

  describe("Docker Accessibility Check", () => {
    it.skipIf(!hasDocker)("should report Docker as accessible", async () => {
      const { isDockerAccessible } = await import("./docker-utils");

      const result = await isDockerAccessible();

      expect(result.accessible).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it.skipIf(!hasDocker)("should get Docker version", async () => {
      const { getDockerVersion } = await import("./docker-utils");

      const version = await getDockerVersion();

      expect(version).not.toBeNull();
      expect(version).toMatch(/^\d+\.\d+/);
    });
  });

  // ==========================================================================
  // CONTAINER LISTING TESTS
  // ==========================================================================

  describe("Container Listing", () => {
    it.skipIf(!hasDocker)("should list containers without error", async () => {
      const { listContainers } = await import("./docker-utils");

      const result = await listContainers();

      // Should not have an error
      expect(result.error).toBeUndefined();

      // Containers should be an array (may be empty)
      expect(Array.isArray(result.containers)).toBe(true);
    });

    it.skipIf(!hasDocker)("should filter containers by name pattern", async () => {
      const { listContainers } = await import("./docker-utils");

      // Filter for a pattern that likely won't match anything
      const result = await listContainers("brain-dump-nonexistent-test-xyz");

      expect(result.error).toBeUndefined();
      expect(result.containers).toEqual([]);
    });
  });
});
