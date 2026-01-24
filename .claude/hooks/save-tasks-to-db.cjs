#!/usr/bin/env node
/**
 * save-tasks-to-db.js
 * Helper script called by capture-claude-tasks.sh hook
 *
 * Saves Claude tasks directly to the Brain Dump database.
 *
 * Usage: node save-tasks-to-db.js <ticketId> <tasksJson>
 *
 * Environment:
 *   PROJECT_DIR - Project directory (for Ralph state)
 */

const { join } = require("path");
const { existsSync, readFileSync } = require("fs");
const { randomUUID } = require("crypto");

// Parse command line args
const ticketId = process.argv[2];
const tasksJson = process.argv[3];

if (!ticketId || !tasksJson) {
  console.error("Usage: node save-tasks-to-db.js <ticketId> <tasksJson>");
  process.exit(1);
}

// Find the database path based on platform
const homeDir = process.env.HOME || process.env.USERPROFILE;
const platform = process.platform;
let dbPath;

if (platform === "darwin") {
  dbPath = join(homeDir, "Library/Application Support/brain-dump/brain-dump.db");
} else if (platform === "win32") {
  dbPath = join(process.env.APPDATA || "", "brain-dump/brain-dump.db");
} else {
  dbPath = join(homeDir, ".local/share/brain-dump/brain-dump.db");
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
  const projectDir = process.env.PROJECT_DIR || process.cwd();
  const mcpNodeModules = join(projectDir, "mcp-server/node_modules/better-sqlite3");
  if (existsSync(mcpNodeModules)) {
    Database = require(mcpNodeModules);
  } else {
    console.error("better-sqlite3 not found. Make sure you're in the brain-dump project.");
    process.exit(1);
  }
}

const db = new Database(dbPath);
const tasks = JSON.parse(tasksJson);
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
} catch {}

// Verify ticket exists
const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(ticketId);
if (!ticket) {
  console.error("Ticket not found:", ticketId);
  db.close();
  process.exit(1);
}

// Get existing tasks to preserve history
const existingTasks = db.prepare(
  "SELECT id, status, status_history, created_at FROM claude_tasks WHERE ticket_id = ?"
).all(ticketId);
const existingTaskMap = new Map(existingTasks.map(t => [t.id, t]));

// Delete existing tasks
db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(ticketId);

// Insert new tasks
const insertStmt = db.prepare(`
  INSERT INTO claude_tasks (id, ticket_id, subject, description, status, active_form, position, status_history, session_id, created_at, updated_at, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < tasks.length; i++) {
  const task = tasks[i];
  const taskId = task.id || randomUUID();
  const position = i + 1;

  // Preserve or initialize status history
  let statusHistory = [];
  const existing = existingTaskMap.get(taskId);
  if (existing?.status_history) {
    try {
      statusHistory = JSON.parse(existing.status_history);
    } catch {}
  }

  // Add status entry if changed
  const lastStatus = statusHistory.length > 0 ? statusHistory[statusHistory.length - 1].status : null;
  if (task.status !== lastStatus) {
    statusHistory.push({ status: task.status, timestamp: now });
  }

  const completedAt = task.status === "completed" ? now : null;

  insertStmt.run(
    taskId,
    ticketId,
    task.subject,
    task.description || null,
    task.status,
    task.activeForm || null,
    position,
    JSON.stringify(statusHistory),
    sessionId,
    existing ? existing.created_at : now,
    now,
    completedAt
  );
}

db.close();
console.log(`Saved ${tasks.length} tasks for ticket ${ticketId.substring(0, 8)}...`);
