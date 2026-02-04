/**
 * Workflow commands: start-work, complete-work, start-epic.
 */

import {
  startWork,
  completeWork,
  startEpicWork,
  createRealGitOperations,
  InvalidActionError,
} from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["start-work", "complete-work", "start-epic"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "workflow",
      ACTIONS,
      "Flags:\n  --ticket <id>      Ticket ID\n  --epic <id>        Epic ID\n  --summary <text>   Work summary (for complete-work)\n  --create-pr        Create draft PR (for start-epic)\n  --pretty           Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();
  const git = createRealGitOperations();

  try {
    switch (action) {
      case "start-work": {
        const ticketId = requireFlag(flags, "ticket");
        const result = startWork(db, ticketId, git);
        outputResult(result, pretty);
        break;
      }

      case "complete-work": {
        const ticketId = requireFlag(flags, "ticket");
        const summary = optionalFlag(flags, "summary");
        const result = completeWork(db, ticketId, git, summary);
        outputResult(result, pretty);
        break;
      }

      case "start-epic": {
        const epicId = requireFlag(flags, "epic");
        const result = startEpicWork(db, epicId, git);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("workflow", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
