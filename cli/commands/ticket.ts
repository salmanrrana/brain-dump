/**
 * Ticket commands: create, list, get, update, delete.
 */

import {
  createTicket,
  listTickets,
  getTicket,
  updateTicketStatus,
  deleteTicket,
  InvalidActionError,
} from "../../core/index.ts";
import type { Priority, TicketStatus } from "../../core/index.ts";
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

const ACTIONS = ["create", "list", "get", "update", "delete"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "ticket",
      ACTIONS,
      "Flags:\n  --project <id>     Project ID\n  --ticket <id>      Ticket ID\n  --title <text>     Ticket title\n  --status <status>  Ticket status\n  --priority <p>     Priority (low, medium, high)\n  --epic <id>        Epic ID\n  --description <t>  Description\n  --tags <csv>       Comma-separated tags\n  --limit <n>        Max results\n  --confirm          Confirm destructive action\n  --pretty           Human-readable output"
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
        const status = optionalEnumFlag<TicketStatus>(flags, "status", [
          "backlog",
          "ready",
          "in_progress",
          "ai_review",
          "human_review",
          "done",
        ]);
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
        const status = requireEnumFlag<TicketStatus>(flags, "status", [
          "backlog",
          "ready",
          "in_progress",
          "ai_review",
          "human_review",
          "done",
        ]);
        const result = updateTicketStatus(db, ticketId, status);
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
