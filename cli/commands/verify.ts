/**
 * Verification runner commands.
 */

import { boolFlag, optionalFlag, parseFlags, requireFlag } from "../lib/args.ts";
import { getDb } from "../lib/db.ts";
import { outputError, outputResult, showResourceHelp } from "../lib/output.ts";
import {
  drainVerificationQueue,
  execFileNoThrow,
  getVerificationWorkerQueueStatus,
  InvalidActionError,
  getVerificationJob,
  listVerificationRuns,
  runNextVerificationJob,
  verifyTicket,
} from "../../core/index.ts";

const ACTIONS = ["run", "history", "status", "worker", "worker-status"];

export async function handle(action: string, args: string[]): Promise<void> {
  const normalizedArgs = action.startsWith("--") ? [action, ...args] : args;
  const flags = parseFlags(normalizedArgs);
  const pretty = boolFlag(flags, "pretty");
  const isFlagShortcut = action.startsWith("--");
  const isHistoryAction = action === "history";
  const isStatusAction = action === "status";
  const isWorkerAction = action === "worker";
  const isWorkerStatusAction = action === "worker-status";
  const history = boolFlag(flags, "history") || isHistoryAction;

  if (!action || action === "--help" || action === "help") {
    showResourceHelp("verify");
    return;
  }

  try {
    if (
      !isFlagShortcut &&
      action !== "run" &&
      !isHistoryAction &&
      !isStatusAction &&
      !isWorkerAction &&
      !isWorkerStatusAction
    ) {
      throw new InvalidActionError("verify", action, ACTIONS);
    }

    const { db } = getDb();
    if (isWorkerStatusAction) {
      outputResult(getVerificationWorkerQueueStatus(db), pretty);
      return;
    }
    if (isWorkerAction) {
      const provider = optionalFlag(flags, "provider");
      if (boolFlag(flags, "drain")) {
        const result = await drainVerificationQueue(db, {
          ...(provider !== undefined ? { provider } : {}),
          execFileNoThrow,
        });
        outputResult(result, pretty);
        if (result.lastError) process.exitCode = 1;
        return;
      }
      const result = await runNextVerificationJob(db, {
        ...(provider !== undefined ? { provider } : {}),
        execFileNoThrow,
      });
      outputResult(result, pretty);
      if (result.error) process.exitCode = 1;
      return;
    }

    const ticketId = requireFlag(flags, "ticket");
    if (isStatusAction) {
      const result = getVerificationJob(db, ticketId);
      outputResult(result, pretty);
      return;
    }

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
