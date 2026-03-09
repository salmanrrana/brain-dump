import type Database from "better-sqlite3";

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return columns.some((column) => column.name === columnName);
}

export function ensureTicketWorkflowColumns(sqlite: Database.Database): void {
  if (!hasColumn(sqlite, "tickets", "branch_name")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN branch_name TEXT");
  }

  if (!hasColumn(sqlite, "tickets", "pr_number")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN pr_number INTEGER");
  }

  if (!hasColumn(sqlite, "tickets", "pr_url")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN pr_url TEXT");
  }

  if (!hasColumn(sqlite, "tickets", "pr_status")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN pr_status TEXT");
  }
}

export function ensureTelemetryTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      environment TEXT NOT NULL DEFAULT 'unknown',
      branch_name TEXT,
      claude_session_id TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      total_prompts INTEGER DEFAULT 0,
      total_tool_calls INTEGER DEFAULT 0,
      total_duration_ms INTEGER,
      total_tokens INTEGER,
      outcome TEXT
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,
      ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      event_data TEXT,
      duration_ms INTEGER,
      token_count INTEGER,
      is_error INTEGER DEFAULT 0,
      correlation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_ticket ON telemetry_sessions (ticket_id)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_project ON telemetry_sessions (project_id)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_started ON telemetry_sessions (started_at)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_events_session ON telemetry_events (session_id)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_events_ticket ON telemetry_events (ticket_id)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events (event_type)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_events_created ON telemetry_events (created_at)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_telemetry_events_correlation ON telemetry_events (correlation_id)"
  );
}
