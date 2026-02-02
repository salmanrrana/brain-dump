/**
 * Comment commands: add, list.
 */

import { addComment, listComments, InvalidActionError } from "../../core/index.ts";
import type { CommentAuthor, CommentType } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["add", "list"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "comment",
      ACTIONS,
      "Flags:\n  --ticket <id>      Ticket ID\n  --content <text>   Comment content\n  --type <type>      comment|work_summary|test_report|progress\n  --author <who>     claude|ralph|user|opencode|cursor|vscode|ai\n  --pretty           Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "add": {
        const ticketId = requireFlag(flags, "ticket");
        const content = requireFlag(flags, "content");
        const type = optionalFlag(flags, "type") as CommentType | undefined;
        const author = optionalFlag(flags, "author") as CommentAuthor | undefined;
        const result = addComment(db, { ticketId, content, type, author });
        outputResult(result, pretty);
        break;
      }

      case "list": {
        const ticketId = requireFlag(flags, "ticket");
        const result = listComments(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("comment", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
