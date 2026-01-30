/**
 * Learning reconciliation tools for Brain Dump MCP server.
 * Handles extracting and storing learnings from completed tickets,
 * and updating project documentation based on those learnings.
 * @module tools/learnings
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { log } from "../lib/logging.js";
import { addComment } from "../lib/comment-utils.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import type { DbEpic } from "../types.js";

// ============================================
// Constants
// ============================================

/** Learning type categories */
const LEARNING_TYPES = ["pattern", "anti-pattern", "tool-usage", "workflow"] as const;

// ============================================
// Type Definitions
// ============================================

/** DB row for tickets table (snake_case columns from SQLite) */
interface TicketRow {
  id: string;
  title: string;
  status: string;
  epic_id: string | null;
}

/** DB row for epic_workflow_state table (snake_case columns) */
interface DbEpicWorkflowState {
  id: string;
  epic_id: string;
  tickets_total: number;
  tickets_done: number;
  learnings: string | null;
  created_at: string;
  updated_at: string;
}

/** Learning entry stored in epic workflow state */
interface LearningEntry {
  ticketId: string;
  ticketTitle: string;
  learnings: Array<{
    type: (typeof LEARNING_TYPES)[number];
    description: string;
    suggestedUpdate?:
      | {
          file: string;
          section: string;
          content: string;
        }
      | undefined;
  }>;
  appliedAt: string;
}

/** Result of a documentation update attempt */
interface DocUpdateResult {
  file: string;
  section: string;
  status: "success" | "failed";
  error?: string;
}

/** Count result from SQL aggregate query */
interface CountResult {
  count: number;
}

// ============================================
// Tool Registration
// ============================================

/**
 * Register learning reconciliation tools with the MCP server.
 */
