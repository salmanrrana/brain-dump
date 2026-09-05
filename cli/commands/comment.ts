/**
 * Comment commands: add, list.
 */

import {
  addComment,
  listComments,
  resolveCommentAuthor,
  resolveCommentIdentity,
  InvalidActionError,
} from "../../core/index.ts";
import type { CommentAuthor, CommentType } from "../../core/index.ts";
import { parseFlags, requireFlag, boolFlag, optionalEnumFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["add", "list"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("comment");
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "add": {
        const ticketId = requireFlag(flags, "ticket");
        const content = requireFlag(flags, "content");
        const type = optionalEnumFlag<CommentType>(flags, "type", [
          "comment",
          "work_summary",
          "test_report",
          "progress",
        ]);
        const author = optionalEnumFlag<CommentAuthor>(flags, "author", [
          "claude",
          "ralph",
          "user",
          "opencode",
          "cursor",
          "vscode",
          "copilot",
          "codex",
          "pi",
          "cursor-agent",
          "brain-dump",
          "ai",
        ]);
        const resolvedAuthor =
          author ??
          resolveCommentAuthor(
            process.env.BRAIN_DUMP_PROVIDER ?? "",
            process.env.RALPH_SESSION === "1"
          );
        const implementationIdentity =
          type === "work_summary" || type === "test_report"
            ? resolveCommentIdentity({
                phase: "implementation",
                actorKind: "ai",
                role: "implementation",
                author: resolvedAuthor,
              })
            : null;
        const result = addComment(db, {
          ticketId,
          content,
          type,
          author: resolvedAuthor,
          ...(implementationIdentity ?? {}),
        });
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
