import { afterEach, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let sqlite: Database.Database | undefined;
let sandbox: string | undefined;

afterEach(() => {
  if (sqlite?.open) sqlite.close();
  vi.unstubAllEnvs();
  vi.resetModules();
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

it("upgrades a version-8 web database and preserves the implementation cutoff on later boots", async () => {
  sandbox = mkdtempSync(join(tmpdir(), "brain-dump-web-upgrade-"));
  vi.stubEnv("BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS", "1");
  for (const key of [
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
  ]) {
    vi.stubEnv(key, join(sandbox, key.toLowerCase()));
  }
  vi.resetModules();
  sqlite = (await import("./db")).sqlite;
  // Reconstruct the prior web schema while retaining a real ticket/workflow row.
  sqlite.exec("ALTER TABLE ticket_workflow_state DROP COLUMN implementation_started_at");
  sqlite
    .prepare(
      `INSERT INTO ticket_workflow_state (id, ticket_id, updated_at)
    VALUES ('existing-workflow', 'sample-1', '2026-09-04T12:00:00.000Z')`
    )
    .run();
  sqlite.pragma("user_version = 8");
  sqlite.close();

  vi.resetModules();
  sqlite = (await import("./db")).sqlite;
  expect(
    sqlite
      .prepare(
        "SELECT implementation_started_at FROM ticket_workflow_state WHERE id = 'existing-workflow'"
      )
      .get()
  ).toEqual({
    implementation_started_at: "2026-09-04T12:00:00.000Z",
  });
  expect(sqlite.pragma("user_version", { simple: true })).toBeGreaterThan(8);

  sqlite
    .prepare(
      `UPDATE ticket_workflow_state SET implementation_started_at = ?, updated_at = ? WHERE id = 'existing-workflow'`
    )
    .run("2026-09-04T13:00:00.000Z", "2026-09-04T14:00:00.000Z");
  sqlite.close();
  vi.resetModules();
  sqlite = (await import("./db")).sqlite;
  expect(
    sqlite
      .prepare(
        "SELECT implementation_started_at FROM ticket_workflow_state WHERE id = 'existing-workflow'"
      )
      .get()
  ).toEqual({
    implementation_started_at: "2026-09-04T13:00:00.000Z",
  });
});
