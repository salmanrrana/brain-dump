/**
 * CLI context resolution utilities.
 *
 * Shared helpers that resolve project and ticket IDs from CLI flags
 * and environment (cwd). Used by all commands that need entity context.
 *
 * Precedence is explicit and deterministic — no hidden mutable state.
 */

import { findProjectByPath, ValidationError } from "../../core/index.ts";
import { getDb } from "./db.ts";

/**
 * Resolve a project ID from CLI flags and/or the current working directory.
 *
 * Precedence:
 * 1. Explicit `--project <id>` flag (pass-through, no validation)
 * 2. Auto-detect from `cwd` via `findProjectByPath()`
 * 3. Throw with a helpful message
 */
export function resolveProjectId({
  projectFlag,
  cwd,
}: {
  projectFlag?: string;
  cwd?: string;
}): string {
  // 1. Explicit flag wins
  if (projectFlag) {
    return projectFlag;
  }

  // 2. Auto-detect from cwd
  if (cwd) {
    const { db } = getDb();
    const project = findProjectByPath(db, cwd);
    if (project) {
      return project.id;
    }
  }

  // 3. No context available
  throw new ValidationError(
    "Could not determine project. Use --project <id> or run from within a registered project directory.\n" +
      "Hint: use 'brain-dump project list' to see registered projects."
  );
}

/**
 * Resolve a ticket ID from CLI flags.
 *
 * V1: requires an explicit `--ticket <id>` flag.
 * No implicit "current ticket" state — keeps behavior deterministic.
 */
export function resolveTicketId({ ticketFlag }: { ticketFlag?: string }): string {
  if (!ticketFlag) {
    throw new ValidationError(
      "Missing required flag: --ticket <id>\n" +
        "Hint: use 'brain-dump ticket list' to see available tickets."
    );
  }
  return ticketFlag;
}
