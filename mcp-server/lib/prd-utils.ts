/**
 * PRD file utilities for Brain Dump MCP server.
 * Handles reading and updating the PRD (Product Requirements Document) file.
 * @module lib/prd-utils
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { updatePrdForTicket as updateCorePrdForTicket } from "../../core/prd-sync.ts";
import { log } from "./logging.js";

// ============================================
// Type Definitions
// ============================================

/** PRD document structure */
interface PrdDocument {
  userStories: Array<Record<string, unknown>>;
  // Other properties are allowed but not specified here
  [key: string]: unknown;
}

/** Result from reading PRD */
interface ReadResult {
  success: boolean;
  prd?: PrdDocument;
  message?: string;
}

// ============================================
// Main Functions
// ============================================

/**
 * Update a ticket's Ralph PRD pass marker.
 *
 * `passes` means Ralph should stop working that ticket in the current loop. It
 * must stay false while a ticket is in ai_review so the next iteration resumes
 * review/demo work instead of skipping to the next implementation ticket.
 */
export function updatePrdForTicket(
  projectPath: string,
  ticketId: string,
  passes: boolean = true
): ReturnType<typeof updateCorePrdForTicket> {
  const result = updateCorePrdForTicket(projectPath, ticketId, passes);
  if (result.success) {
    log.info(`Updated PRD: set passes=${String(passes)} for ticket ${ticketId}`);
  }
  return result;
}

/**
 * Read and parse the PRD file.
 */
export function readPrd(projectPath: string): ReadResult {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent) as PrdDocument;
    return { success: true, prd };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to read PRD: ${errorMsg}` };
  }
}
