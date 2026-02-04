/**
 * Epic business logic for the core layer.
 *
 * Extracted from mcp-server/tools/epics.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import type { DbHandle, Epic, DeleteResult } from "./types.ts";
import { EpicNotFoundError, ProjectNotFoundError, ValidationError } from "./errors.ts";
import type { DbEpicRow, DbProjectRow } from "./db-rows.ts";

// ============================================
// Internal Helpers
// ============================================

function toEpic(row: DbEpicRow): Epic {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    color: row.color,
    createdAt: row.created_at,
  };
}

function getEpicRow(db: DbHandle, epicId: string): DbEpicRow {
  const row = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpicRow | undefined;
  if (!row) throw new EpicNotFoundError(epicId);
  return row;
}

function getProjectRow(db: DbHandle, projectId: string): DbProjectRow {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | DbProjectRow
    | undefined;
  if (!row) throw new ProjectNotFoundError(projectId);
  return row;
}

// ============================================
// Public API
// ============================================

export interface CreateEpicParams {
  projectId: string;
  title: string;
  description?: string | undefined;
  color?: string | undefined;
}

/**
 * Create a new epic in a project.
 * @throws ProjectNotFoundError if the project doesn't exist
 */
export function createEpic(db: DbHandle, params: CreateEpicParams): Epic {
  const { projectId, title, description, color } = params;

  getProjectRow(db, projectId);

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, title.trim(), description?.trim() || null, projectId, color || null, now);

  const row = db.prepare("SELECT * FROM epics WHERE id = ?").get(id) as DbEpicRow;
  return toEpic(row);
}

/**
 * List epics for a project, ordered by title.
 * @throws ProjectNotFoundError if the project doesn't exist
 */
export function listEpics(db: DbHandle, projectId: string): Epic[] {
  getProjectRow(db, projectId);

  const rows = db
    .prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY title")
    .all(projectId) as DbEpicRow[];

  return rows.map(toEpic);
}

export interface UpdateEpicParams {
  title?: string | undefined;
  description?: string | undefined;
  color?: string | undefined;
}

/**
 * Update an existing epic's title, description, or color.
 * @throws EpicNotFoundError if the epic doesn't exist
 * @throws ValidationError if no updates are provided
 */
export function updateEpic(db: DbHandle, epicId: string, params: UpdateEpicParams): Epic {
  getEpicRow(db, epicId);

  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (params.title !== undefined) {
    updates.push("title = ?");
    values.push(params.title.trim());
  }
  if (params.description !== undefined) {
    updates.push("description = ?");
    values.push(params.description.trim() || null);
  }
  if (params.color !== undefined) {
    updates.push("color = ?");
    values.push(params.color || null);
  }

  if (updates.length === 0) {
    throw new ValidationError(
      "No updates provided. Specify at least one of: title, description, color"
    );
  }

  values.push(epicId);
  db.prepare(`UPDATE epics SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updatedRow = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpicRow;
  return toEpic(updatedRow);
}

/**
 * Delete an epic and unlink its tickets.
 * Uses dry-run pattern: confirm=false returns preview, confirm=true deletes.
 * @throws EpicNotFoundError if the epic doesn't exist
 */
export function deleteEpic(db: DbHandle, epicId: string, confirm: boolean = false): DeleteResult {
  const epicRow = getEpicRow(db, epicId);

  const tickets = db
    .prepare("SELECT id, title, status FROM tickets WHERE epic_id = ?")
    .all(epicId) as Array<{ id: string; title: string; status: string }>;

  if (!confirm) {
    return {
      dryRun: true,
      wouldDelete: {
        entity: "epic",
        id: epicId,
        title: epicRow.title,
        childCount: tickets.length,
      },
      warning: `This will delete epic "${epicRow.title}" and unlink ${tickets.length} ticket(s). Tickets will remain in the project but no longer belong to this epic. Set confirm=true to proceed.`,
    };
  }

  db.transaction(() => {
    db.prepare("UPDATE tickets SET epic_id = NULL, updated_at = ? WHERE epic_id = ?").run(
      new Date().toISOString(),
      epicId
    );
    db.prepare("DELETE FROM epics WHERE id = ?").run(epicId);
  })();

  return {
    dryRun: false,
    deleted: {
      entity: "epic",
      id: epicId,
      title: epicRow.title,
      childrenDeleted: tickets.length,
    },
  };
}
