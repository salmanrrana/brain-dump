/**
 * Verification runner commands.
 */

import { boolFlag, optionalFlag, parseFlags, requireFlag } from "../lib/args.ts";
import { getDb } from "../lib/db.ts";
import { outputError, outputResult, showResourceHelp } from "../lib/output.ts";
import { execFileNoThrow, listVerificationRuns, verifyTicket } from "../../core/index.ts";

export async function handle(action: string, args: string[]): Promise<void> {
  const normalizedArgs = action.startsWith("--") ? [action, ...args] : args;
  const flags = parseFlags(normalizedArgs);
  const pretty = boolFlag(flags, "pretty");
  const history = boolFlag(flags, "history") || action === "history";
  const { db } = getDb();

  if (!action || action === "--help" || action === "help") {
    showResourceHelp("verify");
  }

  try {
    const ticketId = requireFlag(flags, "ticket");
    if (history) {
      const result = listVerificationRuns(db, ticketId);
      outputResult(result, pretty);
      return;
    }

    const baseUrl = optionalFlag(flags, "base-url");
    const result = await verifyTicket(db, {
      ticketId,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      execFileNoThrow,
    });
    outputResult(result, pretty);
    if (result.status !== "passed") {
      process.exitCode = 1;
    }
  } catch (error) {
    outputError(error);
  }
}
