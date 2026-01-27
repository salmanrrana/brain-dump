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
 *   brain-dump cleanup                 - List stale worktrees (dry-run)
 *   brain-dump cleanup --force         - Remove stale worktrees without confirmation
 *   brain-dump help                    - Show this help message
 *
 * Note: For ticket management, use Brain Dump's MCP tools:
 *   - start_ticket_work      Create branch + set status
 *   - complete_ticket_work   Move to review + suggest next
 *   - update_ticket_status   Change ticket status
 */

import { existsSync, readFileSync } from "fs";
import { join, basename } from "path";
import { createInterface } from "readline";
import { execFileSync } from "child_process";
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
import { db } from "../src/lib/db";
import { projects, epics, epicWorkflowState } from "../src/lib/schema";
import { eq, isNotNull } from "drizzle-orm";

// Create logger for CLI operations
const logger = createCliLogger();

// Ensure XDG directories exist
ensureDirectoriesSync();

function showHelp(): void {
  console.log(`
Brain Dump CLI - Database utilities and environment diagnostics

Usage:
  brain-dump backup                  Create immediate backup
  brain-dump backup --list           List available backups
  brain-dump restore <filename>      Restore from backup file
  brain-dump restore --latest        Restore from most recent backup
  brain-dump check                   Quick database integrity check
  brain-dump check --full            Full database health check
  brain-dump doctor                  Check environment configuration for all IDEs
  brain-dump cleanup                 List stale worktrees (dry-run by default)
  brain-dump cleanup --force         Remove stale worktrees without confirmation
  brain-dump help                    Show this help message

Examples:
  brain-dump backup                  # Create a backup now
  brain-dump backup --list           # Show available backups
  brain-dump restore --latest        # Restore from most recent backup
  brain-dump check                   # Quick integrity check
  brain-dump check --full            # Full health check with details
  brain-dump doctor                  # Verify Claude Code, Cursor, OpenCode, VS Code setup
  brain-dump cleanup                 # Show stale worktrees (merged PRs)
  brain-dump cleanup --force         # Remove stale worktrees without prompts

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
    const statusSymbols: Record<string, string> = {
      ok: "\u2713",
      warning: "!",
      error: "\u2717",
    };
    const statusSymbol = statusSymbols[result.overallStatus] ?? "\u2717";
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

// PR status type matching schema
type PrStatus = "draft" | "open" | "merged" | "closed" | null;

// Worktree info for cleanup command
interface WorktreeInfo {
  path: string;
  epicId: string;
  epicTitle: string;
  projectName: string;
  projectPath: string;
  prNumber: number | null;
  prStatus: PrStatus;
  worktreeStatus: string | null;
  size: number;
}

// Calculate directory size using du command
function getDirectorySize(dirPath: string): number {
  try {
    // Use du for accurate directory size - execFileSync with args array is safe
    const output = execFileSync("du", ["-sk", dirPath], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const parts = output.split("\t");
    const sizeKb = parseInt(parts[0] || "0", 10);
    return sizeKb * 1024; // Convert KB to bytes
  } catch {
    return 0;
  }
}

// Get PR status via gh CLI (using execFileSync with args array for security)
function getPrStatus(
  prNumber: number,
  projectPath: string
): { status: string; mergedAt: string | null } | null {
  try {
    const output = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "state,mergedAt"],
      {
        encoding: "utf-8",
        cwd: projectPath,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    const data = JSON.parse(output);
    return {
      status: data.state?.toLowerCase() || "unknown",
      mergedAt: data.mergedAt || null,
    };
  } catch {
    return null;
  }
}

// Remove a git worktree safely
function removeGitWorktree(projectPath: string, worktreePath: string, force: boolean): void {
  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(worktreePath);

  execFileSync("git", args, {
    encoding: "utf-8",
    cwd: projectPath,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// Prune stale worktree references
function pruneWorktrees(projectPath: string): void {
  execFileSync("git", ["worktree", "prune"], {
    encoding: "utf-8",
    cwd: projectPath,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// Cleanup command handler - manage stale worktrees
async function handleCleanup(args: string[]): Promise<void> {
  const forceFlag = args.includes("--force");
  const dryRun = !forceFlag;

  console.log("\n🗂️  Brain Dump Worktree Cleanup\n");
  console.log("Scanning for stale worktrees...\n");

  // Query all worktrees from epic_workflow_state
  const worktrees = db
    .select({
      worktreePath: epicWorkflowState.worktreePath,
      worktreeStatus: epicWorkflowState.worktreeStatus,
      epicId: epicWorkflowState.epicId,
      prNumber: epicWorkflowState.prNumber,
      prStatus: epicWorkflowState.prStatus,
    })
    .from(epicWorkflowState)
    .where(isNotNull(epicWorkflowState.worktreePath))
    .all();

  if (worktrees.length === 0) {
    console.log("No worktrees found in the database.\n");
    console.log("Worktrees are created when starting epic work with isolation mode = 'worktree'.");
    process.exit(0);
  }

  // Get epic and project details for each worktree
  const worktreeInfos: WorktreeInfo[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const wt of worktrees) {
    if (!wt.worktreePath) continue;

    // Get epic details
    const epic = db
      .select({
        id: epics.id,
        title: epics.title,
        projectId: epics.projectId,
      })
      .from(epics)
      .where(eq(epics.id, wt.epicId))
      .get();

    if (!epic) {
      skipped.push({ path: wt.worktreePath, reason: "Epic not found in database" });
      continue;
    }

    // Get project details
    const project = db
      .select({
        name: projects.name,
        path: projects.path,
      })
      .from(projects)
      .where(eq(projects.id, epic.projectId))
      .get();

    if (!project || !project.path) {
      skipped.push({ path: wt.worktreePath, reason: "Project not found in database" });
      continue;
    }

    // Check if worktree directory exists
    if (!existsSync(wt.worktreePath)) {
      skipped.push({ path: wt.worktreePath, reason: "Directory no longer exists" });
      continue;
    }

    // Check PR status if available
    let prStatus: PrStatus = wt.prStatus;
    if (wt.prNumber) {
      const liveStatus = getPrStatus(wt.prNumber, project.path);
      if (liveStatus) {
        // Map live status to valid PrStatus type
        const statusMap: Record<string, PrStatus> = {
          draft: "draft",
          open: "open",
          merged: "merged",
          closed: "closed",
        };
        prStatus = statusMap[liveStatus.status] || prStatus;
      }
    }

    // Determine if this is a "stale" worktree (PR merged or closed)
    const isStale = prStatus === "merged" || prStatus === "closed";

    if (!isStale && !forceFlag) {
      skipped.push({
        path: wt.worktreePath,
        reason: `PR is still ${prStatus || "open"} (use --force to include)`,
      });
      continue;
    }

    // Get directory size
    const size = getDirectorySize(wt.worktreePath);

    worktreeInfos.push({
      path: wt.worktreePath,
      epicId: epic.id,
      epicTitle: epic.title,
      projectName: project.name,
      projectPath: project.path,
      prNumber: wt.prNumber,
      prStatus,
      worktreeStatus: wt.worktreeStatus,
      size,
    });
  }

  // Display stale worktrees
  if (worktreeInfos.length === 0) {
    console.log("No stale worktrees found.\n");

    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} worktree(s):`);
      for (const s of skipped.slice(0, 5)) {
        console.log(`  - ${basename(s.path)}: ${s.reason}`);
      }
      if (skipped.length > 5) {
        console.log(`  ... and ${skipped.length - 5} more`);
      }
    }

    process.exit(0);
  }

  // Calculate total size
  const totalSize = worktreeInfos.reduce((sum, wt) => sum + wt.size, 0);

  console.log(`Found ${worktreeInfos.length} stale worktree(s):\n`);

  for (let i = 0; i < worktreeInfos.length; i++) {
    const wt = worktreeInfos[i];
    if (!wt) continue;
    const prInfo = wt.prNumber ? `#${wt.prNumber} (${wt.prStatus})` : "No PR";

    console.log(`${i + 1}. ${wt.path}`);
    console.log(`   Epic: ${wt.epicTitle}`);
    console.log(`   Project: ${wt.projectName}`);
    console.log(`   PR: ${prInfo}`);
    console.log(`   Size: ${formatSize(wt.size)}`);
    console.log();
  }

  console.log("─".repeat(50));
  console.log(`Total: ${formatSize(totalSize)} to reclaim\n`);

  if (dryRun) {
    console.log("This is a DRY RUN. No worktrees were removed.\n");
    console.log("To remove stale worktrees, run:");
    console.log("  brain-dump cleanup --force\n");
    process.exit(0);
  }

  // Interactive confirmation for each worktree
  let removed = 0;
  let removedSize = 0;

  for (let i = 0; i < worktreeInfos.length; i++) {
    const wt = worktreeInfos[i];
    if (!wt) continue;

    const shouldDelete = await confirm(`Delete worktree ${i + 1}? (${basename(wt.path)})`);

    if (shouldDelete) {
      try {
        // Remove using git worktree remove
        removeGitWorktree(wt.projectPath, wt.path, true);

        // Prune stale worktree references
        pruneWorktrees(wt.projectPath);

        // Update database: clear worktree fields
        db.update(epicWorkflowState)
          .set({
            worktreePath: null,
            worktreeStatus: null,
            worktreeCreatedAt: null,
          })
          .where(eq(epicWorkflowState.epicId, wt.epicId))
          .run();

        console.log(`✓ Removed ${basename(wt.path)}`);
        removed++;
        removedSize += wt.size;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`✗ Failed to remove ${basename(wt.path)}: ${errorMsg}`);
        logger.error(`Failed to remove worktree ${wt.path}: ${errorMsg}`);
      }
    } else {
      console.log(`⊘ Skipped ${basename(wt.path)}`);
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(`Cleanup complete: ${removed} removed, ${worktreeInfos.length - removed} skipped`);
  if (removed > 0) {
    console.log(`Reclaimed: ${formatSize(removedSize)}`);
    logger.info(
      `Worktree cleanup: removed ${removed} worktrees, reclaimed ${formatSize(removedSize)}`
    );
  }
  console.log();
}

