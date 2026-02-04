/**
 * File linking business logic for the core layer.
 *
 * Extracted from mcp-server/tools/files.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import type { DbHandle } from "./types.ts";
import { TicketNotFoundError, ValidationError } from "./errors.ts";
import type { DbTicketRow } from "./db-rows.ts";
import { safeJsonParse } from "./json.ts";

// ============================================
// Types
// ============================================

export interface LinkedFileTicket {
  id: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  linkedFiles: string[];
}

export interface LinkFilesResult {
  ticketId: string;
  ticketTitle: string;
  linkedFiles: string[];
  added: number;
  alreadyLinked: number;
}

// ============================================
// Public API
// ============================================

/**
 * Link file paths to a ticket.
 * Adds new files to the ticket's linked_files list, skipping duplicates.
 */
export function linkFiles(db: DbHandle, ticketId: string, files: string[]): LinkFilesResult {
  if (!files || files.length === 0) {
    throw new ValidationError("No files provided. Send at least one file path to link.");
  }

  const ticket = db
    .prepare(
      `SELECT t.*, p.name as project_name
       FROM tickets t JOIN projects p ON t.project_id = p.id
       WHERE t.id = ?`
    )
    .get(ticketId) as (DbTicketRow & { project_name: string }) | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  const existingFiles: string[] = safeJsonParse(ticket.linked_files, []);
  const existingSet = new Set(existingFiles);

  let added = 0;
  let alreadyLinked = 0;

  for (const file of files) {
    if (existingSet.has(file)) {
      alreadyLinked++;
    } else {
      existingFiles.push(file);
      existingSet.add(file);
      added++;
    }
  }

  if (added > 0) {
    const now = new Date().toISOString();
    db.prepare("UPDATE tickets SET linked_files = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(existingFiles),
      now,
      ticketId
    );
  }

  return {
    ticketId,
    ticketTitle: ticket.title,
    linkedFiles: existingFiles,
    added,
    alreadyLinked,
  };
}

/**
 * Find tickets that have a specific file linked.
 * Supports partial path matching — the linked file path must contain the search path.
 */
export function getTicketsForFile(
  db: DbHandle,
  filePath: string,
  projectId?: string
): LinkedFileTicket[] {
  let query = `
    SELECT t.id, t.title, t.status, t.linked_files, t.project_id, p.name as project_name
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    WHERE t.linked_files IS NOT NULL AND t.linked_files != '[]'
  `;
  const params: string[] = [];

  if (projectId) {
    query += " AND t.project_id = ?";
    params.push(projectId);
  }

  const rows = db.prepare(query).all(...params) as Array<DbTicketRow & { project_name: string }>;

  const results: LinkedFileTicket[] = [];
  for (const row of rows) {
    const linkedFiles: string[] = safeJsonParse(row.linked_files, []);
    const matches = linkedFiles.some((f) => f.includes(filePath) || filePath.includes(f));
    if (matches) {
      results.push({
        id: row.id,
        title: row.title,
        status: row.status,
        projectId: row.project_id,
        projectName: row.project_name,
        linkedFiles,
      });
    }
  }

  return results;
}
