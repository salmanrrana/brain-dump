/**
 * File linking commands: link, get-tickets.
 */

import { linkFiles, getTicketsForFile, InvalidActionError } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["link", "get-tickets"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("files");
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "link": {
        const ticketId = requireFlag(flags, "ticket");
        const filesStr = requireFlag(flags, "files");
        const files = filesStr.split(",").map((f) => f.trim());
        const result = linkFiles(db, ticketId, files);
        outputResult(result, pretty);
        break;
      }

      case "get-tickets": {
        const filePath = requireFlag(flags, "file");
        const projectId = optionalFlag(flags, "project");
        const result = getTicketsForFile(db, filePath, projectId);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("files", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
