import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  getDatabaseHealth,
  getEnvironment,
  getProjectSettings,
  updateProjectSettings,
} from "../health.ts";
import type { HealthDependencies, EnvironmentDetector } from "../health.ts";
import { ProjectNotFoundError } from "../errors.ts";
import { seedProject } from "./test-helpers.ts";

let db: Database.Database;

const mockDeps: HealthDependencies = {
  listBackups: () => [],
  checkLock: () => ({ isLocked: false, isStale: false, lockInfo: null }),
};

const mockDetector: EnvironmentDetector = {
  detectEnvironment: () => "claude-code",
  getEnvironmentInfo: () => ({
    environment: "claude-code",
    workspacePath: "/tmp/test-project",
    envVarsDetected: ["CLAUDE_CODE"],
  }),
};

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
});

describe("getDatabaseHealth", () => {
  it("returns healthy status for a good database", () => {
    const report = getDatabaseHealth(db, mockDeps);

    expect(report.status).toBe("healthy");
    expect(report.integrityCheck).toBe("ok");
    expect(report.stats).toMatchObject({
      projects: 0,
      epics: 0,
      tickets: 0,
    });
  });

  it("includes backup information", () => {
    const report = getDatabaseHealth(db, mockDeps);

    expect(report.backup.backupCount).toBe(0);
    expect(report.backup.lastBackup).toBeNull();
  });

  it("reports stale lock as warning", () => {
    const staleDeps: HealthDependencies = {
      listBackups: () => [],
      checkLock: () => ({
        isLocked: false,
        isStale: true,
        lockInfo: { pid: 12345, type: "test", startedAt: new Date().toISOString() },
      }),
    };

    const report = getDatabaseHealth(db, staleDeps);
    expect(report.status).toBe("warning");
    expect(report.issues).toContain("Stale lock file detected (from crashed process)");
  });

  it("counts projects, epics, and tickets", () => {
    seedProject(db);
    db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
      "e1",
      "Epic",
      "proj-1",
      new Date().toISOString()
    );
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tickets (id, title, status, priority, position, project_id, created_at, updated_at)
       VALUES (?, ?, 'backlog', 'medium', 1, ?, ?, ?)`
    ).run("t1", "Ticket", "proj-1", now, now);

    const report = getDatabaseHealth(db, mockDeps);
    expect(report.stats.projects).toBe(1);
    expect(report.stats.epics).toBe(1);
    expect(report.stats.tickets).toBe(1);
  });
});

describe("getEnvironment", () => {
  it("returns detected environment info", () => {
    const result = getEnvironment(db, mockDetector);

    expect(result.environment).toBe("claude-code");
    expect(result.workspacePath).toBe("/tmp/test-project");
    expect(result.envVarsDetected).toContain("CLAUDE_CODE");
  });

  it("detects project from workspace path", () => {
    seedProject(db, { id: "p1", name: "My Project", path: "/tmp/test-project" });

    const result = getEnvironment(db, mockDetector);
    expect(result.detectedProject).not.toBeNull();
    expect(result.detectedProject!.name).toBe("My Project");
  });

  it("returns null when no project matches", () => {
    seedProject(db, { id: "p1", name: "Other", path: "/completely/different/path" });

    const result = getEnvironment(db, mockDetector);
    expect(result.detectedProject).toBeNull();
  });
});

describe("getProjectSettings", () => {
  it("returns project settings with effective environment", () => {
    seedProject(db);

    const result = getProjectSettings(db, "proj-1", () => "claude-code");

    expect(result.projectId).toBe("proj-1");
    expect(result.workingMethod).toBe("auto");
    expect(result.effectiveEnvironment).toBe("claude-code");
    expect(result.detectedEnvironment).toBe("claude-code");
  });

  it("uses working method override when set", () => {
    seedProject(db);
    db.prepare("UPDATE projects SET working_method = 'vscode' WHERE id = ?").run("proj-1");

    const result = getProjectSettings(db, "proj-1", () => "claude-code");

    expect(result.workingMethod).toBe("vscode");
    expect(result.effectiveEnvironment).toBe("vscode");
  });

  it("throws ProjectNotFoundError for nonexistent project", () => {
    expect(() => getProjectSettings(db, "nonexistent", () => "claude-code")).toThrow(
      ProjectNotFoundError
    );
  });
});

describe("updateProjectSettings", () => {
  it("updates working method and returns new settings", () => {
    seedProject(db);

    const result = updateProjectSettings(db, "proj-1", "vscode", () => "claude-code");

    expect(result.workingMethod).toBe("vscode");
    expect(result.effectiveEnvironment).toBe("vscode");
  });

  it("persists the setting change", () => {
    seedProject(db);

    updateProjectSettings(db, "proj-1", "claude-code", () => "vscode");
    const result = getProjectSettings(db, "proj-1", () => "vscode");

    expect(result.workingMethod).toBe("claude-code");
    expect(result.effectiveEnvironment).toBe("claude-code");
  });

  it("throws ProjectNotFoundError for nonexistent project", () => {
    expect(() => updateProjectSettings(db, "nonexistent", "auto", () => "claude-code")).toThrow(
      ProjectNotFoundError
    );
  });
});
