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

  if (!action || action === "--help" || action === "help") {
    showResourceHelp("verify");
    return;
  }

  try {
    const { db } = getDb();
    const ticketId = requireFlag(flags, "ticket");
    if (history) {
      const result = listVerificationRuns(db, ticketId);
      outputResult(result, pretty);
      return;
    }

    const baseUrl = optionalFlag(flags, "base-url");
    const provider = optionalFlag(flags, "provider");
    const result = await verifyTicket(db, {
      ticketId,
      ...(provider !== undefined ? { provider } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      execFileNoThrow,
    });
    outputResult(result, pretty);
    if (
      result.status !== "passed" ||
      result.epicAutoPr?.branchResults.some((branch) => !branch.success)
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    outputError(error);
  }
}
