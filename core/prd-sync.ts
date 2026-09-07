import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { DbHandle } from "./types.ts";

interface UserStory {
  id: string;
  title: string;
  passes?: boolean;
  status?: string;
  [key: string]: unknown;
}

interface PrdDocument {
  userStories: UserStory[];
  [key: string]: unknown;
}

export interface UpdatePrdResult {
  success: boolean;
  message: string;
}

export interface OptionalUpdatePrdResult extends UpdatePrdResult {
  applied: boolean;
  required: boolean;
}

// The Ralph loop reads blocked state from the scoped PRD to tell "waiting on
// a human" apart from "re-hitting the same blocker" — without it, a ticket
// parked for human action looks identical to silent no-progress.
function applyBlockedState(
  story: UserStory,
  blocked: { isBlocked: boolean; reason: string | null }
): void {
  if (blocked.isBlocked) {
    story.blocked = true;
    if (blocked.reason) story.blockedReason = blocked.reason;
    else delete story.blockedReason;
  } else {
    delete story.blocked;
    delete story.blockedReason;
  }
}

function applyStoryState(
  story: UserStory,
  passes: boolean,
  status?: string,
  blocked?: { isBlocked: boolean; reason: string | null }
): void {
  story.passes = passes;
  if (status !== undefined) story.status = status;
  if (blocked !== undefined) applyBlockedState(story, blocked);
  // Failure details remain useful through implementation and review, but a
  // newly generated demo supersedes them. Durable run/finding history remains
  // in SQLite; keeping the old prompt payload in PRD makes the next Ralph pass
  // look like the fresh verification already failed.
  if (passes || status === "ai_verification") delete story.verificationFailures;
}

/**
 * Update a ticket's Ralph PRD pass marker.
 *
 * `passes` means Ralph should stop working that ticket in the current loop. It
 * must stay false while a ticket is in ai_review or ready-for-rework so the next
 * iteration resumes the ticket instead of skipping to fresh implementation work.
 */
export function updatePrdForTicket(
  projectPath: string,
  ticketId: string,
  passes: boolean = true,
  status?: string
): UpdatePrdResult {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent) as PrdDocument;

    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { success: false, message: "PRD has no userStories array" };
    }

    const story = prd.userStories.find((s) => s.id === ticketId);
    if (!story) {
      return {
        success: false,
        message: `Ticket ${ticketId} not found in PRD`,
      };
    }

    applyStoryState(story, passes, status);
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    return {
      success: true,
      message: `PRD updated: ${story.title} marked as ${passes ? "passing" : "not yet passing"}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to update PRD: ${errorMsg}` };
  }
}

/**
 * Update a PRD pass marker only when the current scoped PRD owns the ticket.
 *
 * `plans/prd.json` is a scoped Ralph artifact and may be absent or belong to a
 * different epic/ticket when humans review older work. In those cases, sync is
 * skipped instead of blocking the durable ticket transition.
 */
export function updatePrdForTicketIfPresent(
  projectPath: string,
  ticketId: string,
  passes: boolean = true,
  status?: string,
  blocked?: { isBlocked: boolean; reason: string | null }
): OptionalUpdatePrdResult {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return {
      success: true,
      applied: false,
      required: false,
      message: `PRD sync skipped: PRD file not found: ${prdPath}`,
    };
  }

  let prd: PrdDocument;
  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    prd = JSON.parse(prdContent) as PrdDocument;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      applied: false,
      required: true,
      message: `Failed to read current PRD: ${errorMsg}`,
    };
  }

  if (!prd.userStories || !Array.isArray(prd.userStories)) {
    return {
      success: false,
      applied: false,
      required: true,
      message: "Current PRD has no userStories array",
    };
  }

  const story = prd.userStories.find((s) => s.id === ticketId);
  if (!story) {
    return {
      success: true,
      applied: false,
      required: false,
      message: `PRD sync skipped: ticket ${ticketId} is not in the current scoped PRD`,
    };
  }

  try {
    applyStoryState(story, passes, status, blocked);
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    return {
      success: true,
      applied: true,
      required: true,
      message: `PRD updated: ${story.title} marked as ${passes ? "passing" : "not yet passing"}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      applied: false,
      required: true,
      message: `Failed to update PRD: ${errorMsg}`,
    };
  }
}

export function updatePrdForDbTicketIfPresent(
  db: DbHandle,
  ticketId: string,
  passes: boolean = true,
  status?: string
): OptionalUpdatePrdResult {
  const ticketRow = db
    .prepare(
      "SELECT p.path as project_path, t.status, t.is_blocked, t.blocked_reason FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?"
    )
    .get(ticketId) as
    | { project_path: string; status: string; is_blocked: number; blocked_reason: string | null }
    | undefined;

  if (!ticketRow) {
    return {
      success: true,
      applied: false,
      required: false,
      message: "PRD sync skipped: project path unavailable for this ticket.",
    };
  }

  return updatePrdForTicketIfPresent(ticketRow.project_path, ticketId, passes, status ?? ticketRow.status, {
    isBlocked: ticketRow.is_blocked === 1,
    reason: ticketRow.blocked_reason,
  });
}

/**
 * Sync only the blocked flags for a ticket into the scoped PRD, leaving
 * passes/status untouched. Direct ticket edits (a human unblocking in the UI)
 * bypass the workflow transitions that normally sync the PRD; without this the
 * Ralph loop's blocked gate keeps trusting a stale blocked:true and refuses to
 * resume even though the database says the ticket is workable again.
 */
export function syncPrdBlockedStateForDbTicketIfPresent(
  db: DbHandle,
  ticketId: string
): OptionalUpdatePrdResult {
  const ticketRow = db
    .prepare(
      "SELECT p.path as project_path, t.is_blocked, t.blocked_reason FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?"
    )
    .get(ticketId) as
    | { project_path: string; is_blocked: number; blocked_reason: string | null }
    | undefined;
  if (!ticketRow) {
    return {
      success: true,
      applied: false,
      required: false,
      message: "PRD blocked-state sync skipped: project path unavailable for this ticket.",
    };
  }

  const prdPath = join(ticketRow.project_path, "plans", "prd.json");
  if (!existsSync(prdPath)) {
    return {
      success: true,
      applied: false,
      required: false,
      message: `PRD blocked-state sync skipped: PRD file not found: ${prdPath}`,
    };
  }

  try {
    const prd = JSON.parse(readFileSync(prdPath, "utf-8")) as PrdDocument;
    const story = Array.isArray(prd.userStories)
      ? prd.userStories.find((s) => s.id === ticketId)
      : undefined;
    if (!story) {
      return {
        success: true,
        applied: false,
        required: false,
        message: `PRD blocked-state sync skipped: ticket ${ticketId} is not in the current scoped PRD`,
      };
    }
    applyBlockedState(story, {
      isBlocked: ticketRow.is_blocked === 1,
      reason: ticketRow.blocked_reason,
    });
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    return {
      success: true,
      applied: true,
      required: true,
      message: `PRD blocked state synced for ${ticketId}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      applied: false,
      required: true,
      message: `Failed to sync PRD blocked state: ${errorMsg}`,
    };
  }
}
