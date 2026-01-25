#!/usr/bin/env npx tsx

/**
 * Brain Dump CLI - Database utilities and environment diagnostics
 *
 * Usage:
 *   brain-dump backup                  - Create immediate backup
 *   brain-dump backup --list           - List available backups
 *   brain-dump restore <filename>      - Restore from backup
 *   brain-dump restore --latest        - Restore most recent backup
 *   brain-dump check                   - Quick database integrity check
 *   brain-dump check --full            - Full database health check
 *   brain-dump doctor                  - Check environment configuration
 *   brain-dump help                    - Show this help message
 *
 * Note: For ticket management, use Brain Dump's MCP tools:
 *   - start_ticket_work      Create branch + set status
 *   - complete_ticket_work   Move to review + suggest next
 *   - update_ticket_status   Change ticket status
 */

import { existsSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { getDatabasePath, getBackupsDir, ensureDirectoriesSync } from "../src/lib/xdg";
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

function showHelp(): void {
  console.log(`
Brain Dump CLI - Database utilities

Usage:
  brain-dump backup                  Create immediate backup
  brain-dump backup --list           List available backups
  brain-dump restore <filename>      Restore from backup file
  brain-dump restore --latest        Restore from most recent backup
  brain-dump check                   Quick database integrity check
  brain-dump check --full            Full database health check
  brain-dump help                    Show this help message

Examples:
  brain-dump backup                  # Create a backup now
  brain-dump backup --list           # Show available backups
  brain-dump restore --latest        # Restore from most recent backup
  brain-dump check                   # Quick integrity check
  brain-dump check --full            # Full health check with details

For ticket management, use Brain Dump's MCP tools instead:
  - start_ticket_work       Create branch + set status to in_progress
  - complete_ticket_work    Move to review + suggest next ticket
  - update_ticket_status    Change ticket status directly
  - add_ticket_comment      Add work summaries or notes
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
    const statusSymbol =
      result.overallStatus === "ok"
        ? "\u2713"
        : result.overallStatus === "warning"
          ? "!"
          : "\u2717";
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
    console.log(
      `  Current DB: ${currentStats.projects} projects, ${currentStats.epics} epics, ${currentStats.tickets} tickets`
    );
  } else {
    console.log("  Current DB: (empty or not found)");
  }

  if (backupStats) {
    console.log(
      `  Backup:     ${backupStats.projects} projects, ${backupStats.epics} epics, ${backupStats.tickets} tickets`
    );
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

// Doctor command handler - checks environment configuration
function handleDoctor(): void {
  console.log("\n🩺 Brain Dump Environment Doctor\n");
  console.log("═══════════════════════════════════════════\n");

  let healthyEnvs = 0;
  let totalEnvs = 0;

  // Check Claude Code
  console.log("Claude Code:");
  totalEnvs++;
  const claudeCode = {
    installed: false,
    hooksDir: `${process.env.HOME}/.claude/hooks`,
    settingsFile: `${process.env.HOME}/.claude/settings.json`,
  };

  if (existsSync(claudeCode.hooksDir)) {
    const hooks = [
      "start-telemetry-session.sh",
      "end-telemetry-session.sh",
      "log-tool-telemetry.sh",
      "log-prompt-telemetry.sh",
    ];
    const installedHooks = hooks.filter((h) => existsSync(join(claudeCode.hooksDir, h))).length;
    console.log(`  ✓ Telemetry hooks: ${installedHooks}/${hooks.length} installed`);
    if (installedHooks === hooks.length) {
      console.log("  ✓ Status: Fully configured");
      healthyEnvs++;
    } else {
      console.log("  ⚠ Status: Partially configured");
    }
  } else {
    console.log("  ○ Status: Not configured");
  }

  // Check Cursor
  console.log("\nCursor:");
  totalEnvs++;
  const cursorDir = `${process.env.HOME}/.cursor`;
  const cursorHooksDir = join(cursorDir, "hooks");

  if (existsSync(cursorHooksDir)) {
    const hooks = [
      "start-telemetry.sh",
      "end-telemetry.sh",
      "log-tool.sh",
      "log-tool-failure.sh",
      "log-prompt.sh",
    ];
    const installedHooks = hooks.filter((h) => existsSync(join(cursorHooksDir, h))).length;
    console.log(`  ✓ Telemetry hooks: ${installedHooks}/${hooks.length} installed`);
    if (installedHooks === hooks.length) {
      console.log("  ✓ Status: Fully configured");
      healthyEnvs++;
    } else {
      console.log("  ⚠ Status: Partially configured");
    }
  } else {
    console.log("  ○ Status: Not configured");
  }

  // Check OpenCode
  console.log("\nOpenCode:");
  totalEnvs++;
  const opencodePluigins = `${process.env.HOME}/.config/opencode/plugins`;

  if (existsSync(join(opencodePluigins, "brain-dump-telemetry.ts"))) {
    console.log("  ✓ Telemetry plugin: installed");
    console.log("  ✓ Status: Fully configured");
    healthyEnvs++;
  } else {
    console.log("  ○ Status: Not configured");
  }

  // Check VS Code
  console.log("\nVS Code:");
  totalEnvs++;
  console.log("  ○ Status: Manual configuration required");
  console.log("    See .vscode/ and .github/ for templates");

  // Summary
  console.log("\n═══════════════════════════════════════════\n");
  console.log("Summary:");
  console.log(`  Configured: ${healthyEnvs}/${totalEnvs} environments\n`);

  if (healthyEnvs === totalEnvs) {
    console.log("✓ All environments are ready!\n");
  } else if (healthyEnvs > 0) {
    console.log(`⚠ ${totalEnvs - healthyEnvs} environments need setup\n`);
    console.log("Run: ./scripts/install.sh\n");
  } else {
    console.log("○ No environments configured\n");
    console.log("Run: ./scripts/install.sh\n");
  }

  // Database status
  console.log("Database:");
  const dbPath = getDatabasePath();
  if (existsSync(dbPath)) {
    const result = quickIntegrityCheck();
    if (result.status === "ok") {
      console.log("  ✓ Integrity: OK");
    } else {
      console.log(`  ⚠ Integrity: ${result.message}`);
    }
  } else {
    console.log("  ○ Database: Not initialized (run 'pnpm dev' first)");
  }

  console.log();
}

// Main CLI logic
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
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

  case "doctor": {
    handleDoctor();
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
