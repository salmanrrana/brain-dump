/**
 * Epic commands: create, list, update, delete, reconcile-learnings, get-learnings.
 */

import { readFileSync } from "fs";
import {
  createEpic,
  listEpics,
  updateEpic,
  deleteEpic,
  reconcileLearnings,
  getEpicLearnings,
  InvalidActionError,
  ValidationError,
} from "../../core/index.ts";
import type { Learning } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["create", "list", "update", "delete", "reconcile-learnings", "get-learnings"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "epic",
      ACTIONS,
      "Flags:\n  --project <id>          Project ID\n  --epic <id>             Epic ID\n  --ticket <id>           Ticket ID (for reconcile-learnings)\n  --title <text>          Epic title\n  --description <t>       Description\n  --color <hex>           Color (e.g. #3b82f6)\n  --learnings-file <path> JSON file with learning objects\n  --update-docs           Apply suggested doc updates\n  --confirm               Confirm destructive action\n  --pretty                Human-readable output"
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
        const color = optionalFlag(flags, "color");
        const result = createEpic(db, { projectId, title, description, color });
        outputResult(result, pretty);
        break;
      }

      case "list": {
        const projectId = requireFlag(flags, "project");
        const result = listEpics(db, projectId);
        outputResult(result, pretty);
        break;
      }

      case "update": {
        const epicId = requireFlag(flags, "epic");
        const title = optionalFlag(flags, "title");
        const description = optionalFlag(flags, "description");
        const color = optionalFlag(flags, "color");
        const result = updateEpic(db, epicId, { title, description, color });
        outputResult(result, pretty);
        break;
      }

      case "delete": {
        const epicId = requireFlag(flags, "epic");
        const confirmed = boolFlag(flags, "confirm");
        const result = deleteEpic(db, epicId, confirmed);
        outputResult(result, pretty);
        break;
      }

      case "reconcile-learnings": {
        const ticketId = requireFlag(flags, "ticket");
        const learningsFile = requireFlag(flags, "learnings-file");
        const updateDocs = boolFlag(flags, "update-docs");

        let learnings: Learning[];
        try {
          const raw = readFileSync(learningsFile, "utf-8");
          learnings = JSON.parse(raw) as Learning[];
          if (!Array.isArray(learnings)) {
            throw new ValidationError(
              `Expected JSON array in ${learningsFile}, got ${typeof learnings}`
            );
          }
        } catch (e) {
          if (e instanceof ValidationError) throw e;
          throw new ValidationError(
            `Failed to read/parse learnings file: ${learningsFile}\n${e instanceof Error ? e.message : String(e)}`
          );
        }

        const result = reconcileLearnings(db, ticketId, learnings, updateDocs);
        outputResult(result, pretty);
        break;
      }

      case "get-learnings": {
        const epicId = requireFlag(flags, "epic");
        const result = getEpicLearnings(db, epicId);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("epic", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
