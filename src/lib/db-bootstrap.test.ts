import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type Database from "better-sqlite3";
import { stopWatching } from "./db-watcher";

describe("db bootstrap", () => {
  let sqlite: Database.Database | null = null;
  let testBase: string;

  beforeEach(() => {
    testBase = join(
      tmpdir(),
      `brain-dump-db-bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }

    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(async () => {
    stopWatching();
    sqlite = null;
    vi.clearAllTimers();
    vi.useRealTimers();

    const xdgModule = await import("./xdg");
    xdgModule._setDataDirOverride(null);
    xdgModule._setStateDirOverride(null);

    if (existsSync(testBase)) {
      rmSync(testBase, { recursive: true, force: true });
    }
  });

  it("creates review workflow tables for app-managed databases", async () => {
    const xdgModule = await import("./xdg");
    xdgModule._setDataDirOverride(join(testBase, "data"));
    xdgModule._setStateDirOverride(join(testBase, "state"));

    const dbModule = await import("./db");
    sqlite = dbModule.sqlite;

    const tables = [
      "ticket_workflow_state",
      "review_findings",
      "demo_scripts",
      "epic_review_runs",
      "epic_review_run_tickets",
    ];

    for (const table of tables) {
      const row = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(table) as { name: string } | undefined;

      expect(row?.name).toBe(table);
    }
  });
});
