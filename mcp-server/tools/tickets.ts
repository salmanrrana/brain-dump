/**
 * Ticket management tools for Brain Dump MCP server.
 *
 * These are thin wrappers around core/ticket.ts functions.
 * Business logic lives in the core layer; this file only handles
 * MCP protocol formatting and Zod input schemas.
 *
 * @module tools/tickets
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CoreError } from "../../core/errors.ts";
import {
  createTicket,
  listTickets,
  getTicket,
  updateTicketStatus,
  updateAcceptanceCriterion,
  deleteTicket,
  updateAttachmentMetadata,
  listTicketsByEpic,
} from "../../core/ticket.ts";
import type { TicketStatus, Priority } from "../../core/types.ts";
import type { CriterionStatus } from "../../core/ticket.ts";

const STATUSES = ["backlog", "ready", "in_progress", "ai_review", "human_review", "done"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

/** Valid attachment types for AI context */
const ATTACHMENT_TYPES = [
  "mockup",
  "wireframe",
  "bug-screenshot",
  "expected-behavior",
  "actual-behavior",
  "diagram",
  "error-message",
  "console-log",
  "reference",
  "asset",
] as const;

/** Valid attachment priorities */
const ATTACHMENT_PRIORITIES = ["primary", "supplementary"] as const;

/** Convert a CoreError into an MCP error response. */
function mcpError(err: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
  const msg =
    err instanceof CoreError ? err.message : err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: msg }],
    isError: true,
  };
}

/**
 * Register ticket management tools with the MCP server.
 */
