/**
 * Consolidated ticket resource tool for Brain Dump MCP server.
 *
 * Merges 8 individual ticket tools into 1 action-dispatched tool.
 * Drops deprecated update_ticket_subtask.
 * Business logic lives in core/ticket.ts.
 *
 * @module tools/ticket
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
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

const ACTIONS = [
  "create",
  "list",
  "get",
  "update-status",
  "delete",
  "update-criterion",
  "update-attachment",
  "list-by-epic",
] as const;

const STATUSES = ["backlog", "ready", "in_progress", "ai_review", "human_review", "done"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;
const CRITERION_STATUSES = ["pending", "passed", "failed", "skipped"] as const;
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
const ATTACHMENT_PRIORITIES = ["primary", "supplementary"] as const;

/**
 * Register the consolidated ticket tool with the MCP server.
 */
export function registerTicketTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "ticket",
    `Manage tickets in Brain Dump. Use the 'action' parameter to specify the operation.

## Actions

### create
Create a new ticket (added to Backlog). Use project action 'list' or 'find-by-path' first to get projectId.
Required params: projectId, title
Optional params: description, priority, epicId, tags

### list
List tickets with optional filters, sorted by creation date (newest first).
Optional params: projectId, status, limit

### get
Get a single ticket by ID with full details.
Required params: ticketId

### update-status
Update a ticket's status. Flow: backlog -> ready -> in_progress -> ai_review -> human_review -> done
Required params: ticketId, status

### delete
Delete a ticket and comments. DRY RUN by default; set confirm=true to delete.
Required params: ticketId
Optional params: confirm

### update-criterion
Update an acceptance criterion's status (passed, failed, pending, skipped).
Required params: ticketId, criterionId, criterionStatus
Optional params: verificationNote

### update-attachment
Update metadata for a ticket attachment (type, description, priority, linkedCriteria).
Required params: ticketId, attachmentId, attachmentType
Optional params: attachmentDescription, attachmentPriority, linkedCriteria

### list-by-epic
List all tickets in a specific epic, sorted by position.
Required params: epicId
Optional params: projectId, status, limit

## Parameters
- action: (required) The operation to perform
- ticketId: Ticket ID. Required for: get, update-status, delete, update-criterion, update-attachment
- projectId: Project ID. Required for: create. Optional for: list, list-by-epic
- title: Ticket title. Required for: create
- description: Detailed description (markdown). Optional for: create
- priority: Priority level (low, medium, high). Optional for: create
- epicId: Epic ID. Required for: list-by-epic. Optional for: create
- tags: Array of tags. Optional for: create
- status: Ticket status. Required for: update-status. Optional filter for: list, list-by-epic
- limit: Max results. Optional for: list, list-by-epic
- confirm: Confirm deletion. Optional for: delete
- criterionId: Criterion ID. Required for: update-criterion
- criterionStatus: Criterion status (pending, passed, failed, skipped). Required for: update-criterion
- verificationNote: How criterion was verified. Optional for: update-criterion
- attachmentId: Attachment ID or filename. Required for: update-attachment
- attachmentType: Attachment type. Optional for: update-attachment
- attachmentDescription: Human context. Optional for: update-attachment
- attachmentPriority: Importance (primary, supplementary). Optional for: update-attachment
- linkedCriteria: Linked criterion IDs. Optional for: update-attachment`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      ticketId: z.string().optional().describe("Ticket ID"),
      projectId: z.string().optional().describe("Project ID"),
      title: z.string().optional().describe("Ticket title"),
      description: z.string().optional().describe("Detailed description (markdown)"),
      priority: z.enum(PRIORITIES).optional().describe("Priority level"),
      epicId: z.string().optional().describe("Epic ID"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      status: z.enum(STATUSES).optional().describe("Ticket status"),
      limit: z.number().optional().describe("Max results to return"),
      confirm: z.boolean().optional().describe("Confirm deletion"),
      criterionId: z.string().optional().describe("Criterion ID"),
      criterionStatus: z.enum(CRITERION_STATUSES).optional().describe("Criterion status"),
      verificationNote: z.string().optional().describe("How criterion was verified"),
      attachmentId: z.string().optional().describe("Attachment ID or filename"),
      attachmentType: z.enum(ATTACHMENT_TYPES).optional().describe("Attachment type"),
      attachmentDescription: z.string().optional().describe("Human context for attachment"),
      attachmentPriority: z
        .enum(ATTACHMENT_PRIORITIES)
        .optional()
        .describe("Attachment importance"),
      linkedCriteria: z.array(z.string()).optional().describe("Linked criterion IDs"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      ticketId?: string | undefined;
      projectId?: string | undefined;
      title?: string | undefined;
      description?: string | undefined;
      priority?: (typeof PRIORITIES)[number] | undefined;
      epicId?: string | undefined;
      tags?: string[] | undefined;
      status?: (typeof STATUSES)[number] | undefined;
      limit?: number | undefined;
      confirm?: boolean | undefined;
      criterionId?: string | undefined;
      criterionStatus?: (typeof CRITERION_STATUSES)[number] | undefined;
      verificationNote?: string | undefined;
      attachmentId?: string | undefined;
      attachmentType?: (typeof ATTACHMENT_TYPES)[number] | undefined;
      attachmentDescription?: string | undefined;
      attachmentPriority?: (typeof ATTACHMENT_PRIORITIES)[number] | undefined;
      linkedCriteria?: string[] | undefined;
    }) => {
      try {
        switch (params.action) {
          case "create": {
            const projectId = requireParam(params.projectId, "projectId", "create");
            const title = requireParam(params.title, "title", "create");
            const ticket = createTicket(db, {
              projectId,
              title,
              description: params.description,
              priority: params.priority as Priority | undefined,
              epicId: params.epicId,
              tags: params.tags,
            });
            log.info(`Created ticket: ${title} in project ${ticket.project.name}`);
            return formatResult(ticket, `Ticket created in "${ticket.project.name}"!`);
          }

          case "list": {
            const tickets = listTickets(db, {
              projectId: params.projectId,
              status: params.status as TicketStatus | undefined,
              limit: params.limit,
            });
            if (tickets.length === 0) {
              return formatEmpty("tickets", { projectId: params.projectId, status: params.status });
            }
            return formatResult(tickets);
          }

          case "get": {
            const ticketId = requireParam(params.ticketId, "ticketId", "get");
            const ticket = getTicket(db, ticketId);
            return formatResult(ticket);
          }

          case "update-status": {
            const ticketId = requireParam(params.ticketId, "ticketId", "update-status");
            const status = requireParam(params.status, "status", "update-status");
            const oldTicket = getTicket(db, ticketId);
            const oldStatus = oldTicket.status;
            const updated = updateTicketStatus(db, ticketId, status as TicketStatus);
            log.info(`Updated ticket ${ticketId} status: ${oldStatus} -> ${status}`);
            return formatResult(updated, `Ticket status updated: ${oldStatus} -> ${status}`);
          }

          case "delete": {
            const ticketId = requireParam(params.ticketId, "ticketId", "delete");
            const result = deleteTicket(db, ticketId, params.confirm ?? false);

            if (result.dryRun) {
              return formatResult(
                `DRY RUN - Delete Ticket Preview\n${"─".repeat(50)}\n\nTicket: "${result.wouldDelete.title}"\nID: ${result.wouldDelete.id}\nComments: ${result.wouldDelete.childCount}\n\n${result.warning}`
              );
            }

            log.info(
              `Deleted ticket: ${result.deleted.title} (${result.deleted.childrenDeleted} comments)`
            );
            return formatResult(
              `Ticket "${result.deleted.title}" deleted successfully.\nDeleted ${result.deleted.childrenDeleted} comment(s).`
            );
          }

          case "update-criterion": {
            const ticketId = requireParam(params.ticketId, "ticketId", "update-criterion");
            const criterionId = requireParam(params.criterionId, "criterionId", "update-criterion");
            const criterionStatus = requireParam(
              params.criterionStatus,
              "criterionStatus",
              "update-criterion"
            );

            const result = updateAcceptanceCriterion(
              db,
              ticketId,
              criterionId,
              criterionStatus as CriterionStatus,
              params.verificationNote
            );

            const statusChange =
              result.previousStatus === result.newStatus
                ? `(no change - already ${criterionStatus})`
                : `${result.previousStatus} -> ${result.newStatus}`;

            log.info(`Updated criterion ${criterionId} in ticket ${ticketId}: ${statusChange}`);
            return formatResult(
              result.ticket,
              `Criterion updated: "${result.criterionText}"\nStatus: ${statusChange}${params.verificationNote ? `\nNote: ${params.verificationNote}` : ""}`
            );
          }

          case "update-attachment": {
            const ticketId = requireParam(params.ticketId, "ticketId", "update-attachment");
            const attachmentId = requireParam(
              params.attachmentId,
              "attachmentId",
              "update-attachment"
            );

            const metadata: Record<string, unknown> = {};
            if (params.attachmentType) metadata.type = params.attachmentType;
            if (params.attachmentDescription) metadata.description = params.attachmentDescription;
            if (params.attachmentPriority) metadata.priority = params.attachmentPriority;
            if (params.linkedCriteria) metadata.linkedCriteria = params.linkedCriteria;

            const result = updateAttachmentMetadata(db, ticketId, attachmentId, metadata);
            log.info(`Updated attachment metadata for ${attachmentId} in ticket ${ticketId}`);
            return formatResult(result.attachment, "Attachment metadata updated:");
          }

          case "list-by-epic": {
            const epicId = requireParam(params.epicId, "epicId", "list-by-epic");
            const tickets = listTicketsByEpic(db, {
              epicId,
              projectId: params.projectId,
              status: params.status as TicketStatus | undefined,
              limit: params.limit,
            });

            if (tickets.length === 0) {
              return formatEmpty("tickets in epic", { status: params.status });
            }
            return formatResult(tickets, `Found ${tickets.length} ticket(s) in epic`);
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`ticket/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
