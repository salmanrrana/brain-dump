/**
 * Shared comment utilities for Brain Dump MCP server.
 * Provides consistent comment creation with proper error handling.
 * @module lib/comment-utils
 */
import { randomUUID } from "crypto";
import { log } from "./logging.js";
import { detectAuthor } from "./environment.js";

/**
 * Add a comment to a ticket with proper error handling.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} content
 * @param {string} author - One of: "claude", "ralph", "user", "opencode", "cursor", "vscode", or null to auto-detect
 * @param {string} type - One of: "comment", "work_summary", "test_report", "progress"
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
export function addComment(db, ticketId, content, author = null, type = "comment") {
  // Auto-detect author if not provided (or explicitly null)
  if (author === null || author === undefined) {
    author = detectAuthor();
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, ticketId, content.trim(), author, type, now);
    log.info(`Added ${type} to ticket ${ticketId} by ${author}`);
    return { success: true, id };
  } catch (err) {
    log.error(`Failed to add ${type} to ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
