/**
 * Git commands: link-commit, link-pr, sync.
 */

import {
  linkCommit,
  linkPr,
  syncTicketLinks,
  InvalidActionError,
  ValidationError,
} from "../../core/index.ts";
import type { PrStatus } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["link-commit", "link-pr", "sync"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "git",
      ACTIONS,
      "Flags:\n  --ticket <id>        Ticket ID\n  --hash <hash>        Git commit hash\n  --message <msg>      Commit message\n  --pr <number>        PR number\n  --url <url>          PR URL\n  --status <status>    draft|open|merged|closed\n  --project-path <p>   Project path (for sync)\n  --pretty             Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "link-commit": {
        const ticketId = requireFlag(flags, "ticket");
        const hash = requireFlag(flags, "hash");
        const message = optionalFlag(flags, "message");
        const result = linkCommit(db, ticketId, hash, message);
        outputResult(result, pretty);
        break;
      }

      case "link-pr": {
        const ticketId = requireFlag(flags, "ticket");
        const prNum = numericFlag(flags, "pr");
        if (prNum === undefined) {
          throw new ValidationError("Missing required flag: --pr");
        }
        const url = optionalFlag(flags, "url");
        const prStatus = optionalFlag(flags, "status") as PrStatus | undefined;
        const result = linkPr(db, ticketId, prNum, url, prStatus);
        outputResult(result, pretty);
        break;
      }

      case "sync": {
        const projectPath = optionalFlag(flags, "project-path");
        const result = syncTicketLinks(db, projectPath);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("git", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