export function registerLearningsTools(server: McpServer, db: Database.Database): void {
  // Reconcile learnings from a completed ticket
  server.tool(
    "reconcile_learnings",
    `Extract and reconcile learnings from a completed ticket.

Validates that ticket is in done status, stores learnings in epic workflow state,
and optionally updates project documentation.

Args:
  ticketId: Ticket ID (must be in done status)
  learnings: Array of learning objects with type, description, and optional suggestedUpdate
  updateDocs: If true, apply suggested documentation updates (default: false)

Returns summary of learnings stored and any documentation updates applied.`,
    {
      ticketId: z.string().describe("Ticket ID"),
      learnings: z
        .array(
          z.object({
            type: z.enum(LEARNING_TYPES).describe("Type of learning"),
            description: z.string().describe("Description of the learning"),
            suggestedUpdate: z
              .object({
                file: z.string().describe("Target file (e.g., CLAUDE.md, AGENTS.md)"),
                section: z.string().describe("Section name to update"),
                content: z.string().describe("Content to add"),
              })
              .optional()
              .describe("Optional suggested documentation update"),
          })
        )
        .describe("Learnings extracted from completed work"),
      updateDocs: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, apply suggested documentation updates"),
    },
    async ({
      ticketId,
      learnings,
      updateDocs = false,
    }: {
      ticketId: string;
      learnings: Array<{
        type: (typeof LEARNING_TYPES)[number];
        description: string;
        suggestedUpdate?:
          | {
              file: string;
              section: string;
              content: string;
            }
          | undefined;
      }>;
      updateDocs?: boolean | undefined;
    }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
        | TicketRow
        | undefined;
      if (!ticket) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket not found: ${ticketId}. Use list_tickets to see available tickets.`,
            },
          ],
          isError: true,
        };
      }

      if (ticket.status !== "done") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket must be in done status to reconcile learnings.\nCurrent status: ${ticket.status}`,
            },
          ],
          isError: true,
        };
      }

      if (!ticket.epic_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket is not part of an epic. Learnings are stored at the epic level.`,
            },
          ],
          isError: true,
        };
      }

      // Create learning object with ticket info
      const learningEntry: LearningEntry = {
        ticketId,
        ticketTitle: ticket.title,
        learnings,
        appliedAt: new Date().toISOString(),
      };

      // Get or create epic workflow state
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
        // Append to existing learnings
        const existingLearnings: LearningEntry[] = epicState.learnings
          ? JSON.parse(epicState.learnings)
          : [];
        existingLearnings.push(learningEntry);

        db.prepare(
          `UPDATE epic_workflow_state SET learnings = ?, updated_at = ? WHERE epic_id = ?`
        ).run(JSON.stringify(existingLearnings), now, ticket.epic_id);
      }

      // Track documentation updates applied
      const docsUpdated: DocUpdateResult[] = [];

      // Apply documentation updates if requested
      if (updateDocs) {
        for (const learning of learnings) {
          if (learning.suggestedUpdate) {
            const { file, section, content } = learning.suggestedUpdate;
            try {
              const filePath = file.startsWith("/") ? file : join(process.cwd(), file);

              // Create backup before writing
              let fileContent = "";
              if (existsSync(filePath)) {
                fileContent = readFileSync(filePath, "utf8");
              }

              // Find or create section
              const sectionMarker = `## ${section}`;
              let updated = false;

              if (fileContent.includes(sectionMarker)) {
                // Section exists, append to it
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
                // Create new section
                fileContent += `\n## ${section}\n${content}\n`;
                updated = true;
              }

              if (updated) {
                writeFileSync(filePath, fileContent, "utf8");
                docsUpdated.push({
                  file,
                  section,
                  status: "success",
                });
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              log.error(
                `Failed to update ${file}`,
                err instanceof Error ? err : new Error(errorMsg)
              );
              docsUpdated.push({
                file,
                section,
                status: "failed",
                error: errorMsg,
              });
            }
          }
        }
      }

      // Update tickets_done count in epic workflow state
      const ticketsDone = (
        db
          .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
          .get(ticket.epic_id) as CountResult
      ).count;

      db.prepare(
        `UPDATE epic_workflow_state SET tickets_done = ?, updated_at = ? WHERE epic_id = ?`
      ).run(ticketsDone, now, ticket.epic_id);

      log.info(`Reconciled learnings for ticket ${ticketId} (epic tickets done: ${ticketsDone})`);

      // Create progress comment (per spec: mandatory audit trail)
      const learningsLines = learnings.map((l) => `- [${l.type}] ${l.description}`).join("\n");
      const successfulUpdates = docsUpdated.filter((u) => u.status === "success");
      const docsSection =
        successfulUpdates.length > 0
          ? `\n\nDocumentation updated:\n${successfulUpdates.map((u) => `- ${u.file} (${u.section})`).join("\n")}`
          : "";
      const commentContent = `Learnings reconciled from ticket.\n\nLearnings recorded:\n${learningsLines}${docsSection}`;

      const commentResult = addComment(db, ticketId, commentContent, null, "progress");
      const commentWarning = commentResult.success
        ? ""
        : `\n\n**Warning:** Audit trail comment was not saved: ${commentResult.error}`;

      return {
        content: [
          {
            type: "text" as const,
            text: `Learnings reconciled successfully.\n\nLearnings stored: ${learnings.length}\nDocumentation updates: ${successfulUpdates.length}${commentWarning}`,
          },
        ],
      };
    }
  );

  // Get accumulated learnings for an epic
  server.tool(
    "get_epic_learnings",
    `Get all accumulated learnings for an epic.

Retrieves learnings from the epic's workflow state, showing which tickets
contributed each learning and when they were applied.

Args:
  epicId: Epic ID

Returns array of learnings grouped by ticket.`,
    {
      epicId: z.string().describe("Epic ID"),
    },
    async ({ epicId }: { epicId: string }) => {
      const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpic | undefined;
      if (!epic) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Epic not found: ${epicId}. Use list_epics to see available epics.`,
            },
          ],
          isError: true,
        };
      }

      const epicState = db
        .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
        .get(epicId) as DbEpicWorkflowState | undefined;

      if (!epicState) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No learnings recorded for epic: ${epic.title}`,
            },
          ],
        };
      }

      const learnings: LearningEntry[] = epicState.learnings ? JSON.parse(epicState.learnings) : [];
      const ticketsCompleted = (
        db
          .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
          .get(epicId) as CountResult
      ).count;

      const summary =
        learnings.length > 0
          ? `Epic: ${epic.title}\nTickets completed: ${ticketsCompleted}\nLearnings recorded: ${learnings.length}\n\n${learnings
              .map(
                (l) =>
                  `### ${l.ticketTitle}\n${l.learnings
                    .map((ln) => `- [${ln.type}] ${ln.description}`)
                    .join("\n")}`
              )
              .join("\n\n")}`
          : `No learnings recorded for epic: ${epic.title}`;

      return {
        content: [
          {
            type: "text" as const,
            text: summary,
          },
        ],
      };
    }
  );
}
