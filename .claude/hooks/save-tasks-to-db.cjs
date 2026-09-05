#!/usr/bin/env node
/**
 * save-tasks-to-db.cjs
 * Helper script called by capture-claude-tasks.sh hook
 *
 * Saves Claude tasks directly to the Brain Dump database.
 *
 * Usage: node save-tasks-to-db.cjs <ticketId> <payloadJson> [mode]
 *   mode "replace" (default): payload is the FULL task array -> replace all
 *   mode "create":            payload is ONE task -> insert
 *   mode "update":            payload is ONE task delta keyed by id -> merge
 *
 * Environment:
 *   PROJECT_DIR   - Project directory (for Ralph state)
 *   XDG_DATA_HOME - Respected for the database location (matches src/lib/xdg.ts)
 */

const { join } = require("path");
const { existsSync, readFileSync } = require("fs");
const { randomUUID } = require("crypto");

// Parse command line args
const ticketId = process.argv[2];
const payloadJson = process.argv[3];
const mode = process.argv[4] || "replace";

if (!ticketId || !payloadJson) {
  console.error("Usage: node save-tasks-to-db.cjs <ticketId> <payloadJson> [mode]");
  process.exit(1);
}

// Find the database path (mirror src/lib/xdg.ts: XDG_DATA_HOME wins on Linux)
const homeDir = process.env.HOME || process.env.USERPROFILE;
const platform = process.platform;
let dbPath;

if (platform === "darwin") {
  dbPath = join(homeDir, "Library/Application Support/brain-dump/brain-dump.db");
} else if (platform === "win32") {
  dbPath = join(process.env.APPDATA || "", "brain-dump/brain-dump.db");
} else {
  const dataHome = process.env.XDG_DATA_HOME || join(homeDir, ".local/share");
  dbPath = join(dataHome, "brain-dump/brain-dump.db");
}

if (!existsSync(dbPath)) {
  console.error("Database not found at", dbPath);
  process.exit(1);
}

// Load better-sqlite3 - it should be available since we're in the brain-dump project
let Database;
try {
  Database = require("better-sqlite3");
} catch (err) {
  // Try loading from the mcp-server directory
  const projectDirForRequire = process.env.PROJECT_DIR || process.cwd();
  const mcpNodeModules = join(projectDirForRequire, "mcp-server/node_modules/better-sqlite3");
  if (existsSync(mcpNodeModules)) {
    Database = require(mcpNodeModules);
  } else {
    console.error("better-sqlite3 not found. Make sure you're in the brain-dump project.");
    process.exit(1);
  }
}

const db = new Database(dbPath);
let payload;
try {
  payload = JSON.parse(payloadJson);
} catch (err) {
  console.error("Failed to parse payload JSON:", err.message);
  db.close();
  process.exit(1);
}
const now = new Date().toISOString();

// Read session ID from Ralph state
const projectDir = process.env.PROJECT_DIR || process.cwd();
let sessionId = null;
try {
  const stateFile = join(projectDir, ".claude/ralph-state.json");
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    sessionId = state.sessionId || null;
  }
} catch (err) {
  if (err.code !== "ENOENT") {
    console.warn("Failed to read Ralph state:", err.message);
  }
}

// Verify ticket exists
const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(ticketId);
if (!ticket) {
  console.error("Ticket not found:", ticketId);
  db.close();
  process.exit(1);
}

const insertStmt = db.prepare(`
  INSERT INTO claude_tasks (id, ticket_id, subject, description, status, active_form, position, status_history, session_id, created_at, updated_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`);

// Harness IDs restart at 1. Adopt an old raw ID only within its original
// ticket/Ralph session, retaining its history when a running session upgrades.
// Called inside the write transaction, before replacement removes any rows.
function resolveTaskId(externalId) {
  if (externalId == null) return randomUUID();
  const scope = process.env.BRAIN_DUMP_TASK_SESSION_ID || sessionId || "legacy";
  const scopedId = JSON.stringify([ticketId, scope, String(externalId)]);
  db.prepare(
    `UPDATE claude_tasks SET id = ?
    WHERE id = ? AND ticket_id = ? AND session_id IS ?
      AND NOT EXISTS (SELECT 1 FROM claude_tasks WHERE id = ?)`
  ).run(scopedId, String(externalId), ticketId, sessionId, scopedId);
  return scopedId;
}

