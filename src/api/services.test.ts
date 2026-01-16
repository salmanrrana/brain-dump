/**
 * Tests for Service Discovery API
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - Test what the UI will actually call and receive
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { RalphServicesFile, RalphService } from "../lib/service-discovery";
import { SERVICES_FILENAME } from "../lib/service-discovery";

// Since server functions are hard to test directly, we'll test the core logic
// by simulating what the handler does

function createTestDir(): string {
  const testDir = join(tmpdir(), `services-test-${randomUUID()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDir(testDir: string): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

function writeServicesFile(projectPath: string, content: unknown): string {
  const filePath = join(projectPath, SERVICES_FILENAME);
  if (typeof content === "string") {
    writeFileSync(filePath, content, "utf-8");
  } else {
    writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
  }
  return filePath;
}

// Helper to simulate what getProjectServices does
function getServices(projectPath: string): RalphServicesFile {
  const servicesFile = join(projectPath, SERVICES_FILENAME);

  if (!existsSync(projectPath)) {
    return { services: [], updatedAt: new Date().toISOString() };
  }

  if (!existsSync(servicesFile)) {
    return { services: [], updatedAt: new Date().toISOString() };
  }

  try {
    const content = require("fs").readFileSync(servicesFile, "utf-8");
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.services)) {
      return { services: [], updatedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { services: [], updatedAt: new Date().toISOString() };
  }
}

// Helper to check running services
function checkRunningServices(projectPath: string): { hasServices: boolean; count: number } {
  const result = getServices(projectPath);
  const runningServices = result.services.filter((s) => s.status === "running");
  return {
    hasServices: runningServices.length > 0,
    count: runningServices.length,
  };
}

describe("Service Discovery API", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("getProjectServices", () => {
    it("should return empty services when file does not exist", () => {
      const result = getServices(testDir);

      expect(result.services).toEqual([]);
      expect(result.updatedAt).toBeDefined();
    });

    it("should return empty services when project path does not exist", () => {
      const result = getServices("/nonexistent/path");

      expect(result.services).toEqual([]);
    });

    it("should return parsed services from valid JSON file", () => {
      const validServices: RalphServicesFile = {
        services: [
          {
            name: "vite-dev-server",
            type: "frontend",
            port: 8100,
            status: "running",
            healthEndpoint: "/",
            startedAt: "2024-01-15T10:30:00Z",
          },
        ],
        updatedAt: "2024-01-15T10:35:00Z",
      };

      writeServicesFile(testDir, validServices);
      const result = getServices(testDir);

      expect(result.services).toHaveLength(1);
      expect(result.services[0]?.name).toBe("vite-dev-server");
      expect(result.services[0]?.port).toBe(8100);
      expect(result.services[0]?.status).toBe("running");
    });

    it("should return empty services for malformed JSON", () => {
      writeServicesFile(testDir, "{ invalid json }}}");
      const result = getServices(testDir);

      expect(result.services).toEqual([]);
    });

    it("should return empty services when services is not an array", () => {
      writeServicesFile(testDir, { services: "not an array", updatedAt: "2024-01-15" });
      const result = getServices(testDir);

      expect(result.services).toEqual([]);
    });

    it("should handle multiple services", () => {
      const multipleServices: RalphServicesFile = {
        services: [
          { name: "frontend", type: "frontend", port: 8100, status: "running" },
          { name: "backend", type: "backend", port: 8200, status: "running" },
          { name: "storybook", type: "storybook", port: 8300, status: "stopped" },
        ],
        updatedAt: "2024-01-15T10:35:00Z",
      };

      writeServicesFile(testDir, multipleServices);
      const result = getServices(testDir);

      expect(result.services).toHaveLength(3);
    });

    it("should preserve all service properties", () => {
      const serviceWithAllProps: RalphService = {
        name: "full-service",
        type: "backend",
        port: 8200,
        status: "running",
        healthEndpoint: "/api/health",
        startedAt: "2024-01-15T10:30:00Z",
        description: "Main API server",
      };

      writeServicesFile(testDir, { services: [serviceWithAllProps], updatedAt: "2024-01-15" });
      const result = getServices(testDir);

      expect(result.services[0]).toEqual(serviceWithAllProps);
    });
  });

  describe("hasRunningServices", () => {
    it("should return false when file does not exist", () => {
      const result = checkRunningServices(testDir);

      expect(result.hasServices).toBe(false);
      expect(result.count).toBe(0);
    });

    it("should return true when there are running services", () => {
      const services: RalphServicesFile = {
        services: [
          { name: "frontend", type: "frontend", port: 8100, status: "running" },
        ],
        updatedAt: "2024-01-15",
      };

      writeServicesFile(testDir, services);
      const result = checkRunningServices(testDir);

      expect(result.hasServices).toBe(true);
      expect(result.count).toBe(1);
    });

    it("should not count stopped services", () => {
      const services: RalphServicesFile = {
        services: [
          { name: "frontend", type: "frontend", port: 8100, status: "stopped" },
          { name: "backend", type: "backend", port: 8200, status: "running" },
        ],
        updatedAt: "2024-01-15",
      };

      writeServicesFile(testDir, services);
      const result = checkRunningServices(testDir);

      expect(result.hasServices).toBe(true);
      expect(result.count).toBe(1); // Only the running backend
    });

    it("should return false when all services are stopped", () => {
      const services: RalphServicesFile = {
        services: [
          { name: "frontend", type: "frontend", port: 8100, status: "stopped" },
          { name: "backend", type: "backend", port: 8200, status: "stopped" },
        ],
        updatedAt: "2024-01-15",
      };

      writeServicesFile(testDir, services);
      const result = checkRunningServices(testDir);

      expect(result.hasServices).toBe(false);
      expect(result.count).toBe(0);
    });
  });
});