export function registerTicketTools(server: McpServer, db: Database.Database): void {
  // Create ticket
  server.tool(
    "create_ticket",
    `Create a new ticket in Brain Dump.

The ticket will be added to the Backlog column.
First use find_project_by_path or list_projects to get the projectId.

Args:
  projectId: ID of the project (use list_projects to find)
  title: Short, descriptive title for the ticket
  description: Optional detailed description (supports markdown)
  priority: Optional priority level (low, medium, high)
  epicId: Optional epic ID to group the ticket
  tags: Optional array of tags for categorization

Returns the created ticket with its generated ID.`,
    {
      projectId: z.string().describe("Project ID (from list_projects or find_project_by_path)"),
      title: z.string().describe("Ticket title - short, descriptive summary"),
      description: z.string().optional().describe("Detailed description (markdown supported)"),
      priority: z.enum(PRIORITIES).optional().describe("Priority level"),
      epicId: z.string().optional().describe("Epic ID to associate with"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async ({
      projectId,
      title,
      description,
      priority,
      epicId,
      tags,
    }: {
      projectId: string;
      title: string;
      description?: string | undefined;
      priority?: "low" | "medium" | "high" | undefined;
      epicId?: string | undefined;
      tags?: string[] | undefined;
    }) => {
      try {
        const ticket = createTicket(db, {
          projectId,
          title,
          description,
          priority: priority as Priority | undefined,
          epicId,
          tags,
        });

        log.info(`Created ticket: ${title} in project ${ticket.project.name}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket created in "${ticket.project.name}"!\n\n${JSON.stringify(ticket)}`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to create ticket "${title}": ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );

  // List tickets
  server.tool(
    "list_tickets",
    `List tickets with optional filters.

Args:
  projectId: Optional - filter by project
  status: Optional - filter by status (backlog, ready, in_progress, ai_review, human_review, done)
  limit: Optional - max tickets to return (default: 20)

Returns array of tickets sorted by creation date (newest first).`,
    {
      projectId: z.string().optional().describe("Filter by project ID"),
      status: z.enum(STATUSES).optional().describe("Filter by status"),
      limit: z.number().optional().describe("Max tickets to return (default: 20)"),
    },
    async ({
      projectId,
      status,
      limit,
    }: {
      projectId?: string | undefined;
      status?: string | undefined;
      limit?: number | undefined;
    }) => {
      const tickets = listTickets(db, {
        projectId,
        status: status as TicketStatus | undefined,
        limit,
      });

      return {
        content: [
          {
            type: "text" as const,
            text:
              tickets.length > 0
                ? JSON.stringify(tickets)
                : "No tickets found matching the criteria.",
          },
        ],
      };
    }
  );

  // Update ticket status
  server.tool(
    "update_ticket_status",
    `Update a ticket's status.

Status flow: backlog -> ready -> in_progress -> ai_review -> human_review -> done

Args:
  ticketId: The ticket ID to update
  status: New status value

Returns the updated ticket.`,
    {
      ticketId: z.string().describe("Ticket ID to update"),
      status: z.enum(STATUSES).describe("New status"),
    },
    async ({ ticketId, status }: { ticketId: string; status: string }) => {
      try {
        const oldTicket = getTicket(db, ticketId);
        const oldStatus = oldTicket.status;
        const updated = updateTicketStatus(db, ticketId, status as TicketStatus);
        log.info(`Updated ticket ${ticketId} status: ${oldStatus} -> ${status}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Ticket status updated: ${oldStatus} -> ${status}\n\n${JSON.stringify(updated)}`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  // Update acceptance criterion status
  server.tool(
    "update_acceptance_criterion",
    `Update an acceptance criterion's status within a ticket.

Use this to mark criteria as passed, failed, pending, or skipped.
AI agents should call this to verify acceptance criteria during implementation.

Args:
  ticketId: The ticket ID containing the criterion
  criterionId: The criterion ID to update
  status: New status (pending, passed, failed, skipped)
  verificationNote: Optional note explaining how the criterion was verified

Returns the updated ticket with all acceptance criteria.`,
    {
      ticketId: z.string().describe("Ticket ID containing the criterion"),
      criterionId: z.string().describe("Criterion ID to update"),
      status: z.enum(["pending", "passed", "failed", "skipped"]).describe("New status"),
      verificationNote: z.string().optional().describe("How the criterion was verified"),
    },
    async ({
      ticketId,
      criterionId,
      status,
      verificationNote,
    }: {
      ticketId: string;
      criterionId: string;
      status: string;
      verificationNote?: string | undefined;
    }) => {
      try {
        const result = updateAcceptanceCriterion(
          db,
          ticketId,
          criterionId,
          status as CriterionStatus,
          verificationNote
        );

        const statusChange =
          result.previousStatus === result.newStatus
            ? `(no change - already ${status})`
            : `${result.previousStatus} → ${result.newStatus}`;

        log.info(`Updated criterion ${criterionId} in ticket ${ticketId}: ${statusChange}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Criterion updated: "${result.criterionText}"\nStatus: ${statusChange}${verificationNote ? `\nNote: ${verificationNote}` : ""}\n\n${JSON.stringify(result.ticket)}`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  // Legacy support: update_ticket_subtask (deprecated)
  server.tool(
    "update_ticket_subtask",
    `[DEPRECATED] Use update_acceptance_criterion instead.

Update a subtask's completion status within a ticket.
This tool is deprecated and will be removed in a future version.`,
    {
      ticketId: z.string().describe("Ticket ID containing the subtask"),
      subtaskId: z.string().describe("Subtask ID to update"),
      completed: z.boolean().describe("Whether the subtask is completed"),
    },
    async ({
      ticketId,
      subtaskId,
      completed,
    }: {
      ticketId: string;
      subtaskId: string;
      completed: boolean;
    }) => {
      try {
        const status: CriterionStatus = completed ? "passed" : "pending";
        const result = updateAcceptanceCriterion(db, ticketId, subtaskId, status);

        log.info(`[DEPRECATED] Updated subtask ${subtaskId} via legacy API`);

        return {
          content: [
            {
              type: "text" as const,
              text: `⚠️ DEPRECATED: Use update_acceptance_criterion instead.\n\nSubtask updated.\n\n${JSON.stringify(result.ticket)}`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  // Delete ticket
  server.tool(
    "delete_ticket",
    `Delete a ticket and all its associated comments.

**Safety feature:** By default, this performs a DRY RUN showing what would be deleted.
Set confirm=true to actually delete the ticket.

Args:
  ticketId: The ticket ID to delete
  confirm: Set to true to actually delete (default: false, dry run only)

Returns:
  - If confirm=false: Preview of the ticket and comments that would be deleted
  - If confirm=true: Confirmation of deletion`,
    {
      ticketId: z.string().describe("Ticket ID to delete"),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set to true to actually delete (default: false, dry run)"),
    },
    async ({ ticketId, confirm }: { ticketId: string; confirm?: boolean }) => {
      try {
        const result = deleteTicket(db, ticketId, confirm ?? false);

        if (result.dryRun) {
          return {
            content: [
              {
                type: "text" as const,
                text: `⚠️  DRY RUN - Delete Ticket Preview\n${"─".repeat(50)}\n\nTicket: "${result.wouldDelete.title}"\nID: ${result.wouldDelete.id}\nComments: ${result.wouldDelete.childCount}\n\n${result.warning}`,
              },
            ],
          };
        }

        log.info(
          `Deleted ticket: ${result.deleted.title} (${result.deleted.childrenDeleted} comments)`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Ticket "${result.deleted.title}" deleted successfully.\n\nDeleted ${result.deleted.childrenDeleted} comment(s).`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  // Update attachment metadata
  server.tool(
    "update_attachment_metadata",
    `Update metadata for a ticket attachment.

Use this to add context about an attachment's purpose (mockup, bug screenshot, etc.).
This helps AI understand how to interpret and act on the attachment.

Args:
  ticketId: The ticket ID containing the attachment
  attachmentId: The attachment ID to update (or filename for legacy attachments)
  metadata: Object with fields to update:
    - type: Attachment type (mockup, wireframe, bug-screenshot, expected-behavior, actual-behavior, diagram, error-message, console-log, reference, asset)
    - description: Human-provided context about the attachment
    - priority: Importance level (primary, supplementary)
    - linkedCriteria: Array of acceptance criteria IDs to link

Returns the updated attachment.`,
    {
      ticketId: z.string().describe("Ticket ID containing the attachment"),
      attachmentId: z.string().describe("Attachment ID or filename to update"),
      metadata: z
        .object({
          type: z.enum(ATTACHMENT_TYPES).optional().describe("Attachment type"),
          description: z.string().optional().describe("Human-provided context"),
          priority: z.enum(ATTACHMENT_PRIORITIES).optional().describe("Importance level"),
          linkedCriteria: z.array(z.string()).optional().describe("Linked acceptance criteria IDs"),
        })
        .describe("Metadata fields to update"),
    },
    async ({
      ticketId,
      attachmentId,
      metadata,
    }: {
      ticketId: string;
      attachmentId: string;
      metadata: {
        type?: string | undefined;
        description?: string | undefined;
        priority?: string | undefined;
        linkedCriteria?: string[] | undefined;
      };
    }) => {
      try {
        const result = updateAttachmentMetadata(db, ticketId, attachmentId, metadata);

        log.info(
          `Updated attachment metadata for ${attachmentId} in ticket ${ticketId} (type=${result.attachment.type}, priority=${result.attachment.priority})`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Attachment metadata updated:\n\n${JSON.stringify(result.attachment)}`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  // List tickets by epic
  server.tool(
    "list_tickets_by_epic",
    `List all tickets in a specific epic.

This is a convenience tool for searching tickets within an epic without having to query all tickets and filter.

Args:
  epicId: ID of the epic to search
  projectId: Optional - filter by project (if epic tickets span multiple projects)
  status: Optional - filter by status (backlog, ready, in_progress, ai_review, human_review, done)
  limit: Optional - max tickets to return (default: 100)

Returns array of tickets in the epic, sorted by position.`,
    {
      epicId: z.string().describe("Epic ID to search"),
      projectId: z.string().optional().describe("Filter by project ID"),
      status: z.enum(STATUSES).optional().describe("Filter by status"),
      limit: z.number().optional().describe("Max tickets to return (default: 100)"),
    },
    async ({
      epicId,
      projectId,
      status,
      limit,
    }: {
      epicId: string;
      projectId?: string | undefined;
      status?: string | undefined;
      limit?: number | undefined;
    }) => {
      try {
        const tickets = listTicketsByEpic(db, {
          epicId,
          projectId,
          status: status as TicketStatus | undefined,
          limit,
        });

        if (tickets.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No tickets found in the epic${status ? ` with status "${status}"` : ""}.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${tickets.length} ticket(s) in epic\n\n${JSON.stringify(tickets)}`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
