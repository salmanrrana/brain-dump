/**
 * Claude Tasks business logic for the core layer.
 *
 * Extracted from mcp-server/tools/claude-tasks.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { DbHandle } from "./types.ts";
import { TicketNotFoundError, ValidationError } from "./errors.ts";

// ============================================
// Constants
// ============================================

export const TASK_STATUSES = ["pending", "in_progress", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ============================================
// Internal DB Row Types
// ============================================

interface DbClaudeTaskRow {
  id: string;
  status: string;
  status_history: string | null;
  created_at: string;
}

interface DbClaudeTaskFullRow {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  activeForm: string | null;
  position: number;
  status_history: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface DbClaudeTaskSnapshotRow {
  id: string;
  session_id: string | null;
  tasks: string;
  reason: string;
  created_at: string;
}

// ============================================
// Public Types
// ============================================

export interface TaskInput {
  id?: string;
  subject: string;
  description?: string;
  status: TaskStatus;
  activeForm?: string;
}

export interface SavedTask {
  id: string;
  subject: string;
  description?: string | undefined;
  status: string;
  activeForm?: string | undefined;
  position: number;
}

interface StatusHistoryEntry {
  status: string;
  timestamp: string;
}

export interface FormattedTask {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  activeForm: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  statusHistory?: StatusHistoryEntry[];
}

export interface SaveTasksResult {
  ticketId: string;
  ticketTitle: string;
  tasks: SavedTask[];
  snapshotCreated: boolean;
}

export interface GetTasksResult {
  ticketId: string;
  ticketTitle: string;
  tasks: FormattedTask[];
}

export interface ClearTasksResult {
  ticketId: string;
  ticketTitle: string;
  cleared: number;
  snapshotId: string;
}

export interface ParsedSnapshot {
  id: string;
  sessionId: string | null;
  reason: string;
  createdAt: string;
  tasks: SavedTask[];
  taskCount: number;
}

export interface GetSnapshotsResult {
  ticketId: string;
  ticketTitle: string;
  snapshots: ParsedSnapshot[];
}

// ============================================
// Internal Helpers
// ============================================

interface RalphState {
  ticketId?: string;
  sessionId?: string;
}

function readRalphState(projectPath?: string): {
  ticketId: string | null;
  sessionId: string | null;
} {
  const paths: string[] = [
    projectPath ? join(projectPath, ".claude", "ralph-state.json") : "",
    join(process.cwd(), ".claude", "ralph-state.json"),
  ].filter(Boolean);

  for (const statePath of paths) {
    if (existsSync(statePath)) {
      try {
        const state = JSON.parse(readFileSync(statePath, "utf-8")) as RalphState;
        return {
          ticketId: state.ticketId || null,
          sessionId: state.sessionId || null,
        };
      } catch {
        // Continue to next path
      }
    }
  }

  return { ticketId: null, sessionId: null };
}

function resolveTicketId(
  db: DbHandle,
  ticketId?: string
): { ticketId: string; sessionId: string | null; ticketTitle: string } {
  let resolvedTicketId = ticketId;
  let resolvedSessionId: string | null = null;

  if (!resolvedTicketId) {
    const ralphState = readRalphState();
    if (ralphState.ticketId) {
      resolvedTicketId = ralphState.ticketId;
      resolvedSessionId = ralphState.sessionId;
    } else {
      throw new ValidationError(
        "No ticketId provided and no active Ralph session found. Provide a ticketId or start ticket work first."
      );
    }
  }

  const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(resolvedTicketId) as
    | { id: string; title: string }
    | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(resolvedTicketId);
  }

  return { ticketId: resolvedTicketId, sessionId: resolvedSessionId, ticketTitle: ticket.title };
}

// ============================================
// Public API
// ============================================

/**
 * Save Claude's task list for a ticket.
 * Replaces the entire task list, preserving status history for audit trail.
 */