// Issue tracker for doctor command
interface DoctorIssue {
  environment: string;
  component: string;
  message: string;
  fix?: string;
}

// Doctor command handler - checks environment configuration
function handleDoctor(): void {
  console.log("\n🩺 Brain Dump Environment Doctor\n");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const issues: DoctorIssue[] = [];
  const home = process.env.HOME || "";

  // ═══════════════════════════════════════════════════════════════
  // Claude Code
  // ═══════════════════════════════════════════════════════════════
  console.log("Claude Code");
  console.log("─".repeat(50));

  const claudeDir = join(home, ".claude");
  const claudeHooksDir = join(claudeDir, "hooks");
  const claudeSettingsPath = join(claudeDir, "settings.json");
  const claudeCommandsDir = join(claudeDir, "commands");

  // Check hooks directory
  if (existsSync(claudeHooksDir)) {
    console.log("  ✓ Hooks directory exists");

    // Workflow hooks
    const workflowHooks = [
      "enforce-state-before-write.sh",
      "record-state-change.sh",
      "link-commit-to-ticket.sh",
      "create-pr-on-ticket-start.sh",
      "spawn-next-ticket.sh",
    ];
    const installedWorkflowHooks = workflowHooks.filter((h) => existsSync(join(claudeHooksDir, h)));
    if (installedWorkflowHooks.length === workflowHooks.length) {
      console.log(
        `  ✓ Workflow hooks installed (${installedWorkflowHooks.length}/${workflowHooks.length})`
      );
    } else {
      console.log(
        `  ✗ Workflow hooks: ${installedWorkflowHooks.length}/${workflowHooks.length} installed`
      );
      issues.push({
        environment: "Claude Code",
        component: "Workflow Hooks",
        message: `Missing: ${workflowHooks.filter((h) => !installedWorkflowHooks.includes(h)).join(", ")}`,
        fix: "./scripts/setup-claude-code.sh",
      });
    }

    // Telemetry hooks
    const telemetryHooks = [
      "start-telemetry-session.sh",
      "end-telemetry-session.sh",
      "log-tool-start.sh",
      "log-tool-end.sh",
      "log-tool-failure.sh",
      "log-prompt.sh",
    ];
    const installedTelemetryHooks = telemetryHooks.filter((h) =>
      existsSync(join(claudeHooksDir, h))
    );
    if (installedTelemetryHooks.length === telemetryHooks.length) {
      console.log(
        `  ✓ Telemetry hooks installed (${installedTelemetryHooks.length}/${telemetryHooks.length})`
      );
    } else {
      console.log(
        `  ✗ Telemetry hooks: ${installedTelemetryHooks.length}/${telemetryHooks.length} installed`
      );
      issues.push({
        environment: "Claude Code",
        component: "Telemetry Hooks",
        message: `Missing: ${telemetryHooks.filter((h) => !installedTelemetryHooks.includes(h)).join(", ")}`,
        fix: "./scripts/setup-claude-code.sh",
      });
    }
  } else {
    console.log("  ✗ Hooks directory NOT found");
    issues.push({
      environment: "Claude Code",
      component: "Hooks Directory",
      message: `~/.claude/hooks/ does not exist`,
      fix: "./scripts/setup-claude-code.sh",
    });
  }

  // Parse settings.json once and reuse for hook and MCP checks
  let claudeSettings: Record<string, unknown> | null = null;
  if (existsSync(claudeSettingsPath)) {
    try {
      claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8"));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠ settings.json exists but could not be parsed: ${errorMsg}`);
      issues.push({
        environment: "Claude Code",
        component: "settings.json",
        message: `Parse error: ${errorMsg}`,
        fix: "Fix JSON syntax in ~/.claude/settings.json",
      });
    }
  } else {
    console.log("  ✗ settings.json NOT found");
    issues.push({
      environment: "Claude Code",
      component: "settings.json",
      message: "~/.claude/settings.json does not exist",
      fix: "./scripts/setup-claude-code.sh",
    });
  }

  // Check settings.json hook configurations
  if (claudeSettings) {
    const hooks = (claudeSettings.hooks as Record<string, unknown>) || {};

    const requiredHookTypes = [
      "SessionStart",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "UserPromptSubmit",
      "Stop",
    ];
    const configuredHookTypes = Object.keys(hooks);
    const missingHookTypes = requiredHookTypes.filter((h) => !configuredHookTypes.includes(h));

    if (missingHookTypes.length === 0) {
      console.log(
        `  ✓ settings.json has all hook types configured (${requiredHookTypes.length}/${requiredHookTypes.length})`
      );
    } else {
      console.log(`  ✗ settings.json missing hook types: ${missingHookTypes.join(", ")}`);
      issues.push({
        environment: "Claude Code",
        component: "settings.json",
        message: `Missing hook types: ${missingHookTypes.join(", ")}`,
        fix: "./scripts/setup-claude-code.sh",
      });
    }
  }

  // Check skills (commands)
  if (existsSync(claudeCommandsDir)) {
    const requiredSkills = [
      "next-task.md",
      "review-ticket.md",
      "review-epic.md",
      "demo.md",
      "reconcile-learnings.md",
    ];
    const installedSkills = requiredSkills.filter((s) => existsSync(join(claudeCommandsDir, s)));
    if (installedSkills.length === requiredSkills.length) {
      console.log(`  ✓ Skills installed (${installedSkills.length}/${requiredSkills.length})`);
    } else {
      console.log(`  ⚠ Skills: ${installedSkills.length}/${requiredSkills.length} installed`);
      // Not critical, just a warning
    }
  } else {
    console.log("  ○ Skills directory not found (optional)");
  }

  // Check MCP server (reusing claudeSettings parsed above)
  if (claudeSettings) {
    const mcpServers = claudeSettings.mcpServers as Record<string, unknown> | undefined;
    if (mcpServers && mcpServers["brain-dump"]) {
      console.log("  ✓ MCP server configured");
    } else {
      // Check for mcp.json
      const mcpJsonPath = join(claudeDir, "mcp.json");
      if (existsSync(mcpJsonPath)) {
        console.log("  ✓ MCP server configured (via mcp.json)");
      } else {
        console.log("  ○ MCP server: Check mcp.json or mcpServers in settings");
      }
    }
  } else if (existsSync(claudeSettingsPath)) {
    // Settings file exists but couldn't be parsed - already reported above
    console.log("  ○ MCP server: Could not verify (settings.json parse error)");
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════
  // Cursor
  // ═══════════════════════════════════════════════════════════════
  console.log("Cursor");
  console.log("─".repeat(50));

  const cursorDir = join(home, ".cursor");
  const cursorHooksDir = join(cursorDir, "hooks");
  const cursorMcpJson = join(cursorDir, "mcp.json");
  const cursorRulesDir = join(cursorDir, "rules");

  if (existsSync(cursorDir)) {
    console.log("  ✓ Cursor detected at ~/.cursor");

    // Check hooks
    if (existsSync(cursorHooksDir)) {
      const hooks = [
        "sessionStart.sh",
        "sessionEnd.sh",
        "preToolUse.sh",
        "postToolUse.sh",
        "postToolUseFailure.sh",
        "beforeSubmitPrompt.sh",
      ];
      const installedHooks = hooks.filter((h) => existsSync(join(cursorHooksDir, h)));
      if (installedHooks.length > 0) {
        console.log(`  ✓ Hooks: ${installedHooks.length}/${hooks.length} installed`);
      } else {
        console.log("  ○ Hooks: Not installed");
      }
    } else {
      console.log("  ○ Hooks directory: Not found");
    }

    // Check hooks.json
    const cursorHooksJson = join(cursorDir, "hooks.json");
    if (existsSync(cursorHooksJson)) {
      console.log("  ✓ hooks.json configured");
    } else {
      console.log("  ○ hooks.json: Not configured");
    }

    // Check MCP config
    if (existsSync(cursorMcpJson)) {
      console.log("  ✓ MCP server configured (mcp.json)");
    } else {
      console.log("  ○ MCP server: Not configured");
    }

    // Check rules
    if (existsSync(cursorRulesDir)) {
      if (existsSync(join(cursorRulesDir, "brain-dump-workflow.md"))) {
        console.log("  ✓ Workflow rules installed");
      } else {
        console.log("  ○ Workflow rules: Not installed");
      }
    } else {
      console.log("  ○ Rules directory: Not found");
    }
  } else {
    console.log("  ○ Not detected (Cursor not installed or not configured)");
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════
  // OpenCode
  // ═══════════════════════════════════════════════════════════════
  console.log("OpenCode");
  console.log("─".repeat(50));

  const opencodeDir = join(home, ".config", "opencode");
  const opencodePlugins = join(opencodeDir, "plugins");
  const opencodeJson = join(process.cwd(), "opencode.json");

  if (existsSync(opencodeDir) || existsSync(opencodeJson)) {
    console.log("  ✓ OpenCode detected");

    // Check plugin
    const pluginPath = join(opencodePlugins, "brain-dump-telemetry.ts");
    if (existsSync(pluginPath)) {
      console.log("  ✓ Telemetry plugin installed");
    } else {
      console.log("  ○ Telemetry plugin: Not installed");
    }

    // Check AGENTS.md
    const agentsMdPaths = [
      join(process.cwd(), "AGENTS.md"),
      join(process.cwd(), ".opencode", "AGENTS.md"),
    ];
    const foundAgentsMd = agentsMdPaths.find((p) => existsSync(p));
    if (foundAgentsMd) {
      console.log("  ✓ AGENTS.md exists");
    } else {
      console.log("  ○ AGENTS.md: Not found");
    }

    // Check MCP config
    if (existsSync(opencodeJson)) {
      try {
        const config = JSON.parse(readFileSync(opencodeJson, "utf-8"));
        if (config.mcp && config.mcp["brain-dump"]) {
          console.log("  ✓ MCP server configured");
        } else {
          console.log("  ○ MCP server: Not configured in opencode.json");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠ MCP server: Could not parse opencode.json: ${errorMsg}`);
      }
    } else {
      console.log("  ○ opencode.json: Not found");
    }
  } else {
    console.log("  ○ Not detected (OpenCode not installed or not configured)");
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════
  // VS Code
  // ═══════════════════════════════════════════════════════════════
  console.log("VS Code");
  console.log("─".repeat(50));

  const vscodeMcpJson = join(process.cwd(), ".vscode", "mcp.json");
  const copilotInstructions = join(process.cwd(), ".github", "copilot-instructions.md");
  const vscodeSkills = join(process.cwd(), ".github", "skills");

  // Check MCP config
  if (existsSync(vscodeMcpJson)) {
    console.log("  ✓ MCP config exists (.vscode/mcp.json)");
  } else {
    console.log("  ○ MCP config: .vscode/mcp.json not found");
  }

  // Check Copilot instructions
  if (existsSync(copilotInstructions)) {
    console.log("  ✓ Copilot instructions exist");
  } else {
    console.log("  ○ Copilot instructions: .github/copilot-instructions.md not found");
  }

  // Check skills
  if (existsSync(vscodeSkills)) {
    const skillFile = join(vscodeSkills, "brain-dump-workflow.skill.md");
    if (existsSync(skillFile)) {
      console.log("  ✓ Workflow skill installed");
    } else {
      console.log("  ○ Workflow skill: Not installed");
    }
  } else {
    console.log("  ○ Skills directory: .github/skills/ not found");
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════
  // Database
  // ═══════════════════════════════════════════════════════════════
  console.log("Database");
  console.log("─".repeat(50));

  const dbPath = getDatabasePath();
  if (existsSync(dbPath)) {
    console.log(`  ✓ Database found at ${dbPath}`);
    try {
      const result = quickIntegrityCheck();
      if (result.success) {
        console.log(`  ✓ Integrity check: PASSED (${result.durationMs}ms)`);
      } else {
        console.log(`  ✗ Integrity check: FAILED - ${result.message}`);
        issues.push({
          environment: "Database",
          component: "Integrity",
          message: result.message,
          fix: "brain-dump check --full",
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Integrity check: ERROR - ${errorMsg}`);
      issues.push({
        environment: "Database",
        component: "Integrity",
        message: `Check threw an error: ${errorMsg}`,
        fix: "brain-dump check --full",
      });
    }
  } else {
    console.log("  ○ Database not initialized");
    console.log("    Run 'pnpm dev' to create the database");
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (issues.length === 0) {
    console.log("✓ All checks passed! Environment is properly configured.\n");
    process.exit(0);
  } else {
    console.log(`Issues Found: ${issues.length}\n`);

    issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.environment}] ${issue.component}`);
      console.log(`     ${issue.message}`);
      if (issue.fix) {
        console.log(`     Fix: ${issue.fix}`);
      }
    });

    console.log("\n─────────────────────────────────────────────────────────────────");
    console.log("Run: ./scripts/install.sh to fix most issues");
    console.log("─────────────────────────────────────────────────────────────────\n");

    process.exit(1);
  }
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

  case "cleanup": {
    handleCleanup(args.slice(1)).catch((error) => {
      console.error("Cleanup failed:", error);
      process.exit(1);
    });
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
