/**
 * Search business logic.
 *
 * FTS5-first full-text search with LIKE fallback when FTS5 table is unavailable.
 */

import type { DbHandle, TicketStatus } from "./types.ts";

// ── Types ──────────────────────────────────────────────────────

export interface SearchParams {
  query: string;
  projectId?: string | undefined;
  status?: TicketStatus | undefined;
  limit?: number | undefined;
}

export interface SearchResult {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  projectId: string;
  projectName: string;
  epicId: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────

function hasFts5Table(db: DbHandle): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets_fts'")
    .get() as { name: string } | undefined;
  return row !== undefined;
}

// ── Search ─────────────────────────────────────────────────────

/**
 * Search tickets using FTS5 when available, falling back to LIKE.
 *
 * FTS5 searches across title, description, tags, and subtasks.
 * LIKE fallback searches title and description only.
 */
export function searchTickets(db: DbHandle, params: SearchParams): SearchResult[] {
  const { query, projectId, status, limit = 50 } = params;

  if (hasFts5Table(db)) {
    return searchFts5(db, query, projectId, status, limit);
  }
  return searchLike(db, query, projectId, status, limit);
}

function searchFts5(
  db: DbHandle,
  query: string,
  projectId: string | undefined,
  status: TicketStatus | undefined,
  limit: number
): SearchResult[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // FTS5 match condition
  conditions.push("tickets_fts MATCH ?");
  values.push(query);

  if (projectId) {
    conditions.push("t.project_id = ?");
    values.push(projectId);
  }

  if (status) {
    conditions.push("t.status = ?");
    values.push(status);
  }

  values.push(limit);

  const sql = `
    SELECT t.id, t.title, t.status, t.priority, t.project_id,
           p.name as project_name, t.epic_id, t.tags,
           t.created_at, t.updated_at
    FROM tickets t
    JOIN tickets_fts ON tickets_fts.rowid = t.rowid
    JOIN projects p ON t.project_id = p.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...values) as Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    project_id: string;
    project_name: string;
    epic_id: string | null;
    tags: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    projectId: r.project_id,
    projectName: r.project_name,
    epicId: r.epic_id,
    tags: r.tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

function searchLike(
  db: DbHandle,
  query: string,
  projectId: string | undefined,
  status: TicketStatus | undefined,
  limit: number
): SearchResult[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // LIKE fallback: search title and description
  const likePattern = `%${query}%`;
  conditions.push("(t.title LIKE ? OR t.description LIKE ?)");
  values.push(likePattern, likePattern);

  if (projectId) {
    conditions.push("t.project_id = ?");
    values.push(projectId);
  }

  if (status) {
    conditions.push("t.status = ?");
    values.push(status);
  }

  values.push(limit);

  const sql = `
    SELECT t.id, t.title, t.status, t.priority, t.project_id,
           p.name as project_name, t.epic_id, t.tags,
           t.created_at, t.updated_at
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY t.updated_at DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...values) as Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    project_id: string;
    project_name: string;
    epic_id: string | null;
    tags: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    projectId: r.project_id,
    projectName: r.project_name,
    epicId: r.epic_id,
    tags: r.tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
