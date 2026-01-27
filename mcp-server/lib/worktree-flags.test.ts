/**
 * Tests for worktree feature flag utilities.
 */
import { describe, it, expect } from "vitest";
import {
  isWorktreeSupportEnabled,
  isWorktreeSupportEnabledForEpic,
  getEffectiveIsolationMode,
  type WorktreeDb,
} from "./worktree-flags.js";

// Mock database helper
function createMockDb(preparedResults: Record<string, unknown> = {}): WorktreeDb {
  return {
    prepare: (sql: string) => ({
      get: (): unknown => {
        // Look up result based on SQL pattern
        for (const [pattern, result] of Object.entries(preparedResults)) {
          if (sql.includes(pattern)) {
            return result;
          }
        }
        return undefined;
      },
    }),
  };
}

describe("isWorktreeSupportEnabled", () => {
  it("returns disabled when project has no isolation mode set and no global flag", () => {
    const db = createMockDb({
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: null,
      },
      "SELECT enable_worktree_support FROM settings": undefined,
    });

    const result = isWorktreeSupportEnabled(db, "project-123");

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("returns enabled for project when default_isolation_mode is 'worktree'", () => {
    const db = createMockDb({
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: "worktree",
      },
    });

    const result = isWorktreeSupportEnabled(db, "project-123");

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe("project");
  });

  it("returns enabled for project when default_isolation_mode is 'ask'", () => {
    const db = createMockDb({
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: "ask",
      },
    });

    const result = isWorktreeSupportEnabled(db, "project-123");

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe("project");
  });

  it("returns disabled when project explicitly uses 'branch' mode", () => {
    const db = createMockDb({
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: "branch",
      },
    });

    const result = isWorktreeSupportEnabled(db, "project-123");

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("returns enabled via global setting when project has no mode set", () => {
    const db = createMockDb({
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: null,
      },
      "SELECT enable_worktree_support FROM settings": { enable_worktree_support: 1 },
    });

    const result = isWorktreeSupportEnabled(db, "project-123");

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe("global");
  });

  it("returns disabled when project not found", () => {
    const db = createMockDb({
      "SELECT default_isolation_mode FROM projects": undefined,
    });

    const result = isWorktreeSupportEnabled(db, "nonexistent-project");

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("disabled");
  });
});

describe("isWorktreeSupportEnabledForEpic", () => {
  it("returns enabled when epic has isolation_mode set to worktree", () => {
    const db = createMockDb({
      "SELECT project_id, isolation_mode FROM epics": {
        project_id: "proj-1",
        isolation_mode: "worktree",
      },
    });

    const result = isWorktreeSupportEnabledForEpic(db, "epic-123");

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe("epic");
    expect(result.isolationMode).toBe("worktree");
  });

  it("returns disabled when epic has isolation_mode set to branch", () => {
    const db = createMockDb({
      "SELECT project_id, isolation_mode FROM epics": {
        project_id: "proj-1",
        isolation_mode: "branch",
      },
    });

    const result = isWorktreeSupportEnabledForEpic(db, "epic-123");

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(result.isolationMode).toBe("branch");
  });

  it("falls back to project settings when epic has no isolation mode", () => {
    const db = createMockDb({
      "SELECT project_id, isolation_mode FROM epics": {
        project_id: "proj-1",
        isolation_mode: null,
      },
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: "worktree",
      },
    });

    const result = isWorktreeSupportEnabledForEpic(db, "epic-123");

    expect(result.enabled).toBe(true);
    expect(result.reason).toBe("project");
  });

  it("returns disabled when epic not found", () => {
    const db = createMockDb({
      "SELECT project_id, isolation_mode FROM epics": undefined,
    });

    const result = isWorktreeSupportEnabledForEpic(db, "nonexistent-epic");

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(result.isolationMode).toBe(null);
  });
});

describe("getEffectiveIsolationMode", () => {
  it("uses branch mode when explicitly requested", () => {
    const db = createMockDb({});

    const result = getEffectiveIsolationMode(db, "epic-123", "branch");

    expect(result.mode).toBe("branch");
    expect(result.source).toBe("requested");
  });

  it("uses worktree when requested and feature is enabled", () => {
    const db = createMockDb({
      "SELECT project_id, isolation_mode FROM epics": {
        project_id: "proj-1",
        isolation_mode: "worktree",
      },
    });

    const result = getEffectiveIsolationMode(db, "epic-123", "worktree");

    expect(result.mode).toBe("worktree");
    expect(result.source).toBe("requested");
  });

  it("falls back to branch when worktree requested but not enabled", () => {
    const db = createMockDb({
      "SELECT project_id, isolation_mode FROM epics": {
        project_id: "proj-1",
        isolation_mode: "branch",
      },
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: "branch",
      },
    });

    const result = getEffectiveIsolationMode(db, "epic-123", "worktree");

    expect(result.mode).toBe("branch");
    expect(result.source).toBe("fallback_disabled");
  });

  it("uses epic isolation mode when no request provided", () => {
    // When epic has isolation_mode: "worktree", the code calls isWorktreeSupportEnabledForEpic
    // which in turn queries the epic again and then project settings
    const db = createMockDb({
      // First query: get epic and project settings via JOIN
      "SELECT e.isolation_mode, e.project_id, p.default_isolation_mode": {
        isolation_mode: "worktree",
        project_id: "proj-1",
        default_isolation_mode: null,
      },
      // isWorktreeSupportEnabledForEpic queries epic by id
      "SELECT project_id, isolation_mode FROM epics": {
        project_id: "proj-1",
        isolation_mode: "worktree",
      },
    });

    const result = getEffectiveIsolationMode(db, "epic-123", null);

    expect(result.mode).toBe("worktree");
    expect(result.source).toBe("epic");
  });

  it("uses project default when epic has no isolation mode", () => {
    // The function first gets epic + project settings via JOIN,
    // then calls isWorktreeSupportEnabled with the project_id
    const db = createMockDb({
      // First query: get epic and project settings together
      "SELECT e.isolation_mode, e.project_id, p.default_isolation_mode": {
        isolation_mode: null,
        project_id: "proj-1",
        default_isolation_mode: "worktree",
      },
      // Second query: isWorktreeSupportEnabled checks project's default_isolation_mode
      "SELECT default_isolation_mode FROM projects": {
        default_isolation_mode: "worktree",
      },
    });

    const result = getEffectiveIsolationMode(db, "epic-123", null);

    expect(result.mode).toBe("worktree");
    expect(result.source).toBe("project");
  });

  it("defaults to branch when no settings exist", () => {
    const db = createMockDb({
      "SELECT e.isolation_mode, p.default_isolation_mode": {
        isolation_mode: null,
        default_isolation_mode: null,
      },
    });

    const result = getEffectiveIsolationMode(db, "epic-123", null);

    expect(result.mode).toBe("branch");
    expect(result.source).toBe("default");
  });

  it("defaults to branch when epic not found", () => {
    const db = createMockDb({
      "SELECT e.isolation_mode, p.default_isolation_mode": undefined,
    });

    const result = getEffectiveIsolationMode(db, "nonexistent-epic", null);

    expect(result.mode).toBe("branch");
    expect(result.source).toBe("default");
  });
});
