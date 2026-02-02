/**
 * Project business logic for the core layer.
 *
 * Extracted from mcp-server/tools/projects.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import { existsSync } from "fs";
import type { DbHandle, Project, DeleteResult } from "./types.ts";
import { ProjectNotFoundError, PathNotFoundError, ValidationError } from "./errors.ts";
import type { DbProjectRow } from "./db-rows.ts";

// ============================================
// Internal Helpers
// ============================================

function toProject(row: DbProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    color: row.color,
    workingMethod: row.working_method as Project["workingMethod"],
    createdAt: row.created_at,
  };
}

// ============================================
// Public API
// ============================================

/**
 * List all projects ordered by name.
 */
export function listProjects(db: DbHandle): Project[] {
  const rows = db.prepare("SELECT * FROM projects ORDER BY name").all() as DbProjectRow[];
  return rows.map(toProject);
}

/**
 * Find a project by filesystem path.
 * Returns the matching project or null if not found.
 * Matches when the given path starts with the project path, or vice versa.
 */
export function findProjectByPath(db: DbHandle, path: string): Project | null {
  const rows = db.prepare("SELECT * FROM projects").all() as DbProjectRow[];
  const match = rows.find((p) => path.startsWith(p.path) || p.path.startsWith(path));
  return match ? toProject(match) : null;
}

export interface CreateProjectParams {
  name: string;
  path: string;
  color?: string | undefined;
}

/**
 * Create a new project.
 * @throws PathNotFoundError if the path doesn't exist on disk
 * @throws ValidationError if a project already exists at the given path
 */
export function createProject(db: DbHandle, params: CreateProjectParams): Project {
  const { name, path, color } = params;

  if (!existsSync(path)) {
    throw new PathNotFoundError(path);
  }

  const existing = db.prepare("SELECT * FROM projects WHERE path = ?").get(path) as
    | DbProjectRow
    | undefined;
  if (existing) {
    throw new ValidationError(
      `Project already exists at this path: "${existing.name}" (${existing.id})`,
      { path, existingProjectId: existing.id }
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO projects (id, name, path, color, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    name.trim(),
    path,
    color || null,
    now
  );

  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as DbProjectRow;
  return toProject(row);
}

/**
 * Delete a project and all its associated data (epics, tickets, comments).
 * Uses dry-run pattern: confirm=false returns preview, confirm=true deletes.
 * @throws ProjectNotFoundError if the project doesn't exist
 */
export function deleteProject(
  db: DbHandle,
  projectId: string,
  confirm: boolean = false
): DeleteResult {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | DbProjectRow
    | undefined;
  if (!row) throw new ProjectNotFoundError(projectId);

  const epicCount = (
    db.prepare("SELECT COUNT(*) as count FROM epics WHERE project_id = ?").get(projectId) as {
      count: number;
    }
  ).count;

  const ticketIds = (
    db.prepare("SELECT id FROM tickets WHERE project_id = ?").all(projectId) as Array<{
      id: string;
    }>
  ).map((t) => t.id);

  let commentCount = 0;
  if (ticketIds.length > 0) {
    const placeholders = ticketIds.map(() => "?").join(",");
    commentCount = (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id IN (${placeholders})`
        )
        .get(...ticketIds) as { count: number }
    ).count;
  }

  const totalChildren = epicCount + ticketIds.length + commentCount;

  if (!confirm) {
    return {
      dryRun: true,
      wouldDelete: {
        entity: "project",
        id: projectId,
        title: row.name,
        childCount: totalChildren,
      },
      warning: `This will delete project "${row.name}" and all associated data: ${epicCount} epic(s), ${ticketIds.length} ticket(s), ${commentCount} comment(s). Set confirm=true to proceed.`,
    };
  }

  db.transaction(() => {
    if (ticketIds.length > 0) {
      const placeholders = ticketIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM ticket_comments WHERE ticket_id IN (${placeholders})`).run(
        ...ticketIds
      );
    }
    db.prepare("DELETE FROM tickets WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM epics WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  })();

  return {
    dryRun: false,
    deleted: {
      entity: "project",
      id: projectId,
      title: row.name,
      childrenDeleted: totalChildren,
    },
  };
}
