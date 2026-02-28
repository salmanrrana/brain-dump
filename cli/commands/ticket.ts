/**
 * Ticket commands: create, list, get, update, delete, plus MCP-parity actions.
 */

import {
  createTicket,
  listTickets,
  getTicket,
  updateTicketStatus,
  updateTicket,
  updateAcceptanceCriterion,
  deleteTicket,
  updateAttachmentMetadata,
  listTicketsByEpic,
  linkFiles,
  getTicketsForFile,
  InvalidActionError,
} from "../../core/index.ts";
import type { Priority, TicketStatus, CriterionStatus } from "../../core/index.ts";
import {
  parseFlags,
  requireFlag,
  optionalFlag,
  boolFlag,
  numericFlag,
  requireEnumFlag,
  optionalEnumFlag,
} from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = [
  "create",
  "list",
  "get",
  "update",
  "update-status",
  "update-criterion",
  "update-attachment",
  "list-by-epic",
  "link-files",
  "get-files",
  "delete",
];

const STATUSES: readonly TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
  "done",
];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "ticket",
      ACTIONS,
      "Flags:\n" +
        "  --project <id>              Project ID\n" +
        "  --ticket <id>               Ticket ID\n" +
        "  --title <text>              Ticket title\n" +
        "  --status <status>           Ticket status\n" +
        "  --priority <p>              Priority (low, medium, high)\n" +
        "  --epic <id>                 Epic ID\n" +
        "  --description <text>        Description\n" +
        "  --tags <csv>                Comma-separated tags\n" +
        "  --criterion <id>            Criterion ID\n" +
        "  --criterion-status <s>      pending|passed|failed|skipped\n" +
        "  --note <text>               Verification note\n" +
        "  --attachment <id>           Attachment ID or filename\n" +
        "  --attachment-type <type>    Attachment type\n" +
        "  --attachment-description <t> Attachment description\n" +
        "  --attachment-priority <p>   primary|supplementary\n" +
        "  --linked-criteria <csv>     Comma-separated criterion IDs\n" +
        "  --files <csv>               Comma-separated file paths\n" +
        "  --file <path>               File path (for get-files)\n" +
        "  --limit <n>                 Max results\n" +
        "  --confirm                   Confirm destructive action\n" +
        "  --pretty                    Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "create": {
        const projectId = requireFlag(flags, "project");
        const title = requireFlag(flags, "title");
        const description = optionalFlag(flags, "description");
        const priority = optionalEnumFlag<Priority>(flags, "priority", ["low", "medium", "high"]);
        const epicId = optionalFlag(flags, "epic");
        const tagsStr = optionalFlag(flags, "tags");
        const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()) : undefined;

        const result = createTicket(db, { projectId, title, description, priority, epicId, tags });
        outputResult(result, pretty);
        break;
      }

      case "list": {
        const projectId = optionalFlag(flags, "project");
        const status = optionalEnumFlag<TicketStatus>(flags, "status", STATUSES);
        const limit = numericFlag(flags, "limit");

        const result = listTickets(db, { projectId, status, limit });
        outputResult(result, pretty);
        break;
      }

      case "get": {
        const ticketId = requireFlag(flags, "ticket");
        const result = getTicket(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "update": {
        const ticketId = requireFlag(flags, "ticket");
        const title = optionalFlag(flags, "title");
        const description = optionalFlag(flags, "description");
        const status = optionalEnumFlag<TicketStatus>(flags, "status", STATUSES);
        const priority = optionalEnumFlag<Priority>(flags, "priority", ["low", "medium", "high"]);
        const epicId = optionalFlag(flags, "epic");
        const tagsStr = optionalFlag(flags, "tags");
        const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()) : undefined;

        // If only status is given, use the simpler updateTicketStatus (backward compat)
        if (status && !title && !description && !priority && !epicId && !tags) {
          const result = updateTicketStatus(db, ticketId, status);
          outputResult(result, pretty);
        } else {
          const result = updateTicket(db, ticketId, {
            title,
            description,
            status,
            priority,
            epicId,
            tags,
          });
          outputResult(result, pretty);
        }
        break;
      }

      case "update-status": {
        const ticketId = requireFlag(flags, "ticket");
        const status = requireEnumFlag<TicketStatus>(flags, "status", STATUSES);
        const result = updateTicketStatus(db, ticketId, status);
        outputResult(result, pretty);
        break;
      }

      case "update-criterion": {
        const ticketId = requireFlag(flags, "ticket");
        const criterionId = requireFlag(flags, "criterion");
        const criterionStatus = requireEnumFlag<CriterionStatus>(flags, "criterion-status", [
          "pending",
          "passed",
          "failed",
          "skipped",
        ]);
        const note = optionalFlag(flags, "note");
        const result = updateAcceptanceCriterion(db, ticketId, criterionId, criterionStatus, note);
        outputResult(result, pretty);
        break;
      }

      case "update-attachment": {
        const ticketId = requireFlag(flags, "ticket");
        const attachmentId = requireFlag(flags, "attachment");
        const type = optionalFlag(flags, "attachment-type");
        const description = optionalFlag(flags, "attachment-description");
        const priority = optionalFlag(flags, "attachment-priority");
        const linkedCriteriaStr = optionalFlag(flags, "linked-criteria");
        const linkedCriteria = linkedCriteriaStr
          ? linkedCriteriaStr.split(",").map((c) => c.trim())
          : undefined;
        const result = updateAttachmentMetadata(db, ticketId, attachmentId, {
          type,
          description,
          priority,
          linkedCriteria,
        });
        outputResult(result, pretty);
        break;
      }

      case "list-by-epic": {
        const epicId = requireFlag(flags, "epic");
        const projectId = optionalFlag(flags, "project");
        const status = optionalEnumFlag<TicketStatus>(flags, "status", STATUSES);
        const limit = numericFlag(flags, "limit");
        const result = listTicketsByEpic(db, { epicId, projectId, status, limit });
        outputResult(result, pretty);
        break;
      }

      case "link-files": {
        const ticketId = requireFlag(flags, "ticket");
        const filesStr = requireFlag(flags, "files");
        const fileList = filesStr.split(",").map((f) => f.trim());
        const result = linkFiles(db, ticketId, fileList);
        outputResult(result, pretty);
        break;
      }

      case "get-files": {
        const filePath = requireFlag(flags, "file");
        const projectId = optionalFlag(flags, "project");
        const result = getTicketsForFile(db, filePath, projectId);
        outputResult(result, pretty);
        break;
      }

      case "delete": {
        const ticketId = requireFlag(flags, "ticket");
        const confirmed = boolFlag(flags, "confirm");
        const result = deleteTicket(db, ticketId, confirmed);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("ticket", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
