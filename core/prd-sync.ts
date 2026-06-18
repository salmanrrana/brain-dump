import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { DbHandle } from "./types.ts";

interface UserStory {
  id: string;
  title: string;
  passes?: boolean;
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
  passes: boolean = true
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

    story.passes = passes;
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
  passes: boolean = true
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
    story.passes = passes;
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
  passes: boolean = true
): OptionalUpdatePrdResult {
  const ticketRow = db
    .prepare(
      "SELECT p.path as project_path FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?"
    )
    .get(ticketId) as { project_path: string } | undefined;

  if (!ticketRow) {
    return {
      success: true,
      applied: false,
      required: false,
      message: "PRD sync skipped: project path unavailable for this ticket.",
    };
  }

  return updatePrdForTicketIfPresent(ticketRow.project_path, ticketId, passes);
}
