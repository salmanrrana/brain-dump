/**
 * Admin commands: backup, restore, check, doctor, health.
 *
 * Preserves existing CLI behavior from brain-dump.ts.
 * The backup/restore/check/doctor logic is moved here;
 * `health` is new (wraps core/health.getDatabaseHealth).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { getDatabasePath, getBackupsDir, ensureDirectoriesSync } from "../../src/lib/xdg";
import {
  createBackup,
  listBackups,
  verifyBackup,
  restoreFromBackup,
  getLatestBackup,
  getDatabaseStats,
} from "../../src/lib/backup";
import { fullDatabaseCheck, quickIntegrityCheck } from "../../src/lib/integrity";
import { createCliLogger } from "../../src/lib/logger";
import { getDatabaseHealth } from "../../core/index.ts";
import type { HealthDependencies } from "../../core/index.ts";
import { parseFlags, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { InvalidActionError } from "../../core/index.ts";

const logger = createCliLogger();
ensureDirectoriesSync();

const ACTIONS = ["backup", "restore", "check", "doctor", "health"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function handleBackupAction(args: string[]): void {
  const flags = parseFlags(args);

  if (boolFlag(flags, "list")) {
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
    return;
  }

  console.log("Creating backup...");
  const result = createBackup();
  if (result.success && result.created) {
    console.log(`\u2713 Backup created: ${result.backupPath}`);
    logger.info(`Manual backup created: ${result.backupPath}`);
  } else if (result.success && !result.created) {
    console.log(`\u2713 ${result.message}`);
    if (result.backupPath) console.log(`  Path: ${result.backupPath}`);
  } else {
    console.error(`\u2717 ${result.message}`);
    logger.error(`Backup failed: ${result.message}`);
    process.exit(1);
  }
}

function handleCheckAction(args: string[]): void {
  const flags = parseFlags(args);

  if (boolFlag(flags, "full")) {
    console.log("Running full database health check...\n");
    logger.info("Running full database health check");
    const result = fullDatabaseCheck();

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

    console.log("WAL Check:");
    console.log(`  Status: ${result.walCheck.status.toUpperCase()}`);
    console.log(`  Message: ${result.walCheck.message}`);
    for (const detail of result.walCheck.details) {
      console.log(`    - ${detail}`);
    }
    console.log();

    console.log("Table Check:");
    console.log(`  Status: ${result.tableCheck.status.toUpperCase()}`);
    console.log(`  Message: ${result.tableCheck.message}`);
    console.log();

    console.log("-".repeat(50));
    const statusSymbols: Record<string, string> = { ok: "\u2713", warning: "!", error: "\u2717" };
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
    if (result.overallStatus === "error") process.exit(1);
    return;
  }

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

async function handleRestoreAction(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  let backupPath: string | null = null;
  let backupFilename: string | null = null;

  if (boolFlag(flags, "latest")) {
    const latest = getLatestBackup();
    if (!latest) {
      console.error("No backups found. Run 'brain-dump backup' first.");
      process.exit(1);
    }
    backupPath = latest.path;
    backupFilename = latest.filename;
  } else {
    // First positional arg after flags
    const positional = args.find((a) => !a.startsWith("--"));
    if (!positional) {
      console.error("Usage: brain-dump admin restore <filename> | --latest");
      console.log("\nAvailable backups:");
      handleBackupAction(["--list"]);
      process.exit(1);
    }
    backupFilename = positional;
    if (existsSync(positional)) {
      backupPath = positional;
    } else {
      backupPath = join(getBackupsDir(), positional);
      if (!existsSync(backupPath)) {
        console.error(`Backup not found: ${positional}`);
        console.error(`Tried: ${backupPath}`);
        console.log("\nAvailable backups:");
        handleBackupAction(["--list"]);
        process.exit(1);
      }
    }
  }

  console.log(`\nVerifying backup: ${backupFilename}...`);
  if (!verifyBackup(backupPath!)) {
    console.error("\u2717 Backup file failed integrity check. Cannot restore.");
    process.exit(1);
  }
  console.log("\u2713 Backup integrity verified.\n");

  const currentDbPath = getDatabasePath();
  const currentStats = getDatabaseStats(currentDbPath);
  const backupStats = getDatabaseStats(backupPath!);

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
  console.log("\n  WARNING: This will replace your current database!");
  console.log("  A pre-restore backup will be created automatically.\n");

  const confirmed = await confirm("Proceed with restore?");
  if (!confirmed) {
    console.log("Restore cancelled.");
    process.exit(0);
  }

  console.log("\nRestoring...");
  logger.info(`Starting database restore from: ${backupFilename}`);
  const result = restoreFromBackup(backupPath!);

  if (result.success) {
    console.log(`\u2713 ${result.message}`);
    if (result.preRestoreBackupPath) {
      console.log(`  Pre-restore backup saved to: ${result.preRestoreBackupPath}`);
    }
    console.log("\n  Please restart Brain Dump to use the restored database.");
    logger.info(`Database restored successfully from: ${backupFilename}`);
  } else {
    console.error(`\u2717 ${result.message}`);
    if (result.preRestoreBackupPath) {
      console.log(`  Your previous database was saved to: ${result.preRestoreBackupPath}`);
    }
    logger.error(`Database restore failed: ${result.message}`);
    process.exit(1);
  }
}

interface DoctorIssue {
  environment: string;
  component: string;
  message: string;
  fix?: string;
}

function handleDoctorAction(): void {
  console.log("\nBrain Dump Environment Doctor\n");
  console.log("=".repeat(63) + "\n");

  const issues: DoctorIssue[] = [];
  const home = process.env.HOME || "";

  // Claude Code
  console.log("Claude Code");
  console.log("-".repeat(50));

  const claudeDir = join(home, ".claude");
  const claudeHooksDir = join(claudeDir, "hooks");
  const claudeSettingsPath = join(claudeDir, "settings.json");
  const claudeCommandsDir = join(claudeDir, "commands");

  if (existsSync(claudeHooksDir)) {
    console.log("  \u2713 Hooks directory exists");
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
        `  \u2713 Workflow hooks installed (${installedWorkflowHooks.length}/${workflowHooks.length})`
      );
    } else {
      console.log(
        `  \u2717 Workflow hooks: ${installedWorkflowHooks.length}/${workflowHooks.length} installed`
      );
      issues.push({
        environment: "Claude Code",
        component: "Workflow Hooks",
        message: `Missing: ${workflowHooks.filter((h) => !installedWorkflowHooks.includes(h)).join(", ")}`,
        fix: "./scripts/setup-claude-code.sh",
      });
    }
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
        `  \u2713 Telemetry hooks installed (${installedTelemetryHooks.length}/${telemetryHooks.length})`
      );
    } else {
      console.log(
        `  \u2717 Telemetry hooks: ${installedTelemetryHooks.length}/${telemetryHooks.length} installed`
      );
      issues.push({
        environment: "Claude Code",
        component: "Telemetry Hooks",
        message: `Missing: ${telemetryHooks.filter((h) => !installedTelemetryHooks.includes(h)).join(", ")}`,
        fix: "./scripts/setup-claude-code.sh",
      });
    }
  } else {
    console.log("  \u2717 Hooks directory NOT found");
    issues.push({
      environment: "Claude Code",
      component: "Hooks Directory",
      message: "~/.claude/hooks/ does not exist",
      fix: "./scripts/setup-claude-code.sh",
    });
  }

  let claudeSettings: Record<string, unknown> | null = null;
  if (existsSync(claudeSettingsPath)) {
    try {
      claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ! settings.json exists but could not be parsed: ${errorMsg}`);
      issues.push({
        environment: "Claude Code",
        component: "settings.json",
        message: `Parse error: ${errorMsg}`,
        fix: "Fix JSON syntax in ~/.claude/settings.json",
      });
    }
  } else {
    console.log("  \u2717 settings.json NOT found");
    issues.push({
      environment: "Claude Code",
      component: "settings.json",
      message: "~/.claude/settings.json does not exist",
      fix: "./scripts/setup-claude-code.sh",
    });
  }

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
        `  \u2713 settings.json has all hook types configured (${requiredHookTypes.length}/${requiredHookTypes.length})`
      );
    } else {
      console.log(`  \u2717 settings.json missing hook types: ${missingHookTypes.join(", ")}`);
      issues.push({
        environment: "Claude Code",
        component: "settings.json",
        message: `Missing hook types: ${missingHookTypes.join(", ")}`,
        fix: "./scripts/setup-claude-code.sh",
      });
    }
  }

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
      console.log(`  \u2713 Skills installed (${installedSkills.length}/${requiredSkills.length})`);
    } else {
      console.log(`  ! Skills: ${installedSkills.length}/${requiredSkills.length} installed`);
    }
  } else {
    console.log("  o Skills directory not found (optional)");
  }

  if (claudeSettings) {
    const mcpServers = claudeSettings.mcpServers as Record<string, unknown> | undefined;
    if (mcpServers && mcpServers["brain-dump"]) {
      console.log("  \u2713 MCP server configured");
    } else {
      const mcpJsonPath = join(claudeDir, "mcp.json");
      if (existsSync(mcpJsonPath)) {
        console.log("  \u2713 MCP server configured (via mcp.json)");
      } else {
        console.log("  o MCP server: Check mcp.json or mcpServers in settings");
      }
    }
  }

  console.log();

  // Cursor
  console.log("Cursor");
  console.log("-".repeat(50));

  const cursorDir = join(home, ".cursor");
  if (existsSync(cursorDir)) {
    console.log("  \u2713 Cursor detected at ~/.cursor");
    const cursorMcpJson = join(cursorDir, "mcp.json");
    if (existsSync(cursorMcpJson)) {
      console.log("  \u2713 MCP server configured (mcp.json)");
    } else {
      console.log("  o MCP server: Not configured");
    }
  } else {
    console.log("  o Not detected (Cursor not installed or not configured)");
  }

  console.log();

  // Database
  console.log("Database");
  console.log("-".repeat(50));

  const dbPath = getDatabasePath();
  if (existsSync(dbPath)) {
    console.log(`  \u2713 Database found at ${dbPath}`);
    try {
      const result = quickIntegrityCheck();
      if (result.success) {
        console.log(`  \u2713 Integrity check: PASSED (${result.durationMs}ms)`);
      } else {
        console.log(`  \u2717 Integrity check: FAILED - ${result.message}`);
        issues.push({
          environment: "Database",
          component: "Integrity",
          message: result.message,
          fix: "brain-dump check --full",
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  \u2717 Integrity check: ERROR - ${errorMsg}`);
      issues.push({
        environment: "Database",
        component: "Integrity",
        message: `Check threw an error: ${errorMsg}`,
        fix: "brain-dump check --full",
      });
    }
  } else {
    console.log("  o Database not initialized");
    console.log("    Run 'pnpm dev' to create the database");
  }

  console.log();
  console.log("=".repeat(63) + "\n");

  if (issues.length === 0) {
    console.log("\u2713 All checks passed! Environment is properly configured.\n");
    process.exit(0);
  } else {
    console.log(`Issues Found: ${issues.length}\n`);
    issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.environment}] ${issue.component}`);
      console.log(`     ${issue.message}`);
      if (issue.fix) console.log(`     Fix: ${issue.fix}`);
    });
    console.log(
      "\n" + "-".repeat(63) + "\nRun: ./scripts/install.sh to fix most issues\n" + "-".repeat(63)
    );
    process.exit(1);
  }
}

function handleHealthAction(args: string[]): void {
  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  const deps: HealthDependencies = {
    listBackups: () => {
      return listBackups().map((b) => ({ date: b.date, path: b.path, size: b.size }));
    },
    checkLock: () => ({ isLocked: false, isStale: false, lockInfo: null }),
  };

  const result = getDatabaseHealth(db, deps);
  outputResult(result, pretty);
}

export async function handle(action: string, args: string[]): Promise<void> {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "admin",
      ACTIONS,
      "Examples:\n  brain-dump admin backup --list\n  brain-dump admin check --full\n  brain-dump admin health --pretty"
    );
  }

  try {
    switch (action) {
      case "backup":
        handleBackupAction(args);
        break;
      case "restore":
        await handleRestoreAction(args);
        break;
      case "check":
        handleCheckAction(args);
        break;
      case "doctor":
        handleDoctorAction();
        break;
      case "health":
        handleHealthAction(args);
        break;
      default:
        throw new InvalidActionError("admin", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
