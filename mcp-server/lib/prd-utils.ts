/**
 * PRD file utilities for Brain Dump MCP server.
 * Handles reading and updating the PRD (Product Requirements Document) file.
 * @module lib/prd-utils
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { log } from "./logging.js";

/**
 * Update PRD file to set passes: true for a ticket.
 * @param {string} projectPath - Path to the project root
 * @param {string} ticketId - The ticket ID to mark as passing
 * @returns {{ success: boolean, message: string }}
 */
export function updatePrdForTicket(projectPath, ticketId) {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent);

    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { success: false, message: "PRD has no userStories array" };
    }

    const story = prd.userStories.find(s => s.id === ticketId);
    if (!story) {
      return { success: false, message: `Ticket ${ticketId} not found in PRD` };
    }

    story.passes = true;
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    log.info(`Updated PRD: set passes=true for ticket ${ticketId}`);
    return { success: true, message: `PRD updated: ${story.title} marked as passing` };
  } catch (err) {
    return { success: false, message: `Failed to update PRD: ${err.message}` };
  }
}

/**
 * Read and parse the PRD file.
 * @param {string} projectPath - Path to the project root
 * @returns {{ success: boolean, prd?: object, message?: string }}
 */
export function readPrd(projectPath) {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent);
    return { success: true, prd };
  } catch (err) {
    return { success: false, message: `Failed to read PRD: ${err.message}` };
  }
}