export function saveTasks(
  db: DbHandle,
  tasks: TaskInput[],
  ticketId?: string,
  createSnapshot?: boolean
): SaveTasksResult {
  if (!tasks || tasks.length === 0) {
    throw new ValidationError("No tasks provided. Send at least one task to save.");
  }

  const resolved = resolveTicketId(db, ticketId);
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Get existing tasks to preserve status history
    const existingTasks = db
      .prepare(
        "SELECT id, status, status_history, created_at FROM claude_tasks WHERE ticket_id = ?"
      )
      .all(resolved.ticketId) as DbClaudeTaskRow[];
    const existingTaskMap = new Map(existingTasks.map((t) => [t.id, t]));

    db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(resolved.ticketId);

    const insertStmt = db.prepare(`
      INSERT INTO claude_tasks (id, ticket_id, subject, description, status, active_form, position, status_history, session_id, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const savedTasks: SavedTask[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      const taskId = task.id || randomUUID();
      const position = i + 1;

      let statusHistory: StatusHistoryEntry[] = [];
      const existing = existingTaskMap.get(taskId);
      if (existing?.status_history) {
        try {
          statusHistory = JSON.parse(existing.status_history);
        } catch {
          statusHistory = [];
        }
      }

      const lastEntry =
        statusHistory.length > 0 ? statusHistory[statusHistory.length - 1] : undefined;
      const lastStatus = lastEntry?.status ?? null;
      if (task.status !== lastStatus) {
        statusHistory.push({ status: task.status, timestamp: now });
      }

      const completedAt = task.status === "completed" ? now : null;

      insertStmt.run(
        taskId,
        resolved.ticketId,
        task.subject,
        task.description || null,
        task.status,
        task.activeForm || null,
        position,
        JSON.stringify(statusHistory),
        resolved.sessionId,
        existing ? existing.created_at : now,
        now,
        completedAt
      );

      savedTasks.push({
        id: taskId,
        subject: task.subject,
        description: task.description,
        status: task.status,
        activeForm: task.activeForm,
        position,
      });
    }

    // Create snapshot if requested
    if (createSnapshot) {
      const snapshotId = randomUUID();
      db.prepare(
        `INSERT INTO claude_task_snapshots (id, ticket_id, session_id, tasks, reason, created_at)
         VALUES (?, ?, ?, ?, 'manual', ?)`
      ).run(snapshotId, resolved.ticketId, resolved.sessionId, JSON.stringify(savedTasks), now);
    }

    return savedTasks;
  });

  const savedTasks = transaction();

  return {
    ticketId: resolved.ticketId,
    ticketTitle: resolved.ticketTitle,
    tasks: savedTasks,
    snapshotCreated: !!createSnapshot,
  };
}

/**
 * Retrieve Claude's tasks for a ticket.
 */
export function getTasks(
  db: DbHandle,
  ticketId?: string,
  includeHistory?: boolean
): GetTasksResult {
  const resolved = resolveTicketId(db, ticketId);

  const tasks = db
    .prepare(
      `SELECT id, subject, description, status, active_form as activeForm, position, status_history, session_id, created_at, updated_at, completed_at
       FROM claude_tasks
       WHERE ticket_id = ?
       ORDER BY position ASC`
    )
    .all(resolved.ticketId) as DbClaudeTaskFullRow[];

  const formattedTasks: FormattedTask[] = tasks.map((t) => {
    const task: FormattedTask = {
      id: t.id,
      subject: t.subject,
      description: t.description,
      status: t.status,
      activeForm: t.activeForm,
      position: t.position,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      completedAt: t.completed_at,
    };

    if (includeHistory && t.status_history) {
      try {
        task.statusHistory = JSON.parse(t.status_history);
      } catch {
        task.statusHistory = [];
      }
    }

    return task;
  });

  return {
    ticketId: resolved.ticketId,
    ticketTitle: resolved.ticketTitle,
    tasks: formattedTasks,
  };
}

/**
 * Clear all Claude tasks for a ticket.
 * Creates a snapshot before clearing for audit purposes.
 */
export function clearTasks(db: DbHandle, ticketId?: string): ClearTasksResult {
  const resolved = resolveTicketId(db, ticketId);

  const existingTasks = db
    .prepare(
      `SELECT id, subject, description, status, active_form as activeForm, position
       FROM claude_tasks WHERE ticket_id = ? ORDER BY position ASC`
    )
    .all(resolved.ticketId) as SavedTask[];

  if (existingTasks.length === 0) {
    throw new ValidationError(`No Claude tasks to clear for ticket "${resolved.ticketTitle}".`);
  }

  const now = new Date().toISOString();

  // Create snapshot before clearing
  const snapshotId = randomUUID();
  db.prepare(
    `INSERT INTO claude_task_snapshots (id, ticket_id, session_id, tasks, reason, created_at)
     VALUES (?, ?, ?, ?, 'cleared', ?)`
  ).run(snapshotId, resolved.ticketId, resolved.sessionId, JSON.stringify(existingTasks), now);

  // Delete all tasks
  const result = db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(resolved.ticketId);

  return {
    ticketId: resolved.ticketId,
    ticketTitle: resolved.ticketTitle,
    cleared: result.changes,
    snapshotId,
  };
}

/**
 * Get historical snapshots of Claude's task list for a ticket.
 */
export function getTaskSnapshots(
  db: DbHandle,
  ticketId: string,
  limit: number = 10
): GetSnapshotsResult {
  const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(ticketId) as
    | { id: string; title: string }
    | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  const snapshots = db
    .prepare(
      `SELECT id, session_id, tasks, reason, created_at
       FROM claude_task_snapshots
       WHERE ticket_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(ticketId, limit) as DbClaudeTaskSnapshotRow[];

  const formattedSnapshots: ParsedSnapshot[] = snapshots.map((s) => {
    let parsedTasks: SavedTask[] = [];
    try {
      parsedTasks = JSON.parse(s.tasks);
    } catch {
      parsedTasks = [];
    }
    return {
      id: s.id,
      sessionId: s.session_id,
      reason: s.reason,
      createdAt: s.created_at,
      tasks: parsedTasks,
      taskCount: parsedTasks.length,
    };
  });

  return {
    ticketId,
    ticketTitle: ticket.title,
    snapshots: formattedSnapshots,
  };
}
