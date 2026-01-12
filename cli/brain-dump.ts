#!/usr/bin/env npx tsx

/**
 * Brain Dump CLI - Update ticket status from the command line
 *
 * Usage:
 *   brain-dump status <ticket-id> <status>  - Set ticket status
 *   brain-dump done                         - Move current ticket to Review
 *   brain-dump current                      - Show current ticket info
 *   brain-dump clear                        - Clear current ticket
 *
 * This CLI is designed to be used with Claude Code hooks for automatic
 * status updates when work is completed.
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { getDatabasePath, getStateDir, ensureDirectoriesSync } from "../src/lib/xdg";
import { acquireLock, releaseLock } from "../src/lib/lockfile";

// Ensure XDG directories exist
ensureDirectoriesSync();

const DB_PATH = getDatabasePath();
const STATE_FILE = `${getStateDir()}/current-ticket.json`;

const VALID_STATUSES = ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"] as const;
type Status = (typeof VALID_STATUSES)[number];

function getDb() {
  if (!existsSync(DB_PATH)) {
    console.error("Error: Database not found at", DB_PATH);
    console.error("Make sure Brain Dump is running and has been initialized.");
    process.exit(1);
  }

  // Acquire lock for CLI operations
  const lockResult = acquireLock("cli");
  if (!lockResult.acquired) {
    console.error("Warning:", lockResult.message);
  }

  const db = new Database(DB_PATH);

  // Register cleanup on exit
  process.on("exit", () => {
    try {
      db.close();
      releaseLock();
    } catch {
      // Ignore cleanup errors
    }
  });

  return db;
}

function getCurrentTicket(): { ticketId: string; projectPath: string; startedAt: string } | null {
  if (!existsSync(STATE_FILE)) {
    return null;
  }
  try {
    const content = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function clearCurrentTicket(): void {
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
}

function updateTicketStatus(ticketId: string, status: Status): boolean {
  const db = getDb();

  try {
    // Update status
    const result = db.prepare(
      "UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, ticketId);

    if (result.changes === 0) {
      console.error("Error: Ticket not found:", ticketId);
      return false;
    }

    // Get ticket title for confirmation
    const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(ticketId) as { title: string } | undefined;

    console.log(`✓ Ticket "${ticket?.title}" moved to ${status.toUpperCase()}`);
    return true;
  } catch (error) {
    console.error("Error updating ticket:", error);
    return false;
  } finally {
    db.close();
  }
}

function showCurrentTicket(): void {
  const current = getCurrentTicket();
  if (!current) {
    console.log("No ticket is currently being worked on.");
    console.log("Use 'Start Work' in Brain Dump to begin working on a ticket.");
    return;
  }

  const db = getDb();
  try {
    const ticket = db.prepare(
      "SELECT title, status, priority FROM tickets WHERE id = ?"
    ).get(current.ticketId) as { title: string; status: string; priority: string | null } | undefined;

    if (!ticket) {
      console.log("Current ticket not found in database. It may have been deleted.");
      return;
    }

    console.log("Current Ticket:");
    console.log("  ID:", current.ticketId);
    console.log("  Title:", ticket.title);
    console.log("  Status:", ticket.status);
    console.log("  Priority:", ticket.priority || "None");
    console.log("  Project:", current.projectPath);
    console.log("  Started:", new Date(current.startedAt).toLocaleString());
  } finally {
    db.close();
  }
}

function showHelp(): void {
  console.log(`
Brain Dump CLI - Manage ticket status from the command line

Usage:
  brain-dump status <ticket-id> <status>  Set ticket status
  brain-dump done                         Move current ticket to Review
  brain-dump complete                     Move current ticket to Done
  brain-dump current                      Show current ticket info
  brain-dump clear                        Clear current ticket state
  brain-dump help                         Show this help message

Valid statuses: ${VALID_STATUSES.join(", ")}

Examples:
  brain-dump done                    # Mark current ticket ready for review
  brain-dump complete                # Mark current ticket as done
  brain-dump status abc123 review    # Move specific ticket to review

Claude Code Integration:
  Add to your Claude Code hooks (~/.claude.json or project settings):

  {
    "hooks": {
      "PostToolUse": [
        {
          "command": "brain-dump done",
          "trigger": "when the task is complete"
        }
      ]
    }
  }
`);
}

// Main CLI logic
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "status": {
    const ticketId = args[1];
    const status = args[2] as Status;

    if (!ticketId || !status) {
      console.error("Usage: brain-dump status <ticket-id> <status>");
      process.exit(1);
    }

    if (!VALID_STATUSES.includes(status)) {
      console.error("Invalid status:", status);
      console.error("Valid statuses:", VALID_STATUSES.join(", "));
      process.exit(1);
    }

    const success = updateTicketStatus(ticketId, status);
    process.exit(success ? 0 : 1);
    break;
  }

  case "done": {
    const current = getCurrentTicket();
    if (!current) {
      console.error("No current ticket. Use 'Start Work' in Brain Dump first.");
      process.exit(1);
    }

    const success = updateTicketStatus(current.ticketId, "review");
    if (success) {
      clearCurrentTicket();
      console.log("✓ Current ticket cleared. Ready for your review!");
    }
    process.exit(success ? 0 : 1);
    break;
  }

  case "complete": {
    const current = getCurrentTicket();
    if (!current) {
      console.error("No current ticket. Use 'Start Work' in Brain Dump first.");
      process.exit(1);
    }

    const success = updateTicketStatus(current.ticketId, "done");
    if (success) {
      clearCurrentTicket();
      console.log("✓ Ticket marked as Done!");
    }
    process.exit(success ? 0 : 1);
    break;
  }

  case "current": {
    showCurrentTicket();
    break;
  }

  case "clear": {
    clearCurrentTicket();
    console.log("✓ Current ticket state cleared.");
    break;
  }

  case "help":
  case "--help":
  case "-h":
  case undefined: {
    showHelp();
    break;
  }

  default: {
    console.error("Unknown command:", command);
    showHelp();
    process.exit(1);
  }
}