function parseHistory(raw, taskId) {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to parse status history for task ${taskId}:`, err.message);
    return [];
  }
}

function pushHistory(history, status) {
  const last = history.length > 0 ? history[history.length - 1].status : null;
  if (status && status !== last) {
    history.push({ status, timestamp: now });
  }
  return history;
}

// A failed insert must never leave a partially replaced list behind.
db.transaction(() => {
  if (mode === "replace") {
    const tasks = (Array.isArray(payload) ? payload : [payload]).map((task) => ({
      ...task,
      id: resolveTaskId(task.id),
    }));
    const existingTasks = db
      .prepare(
        "SELECT id, status, status_history, created_at, completed_at FROM claude_tasks WHERE ticket_id = ?"
      )
      .all(ticketId);
    const existingTaskMap = new Map(existingTasks.map((t) => [t.id, t]));

    db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(ticketId);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskId = task.id;
      const existing = existingTaskMap.get(taskId);
      const statusHistory = pushHistory(
        parseHistory(existing?.status_history, taskId),
        task.status
      );
      insertStmt.run(
        taskId,
        ticketId,
        task.subject,
        task.description || null,
        task.status,
        task.activeForm || null,
        i + 1,
        JSON.stringify(statusHistory),
        sessionId,
        existing ? existing.created_at : now,
        now,
        task.status === "completed" ? existing?.completed_at || now : null
      );
    }
    console.log(`Saved ${tasks.length} tasks for ticket ${ticketId.substring(0, 8)}...`);
  } else if (mode === "create") {
    const task = payload;
    const taskId = resolveTaskId(task.id);
    const maxPosition = db
      .prepare("SELECT COALESCE(MAX(position), 0) as max FROM claude_tasks WHERE ticket_id = ?")
      .get(ticketId).max;
    insertStmt.run(
      taskId,
      ticketId,
      task.subject,
      task.description || null,
      task.status || "pending",
      task.activeForm || null,
      maxPosition + 1,
      JSON.stringify(pushHistory([], task.status || "pending")),
      sessionId,
      now,
      now,
      task.status === "completed" ? now : null
    );
    console.log(`Created task ${taskId} for ticket ${ticketId.substring(0, 8)}...`);
  } else if (mode === "update") {
    const task = payload;
    const taskId = task.id != null ? resolveTaskId(task.id) : null;
    if (!taskId) {
      console.error("update mode requires a task id");
      db.close();
      process.exit(1);
    }
    if (task.status === "deleted") {
      db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ? AND id = ?").run(ticketId, taskId);
      console.log(`Deleted task ${taskId} for ticket ${ticketId.substring(0, 8)}...`);
    } else {
      const existing = db
        .prepare("SELECT * FROM claude_tasks WHERE ticket_id = ? AND id = ?")
        .get(ticketId, taskId);
      if (!existing) {
        // TaskUpdate for a task created before this session started tracking:
        // insert it rather than dropping the update on the floor.
        const maxPosition = db
          .prepare("SELECT COALESCE(MAX(position), 0) as max FROM claude_tasks WHERE ticket_id = ?")
          .get(ticketId).max;
        insertStmt.run(
          taskId,
          ticketId,
          task.subject || `Task #${taskId}`,
          task.description || null,
          task.status || "pending",
          task.activeForm || null,
          maxPosition + 1,
          JSON.stringify(pushHistory([], task.status || "pending")),
          sessionId,
          now,
          now,
          task.status === "completed" ? now : null
        );
      } else {
        const statusHistory = pushHistory(
          parseHistory(existing.status_history, taskId),
          task.status
        );
        db.prepare(
          `UPDATE claude_tasks
         SET subject = COALESCE(?, subject),
             description = COALESCE(?, description),
             status = COALESCE(?, status),
             active_form = COALESCE(?, active_form),
             status_history = ?,
             updated_at = ?,
             completed_at = CASE WHEN ? IS NULL THEN completed_at
               WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE NULL END
         WHERE ticket_id = ? AND id = ?`
        ).run(
          task.subject,
          task.description,
          task.status,
          task.activeForm,
          JSON.stringify(statusHistory),
          now,
          task.status,
          task.status,
          now,
          ticketId,
          taskId
        );
      }
      console.log(`Updated task ${taskId} for ticket ${ticketId.substring(0, 8)}...`);
    }
  } else {
    console.error(`Unknown mode: ${mode}`);
    db.close();
    process.exit(1);
  }
})();

db.close();
