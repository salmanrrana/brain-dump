#!/usr/bin/env npx tsx

/**
 * Brain Dump CLI - Update ticket status from the command line
 *
 * Usage:
 *   brain-dump status <ticket-id> <status>  - Set ticket status
 *   brain-dump done                         - Move current ticket to Review
 *   brain-dump current                      - Show current ticket info
 *   brain-dump clear                        - Clear current ticket
 *   brain-dump backup                       - Create immediate backup
 *   brain-dump backup --list                - List available backups
 *   brain-dump restore <filename>           - Restore from backup
 *   brain-dump restore --latest             - Restore most recent backup
 *
 * This CLI is designed to be used with Claude Code hooks for automatic
 * status updates when work is completed.
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { getDatabasePath, getStateDir, getBackupsDir, ensureDirectoriesSync } from "../src/lib/xdg";
import { acquireLock, releaseLock } from "../src/lib/lockfile";
import {
  createBackup,
  listBackups,
  verifyBackup,
  restoreFromBackup,
  getLatestBackup,
  getDatabaseStats,
} from "../src/lib/backup";
import { fullDatabaseCheck, quickIntegrityCheck } from "../src/lib/integrity";
import { createCliLogger } from "../src/lib/logger";

// Create logger for CLI operations
const logger = createCliLogger();

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
      logger.warn(`Ticket not found: ${ticketId}`);
      return false;
    }

    // Get ticket title for confirmation
    const ticket = db.prepare("SELECT title FROM tickets WHERE id = ?").get(ticketId) as { title: string } | undefined;

    console.log(`✓ Ticket "${ticket?.title}" moved to ${status.toUpperCase()}`);
    logger.info(`Ticket status updated: ${ticketId} -> ${status}`);
    return true;
  } catch (error) {
    console.error("Error updating ticket:", error);
    logger.error("Failed to update ticket status", error instanceof Error ? error : new Error(String(error)));
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
  brain-dump backup                       Create immediate backup
  brain-dump backup --list                List available backups
  brain-dump restore <filename>           Restore from backup file
  brain-dump restore --latest             Restore from most recent backup
  brain-dump check                        Quick database integrity check
  brain-dump check --full                 Full database health check
  brain-dump help                         Show this help message

Valid statuses: ${VALID_STATUSES.join(", ")}

Examples:
  brain-dump done                    # Mark current ticket ready for review
  brain-dump complete                # Mark current ticket as done
  brain-dump status abc123 review    # Move specific ticket to review
  brain-dump backup                  # Create a backup now
  brain-dump backup --list           # Show available backups
  brain-dump restore --latest        # Restore from most recent backup
  brain-dump check                   # Quick integrity check
  brain-dump check --full            # Full health check with details

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

// Helper to format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to prompt for confirmation
async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Backup command handler
function handleBackup(args: string[]): void {
  const subcommand = args[0];

  if (subcommand === "--list") {
    // List available backups
    const backups = listBackups();

    if (backups.length === 0) {
      console.log("No backups found.");
      console.log(`Backup directory: ${getBackupsDir()}`);
      return;
    }

    console.log(`\nAvailable Backups (${backups.length}):\n`);
    console.log("  Date        Size      Filename");
    console.log("  " + "-".repeat(50));

    for (const backup of backups) {
      const sizeStr = formatSize(backup.size).padStart(10);
      console.log(`  ${backup.date}  ${sizeStr}  ${backup.filename}`);
    }

    console.log(`\nBackup directory: ${getBackupsDir()}`);
  } else {
    // Create backup
    console.log("Creating backup...");
    const result = createBackup();

    if (result.success && result.created) {
      console.log(`✓ Backup created: ${result.backupPath}`);
      logger.info(`Manual backup created: ${result.backupPath}`);
    } else if (result.success && !result.created) {
      console.log(`✓ ${result.message}`);
      if (result.backupPath) {
        console.log(`  Path: ${result.backupPath}`);
      }
    } else {
      console.error(`✗ ${result.message}`);
      logger.error(`Backup failed: ${result.message}`);
      process.exit(1);
    }
  }
}

// Check command handler
function handleCheck(args: string[]): void {
  const subcommand = args[0];

  if (subcommand === "--full") {
    // Full comprehensive check
    console.log("Running full database health check...\n");
    logger.info("Running full database health check");
    const result = fullDatabaseCheck();

    // Integrity check
    console.log("Integrity Check:");
    console.log(`  Status: ${result.integrityCheck.status.toUpperCase()}`);
    console.log(`  Message: ${result.integrityCheck.message}`);
    if (result.integrityCheck.details.length > 0) {
      console.log("  Details:");
      for (const detail of result.integrityCheck.details.slice(0, 5)) {
        console.log(`    - ${detail}`);
      }
      if (result.integrityCheck.details.length > 5) {
        console.log(`    ... and ${result.integrityCheck.details.length - 5} more`);
      }
    }
    console.log();

    // Foreign key check
    console.log("Foreign Key Check:");
    console.log(`  Status: ${result.foreignKeyCheck.status.toUpperCase()}`);
    console.log(`  Message: ${result.foreignKeyCheck.message}`);
    if (result.foreignKeyCheck.details.length > 0) {
      console.log("  Violations:");
      for (const detail of result.foreignKeyCheck.details.slice(0, 5)) {
        console.log(`    - ${detail}`);
      }
    }
    console.log();

    // WAL check
    console.log("WAL Check:");
    console.log(`  Status: ${result.walCheck.status.toUpperCase()}`);
    console.log(`  Message: ${result.walCheck.message}`);
    for (const detail of result.walCheck.details) {
      console.log(`    - ${detail}`);
    }
    console.log();

    // Table check
    console.log("Table Check:");
    console.log(`  Status: ${result.tableCheck.status.toUpperCase()}`);
    console.log(`  Message: ${result.tableCheck.message}`);
    console.log();

    // Overall summary
    console.log("-".repeat(50));
    const statusSymbol = result.overallStatus === "ok" ? "\u2713" : result.overallStatus === "warning" ? "!" : "\u2717";
    console.log(`Overall Status: ${statusSymbol} ${result.overallStatus.toUpperCase()}`);
    console.log(`Duration: ${result.durationMs}ms`);

    if (result.suggestions.length > 0) {
      console.log("\nSuggestions:");
      for (const suggestion of result.suggestions) {
        console.log(`  - ${suggestion}`);
      }
    }

    logger.info(`Full check complete: ${result.overallStatus} (${result.durationMs}ms)`);

    if (result.overallStatus === "error") {
      process.exit(1);
    }
  } else {
    // Quick check
    console.log("Running quick integrity check...");
    logger.info("Running quick integrity check");
    const result = quickIntegrityCheck();

    if (result.success) {
      console.log(`\u2713 ${result.message} (${result.durationMs}ms)`);
      logger.info(`Quick check passed (${result.durationMs}ms)`);
    } else {
      console.log(`\u2717 ${result.message}`);
      console.log("\nRun 'brain-dump check --full' for detailed diagnostics.");
      logger.error(`Quick check failed: ${result.message}`);
      process.exit(1);
    }
  }
}

// Restore command handler
async function handleRestore(args: string[]): Promise<void> {
  const subcommand = args[0];
  let backupPath: string | null = null;
  let backupFilename: string | null = null;

  if (subcommand === "--latest") {
    // Get latest backup
    const latest = getLatestBackup();
    if (!latest) {
      console.error("No backups found. Run 'brain-dump backup' first.");
      process.exit(1);
    }
    backupPath = latest.path;
    backupFilename = latest.filename;
  } else if (subcommand) {
    // Specific backup file
    backupFilename = subcommand;

    // Check if it's a full path or just filename
    if (existsSync(subcommand)) {
      backupPath = subcommand;
    } else {
      // Try in backups directory
      backupPath = join(getBackupsDir(), subcommand);
      if (!existsSync(backupPath)) {
        console.error(`Backup not found: ${subcommand}`);
        console.error(`Tried: ${backupPath}`);
        console.log("\nAvailable backups:");
        handleBackup(["--list"]);
        process.exit(1);
      }
    }
  } else {
    console.error("Usage: brain-dump restore <filename> | --latest");
    console.log("\nAvailable backups:");
    handleBackup(["--list"]);
    process.exit(1);
  }

  // Verify backup before proceeding
  console.log(`\nVerifying backup: ${backupFilename}...`);
  if (!verifyBackup(backupPath)) {
    console.error("✗ Backup file failed integrity check. Cannot restore.");
    process.exit(1);
  }
  console.log("✓ Backup integrity verified.\n");

  // Get stats for comparison
  const currentDbPath = getDatabasePath();
  const currentStats = getDatabaseStats(currentDbPath);
  const backupStats = getDatabaseStats(backupPath);

  console.log("Restore Summary:");
  console.log("  " + "-".repeat(40));

  if (currentStats) {
    console.log(`  Current DB: ${currentStats.projects} projects, ${currentStats.epics} epics, ${currentStats.tickets} tickets`);
  } else {
    console.log("  Current DB: (empty or not found)");
  }

  if (backupStats) {
    console.log(`  Backup:     ${backupStats.projects} projects, ${backupStats.epics} epics, ${backupStats.tickets} tickets`);
  } else {
    console.log("  Backup:     (unable to read stats)");
  }

  console.log("  " + "-".repeat(40));
  console.log("\n⚠️  WARNING: This will replace your current database!");
  console.log("  A pre-restore backup will be created automatically.\n");

  // Confirm
  const confirmed = await confirm("Proceed with restore?");
  if (!confirmed) {
    console.log("Restore cancelled.");
    process.exit(0);
  }

  // Perform restore
  console.log("\nRestoring...");
  logger.info(`Starting database restore from: ${backupFilename}`);
  const result = restoreFromBackup(backupPath);

  if (result.success) {
    console.log(`✓ ${result.message}`);
    if (result.preRestoreBackupPath) {
      console.log(`  Pre-restore backup saved to: ${result.preRestoreBackupPath}`);
    }
    console.log("\n⚠️  Please restart Brain Dump to use the restored database.");
    logger.info(`Database restored successfully from: ${backupFilename}`);
  } else {
    console.error(`✗ ${result.message}`);
    if (result.preRestoreBackupPath) {
      console.log(`  Your previous database was saved to: ${result.preRestoreBackupPath}`);
    }
    logger.error(`Database restore failed: ${result.message}`);
    process.exit(1);
  }
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

  case "backup": {
    handleBackup(args.slice(1));
    break;
  }

  case "restore": {
    handleRestore(args.slice(1)).catch((error) => {
      console.error("Restore failed:", error);
      process.exit(1);
    });
    break;
  }

  case "check": {
    handleCheck(args.slice(1));
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
