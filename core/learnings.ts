/**
 * Learning reconciliation business logic for the core layer.
 *
 * Extracted from mcp-server/tools/learnings.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { DbHandle, Learning } from "./types.ts";
import { TicketNotFoundError, EpicNotFoundError, InvalidStateError } from "./errors.ts";
import { addComment } from "./comment.ts";

// ============================================
// Internal DB Row Types
// ============================================

interface TicketRow {
  id: string;
  title: string;
  status: string;
  epic_id: string | null;
}

interface DbEpicWorkflowState {
  id: string;
  epic_id: string;
  tickets_total: number;
  tickets_done: number;
  learnings: string | null;
  created_at: string;
  updated_at: string;
}

interface DbEpicRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
}

interface CountResult {
  count: number;
}

// ============================================
// Public Types
// ============================================

export interface LearningEntry {
  ticketId: string;
  ticketTitle: string;
  learnings: Learning[];
  appliedAt: string;
}

export interface DocUpdateResult {
  file: string;
  section: string;
  status: "success" | "failed";
  error?: string;
}

export interface ReconcileLearningsResult {
  ticketId: string;
  ticketTitle: string;
  learningsStored: number;
  docsUpdated: DocUpdateResult[];
  commentWarning?: string | undefined;
}

export interface GetEpicLearningsResult {
  epicId: string;
  epicTitle: string;
  ticketsCompleted: number;
  learnings: LearningEntry[];
}

// ============================================
// Public API
// ============================================

/**
 * Extract and reconcile learnings from a completed ticket.
 * Stores learnings in epic workflow state and optionally updates project docs.
 */
export function reconcileLearnings(
  db: DbHandle,
  ticketId: string,
  learnings: Learning[],
  updateDocs: boolean = false
): ReconcileLearningsResult {
  const ticket = db
    .prepare("SELECT id, title, status, epic_id FROM tickets WHERE id = ?")
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  if (ticket.status !== "done") {
    throw new InvalidStateError("ticket", ticket.status, "done", "reconcile learnings");
  }

  if (!ticket.epic_id) {
    throw new InvalidStateError(
      "ticket",
      "no epic",
      "assigned to an epic",
      "reconcile learnings (learnings are stored at the epic level)"
    );
  }

  const learningEntry: LearningEntry = {
    ticketId,
    ticketTitle: ticket.title,
    learnings,
    appliedAt: new Date().toISOString(),
  };

  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(ticket.epic_id) as DbEpicWorkflowState | undefined;

  const now = new Date().toISOString();

  if (!epicState) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, tickets_total, tickets_done, learnings, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?, ?)`
    ).run(id, ticket.epic_id, JSON.stringify([learningEntry]), now, now);
  } else {
    const existingLearnings: LearningEntry[] = epicState.learnings
      ? JSON.parse(epicState.learnings)
      : [];
    existingLearnings.push(learningEntry);

    db.prepare(
      "UPDATE epic_workflow_state SET learnings = ?, updated_at = ? WHERE epic_id = ?"
    ).run(JSON.stringify(existingLearnings), now, ticket.epic_id);
  }

  // Apply documentation updates if requested
  const docsUpdated: DocUpdateResult[] = [];
  if (updateDocs) {
    for (const learning of learnings) {
      if (learning.suggestedUpdate) {
        const { file, section, content } = learning.suggestedUpdate;
        try {
          const filePath = file.startsWith("/") ? file : join(process.cwd(), file);

          let fileContent = "";
          if (existsSync(filePath)) {
            fileContent = readFileSync(filePath, "utf8");
          }

          const sectionMarker = `## ${section}`;
          let updated = false;

          if (fileContent.includes(sectionMarker)) {
            const lines = fileContent.split("\n");
            const sectionIndex = lines.findIndex((l) => l === sectionMarker);
            const nextSectionIndex = lines.findIndex(
              (l, i) => i > sectionIndex && l.startsWith("##")
            );

            if (nextSectionIndex !== -1) {
              lines.splice(nextSectionIndex, 0, content, "");
            } else {
              lines.push("", content);
            }

            fileContent = lines.join("\n");
            updated = true;
          } else {
            fileContent += `\n## ${section}\n${content}\n`;
            updated = true;
          }

          if (updated) {
            writeFileSync(filePath, fileContent, "utf8");
            docsUpdated.push({ file, section, status: "success" });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          docsUpdated.push({ file, section, status: "failed", error: errorMsg });
        }
      }
    }
  }

  // Update tickets_done count
  const ticketsDone = (
    db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
      .get(ticket.epic_id) as CountResult
  ).count;

  db.prepare(
    "UPDATE epic_workflow_state SET tickets_done = ?, updated_at = ? WHERE epic_id = ?"
  ).run(ticketsDone, now, ticket.epic_id);

  // Create audit trail comment
  const learningsLines = learnings.map((l) => `- [${l.type}] ${l.description}`).join("\n");
  const successfulUpdates = docsUpdated.filter((u) => u.status === "success");
  const docsSection =
    successfulUpdates.length > 0
      ? `\n\nDocumentation updated:\n${successfulUpdates.map((u) => `- ${u.file} (${u.section})`).join("\n")}`
      : "";
  const commentContent = `Learnings reconciled from ticket.\n\nLearnings recorded:\n${learningsLines}${docsSection}`;

  let commentWarning: string | undefined;
  try {
    addComment(db, { ticketId, content: commentContent, type: "progress" });
  } catch (err) {
    commentWarning = `Audit trail comment was not saved: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    ticketId,
    ticketTitle: ticket.title,
    learningsStored: learnings.length,
    docsUpdated,
    commentWarning,
  };
}

/**
 * Get all accumulated learnings for an epic.
 */
export function getEpicLearnings(db: DbHandle, epicId: string): GetEpicLearningsResult {
  const epic = db.prepare("SELECT id, title FROM epics WHERE id = ?").get(epicId) as
    | DbEpicRow
    | undefined;

  if (!epic) {
    throw new EpicNotFoundError(epicId);
  }

  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as DbEpicWorkflowState | undefined;

  const learnings: LearningEntry[] = epicState?.learnings ? JSON.parse(epicState.learnings) : [];

  const ticketsCompleted = (
    db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
      .get(epicId) as CountResult
  ).count;

  return {
    epicId,
    epicTitle: epic.title,
    ticketsCompleted,
    learnings,
  };
}
