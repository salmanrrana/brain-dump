/**
 * PRD file utilities for Brain Dump MCP server.
 * Handles reading and updating the PRD (Product Requirements Document) file.
 * @module lib/prd-utils
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { log } from "./logging.js";

// ============================================
// Type Definitions
// ============================================

/** User story from PRD */
interface UserStory {
  id: string;
  title: string;
  passes?: boolean;
  // Other properties are allowed but not specified here
  [key: string]: unknown;
}

/** PRD document structure */
interface PrdDocument {
  userStories: UserStory[];
  // Other properties are allowed but not specified here
  [key: string]: unknown;
}

/** Result from updating PRD */
interface UpdateResult {
  success: boolean;
  message: string;
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
 * Update PRD file to set passes: true for a ticket.
 */
export function updatePrdForTicket(
  projectPath: string,
  ticketId: string
): UpdateResult {
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

    story.passes = true;
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    log.info(`Updated PRD: set passes=true for ticket ${ticketId}`);
    return {
      success: true,
      message: `PRD updated: ${story.title} marked as passing`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to update PRD: ${errorMsg}` };
  }
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
