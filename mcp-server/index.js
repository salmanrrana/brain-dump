#!/usr/bin/env node

/**
 * Brain Dumpy MCP Server
 *
 * Provides tools for managing tickets in Brain Dumpy from any project.
 * Follows MCP best practices: https://modelcontextprotocol.io/docs/develop/build-server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { homedir } from "os";
import { join } from "path";
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync, watch, copyFileSync, statSync, appendFileSync, constants } from "fs";
import { execSync } from "child_process";
import { dirname, basename } from "path";

// Import logging utilities from lib
import {
  log,
  LOG_FILE,
  ERROR_LOG_FILE,
  MAX_LOG_SIZE,
  MAX_LOG_FILES,
  LOG_PRIORITY,
  formatLogEntry,
  rotateLogFile,
  writeToLogFile,
  getLogLevel,
  shouldLog,
} from "./lib/logging.js";
import {
  getDataDir,
  getStateDir,
  getLogsDir,
  getBackupsDir,
  getLegacyDir,
  getDbPath,
  getLockFilePath,
  ensureDirectoriesSync,
  getPlatform,
} from "./lib/xdg.js";
import {
  initDatabase,
  isMigrationComplete,
  verifyDatabaseIntegrity,
  migrateFromLegacySync,
  runMigrations,
} from "./lib/database.js";
import {
  isProcessRunning,
  readLockFile,
  checkLock,
  isLocked,
  acquireLock,
  releaseLock,
} from "./lib/lock.js";
import {
  createBackupIfNeeded,
  listBackups,
  cleanupOldBackups,
  verifyBackup,
  performDailyBackupSync,
} from "./lib/backup.js";

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================
const VSCODE_ENV_PATTERNS = [
  "VSCODE_GIT_ASKPASS_NODE",
  "VSCODE_GIT_ASKPASS_MAIN",
  "VSCODE_GIT_IPC_HANDLE",
  "VSCODE_INJECTION",
  "VSCODE_CLI",
  "VSCODE_PID",
  "VSCODE_CWD",
  "VSCODE_NLS_CONFIG",
  "VSCODE_IPC_HOOK",
  "TERM_PROGRAM", // Check if value is "vscode"
];

const CLAUDE_CODE_ENV_PATTERNS = [
  "CLAUDE_CODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_API_KEY",
  "ANTHROPIC_API_KEY",
  "MCP_SERVER_NAME",
  "CLAUDE_CODE_TERMINAL_ID",
];

/**
 * Check if any VS Code environment variables are present
 */
function hasVSCodeEnvironment() {
  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") {
        return true;
      }
    } else if (process.env[envVar]) {
      return true;
    }
  }
  return false;
}

/**
 * Check if any Claude Code environment variables are present
 */
function hasClaudeCodeEnvironment() {
  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) {
      return true;
    }
  }
  // Check if running in a Claude Code session
  if (process.env.SHELL && process.env.SHELL.includes("claude")) {
    return true;
  }
  return false;
}

/**
 * Detect the current environment
 * Claude Code takes priority because it may run inside a VS Code terminal
 */
function detectEnvironment() {
  if (hasClaudeCodeEnvironment()) {
    return "claude-code";
  }
  if (hasVSCodeEnvironment()) {
    return "vscode";
  }
  return "unknown";
}

/**
 * Get detailed environment information
 */
function getEnvironmentInfo() {
  const environment = detectEnvironment();
  const envVarsDetected = [];
  let workspacePath = null;

  // Collect detected env vars
  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }

  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") {
        envVarsDetected.push("TERM_PROGRAM=vscode");
      }
    } else if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }

  // Try to determine workspace path
  if (process.env.VSCODE_CWD) {
    workspacePath = process.env.VSCODE_CWD;
  } else if (process.env.PWD) {
    workspacePath = process.env.PWD;
  } else {
    try {
      workspacePath = process.cwd();
    } catch {
      // Ignore cwd errors
    }
  }

  return {
    environment,
    workspacePath,
    envVarsDetected,
  };
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

function setupGracefulShutdown(dbInstance) {
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info(`Received ${signal}, shutting down gracefully`);

    try {
      // Stop database file watcher
      stopDatabaseWatcher();

      // Checkpoint WAL to ensure all data is written
      if (dbInstance) {
        try {
          dbInstance.pragma("wal_checkpoint(TRUNCATE)");
          log.info("WAL checkpoint completed");
        } catch (e) {
          log.error("WAL checkpoint failed", e);
        }
        try {
          dbInstance.close();
          log.info("Database connection closed");
        } catch (e) {
          log.error("Database close failed", e);
        }
      }

      // Release lock
      const result = releaseLock();
      if (result.released) {
        log.info(result.message);
      }
    } catch (e) {
      log.error("Error during shutdown", e);
    }

    process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGQUIT", () => shutdown("SIGQUIT"));

  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", error);
    releaseLock();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", reason);
    releaseLock();
    process.exit(1);
  });

  // Sync cleanup on normal exit
  process.on("exit", () => {
    const lockInfo = readLockFile();
    if (lockInfo && lockInfo.pid === process.pid) {
      try { unlinkSync(getLockFilePath()); } catch { /* ignore */ }
    }
  });
}

// =============================================================================
// DATABASE FILE WATCHER
// =============================================================================

/**
 * Watcher state - tracks active file system watcher
 */
let dbWatcher = {
  watcher: null,
  dbPath: "",
  isWatching: false,
  deletionDetected: false,
};

/**
 * Log a deletion event to the state directory
 */
function logDeletionEvent(deletedFile) {
  try {
    const logPath = join(getStateDir(), "deletion-events.log");
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} DELETED: ${deletedFile}\n`;
    appendFileSync(logPath, entry, { mode: 0o600 });
    log.error(`Deletion logged to ${logPath}`);
  } catch (error) {
    log.error(`Failed to log deletion event: ${error.message}`);
  }
}

/**
 * Default deletion handler - logs and alerts
 */
function handleDatabaseDeletion(deletedFile) {
  logDeletionEvent(deletedFile);
  log.error(`CRITICAL: Database file "${deletedFile}" was deleted!`);
  log.error("Data may be lost. Check for processes or scripts that may have removed the file.");
  log.error(`If you have a recent backup, you may be able to restore from: ${join(getStateDir(), "backups")}`);
}

/**
 * Handle potential file deletion event from watcher
 */
function handlePotentialDeletion(filename, dbPath) {
  if (!filename) return;

  const dbBasename = basename(dbPath);
  const isDbFile =
    filename === dbBasename ||
    filename === `${dbBasename}-wal` ||
    filename === `${dbBasename}-shm`;

  if (!isDbFile) return;

  // Verify the file is actually gone
  const filePath = filename === dbBasename ? dbPath : join(dirname(dbPath), filename);

  if (!existsSync(filePath)) {
    if (!dbWatcher.deletionDetected) {
      dbWatcher.deletionDetected = true;
      log.error(`CRITICAL: Database file deleted: ${filename}`);
      log.error(`Full path: ${filePath}`);
      handleDatabaseDeletion(filename);
    }
  }
}

/**
 * Start watching database files for unexpected deletion
 */
function startDatabaseWatcher(dbPath) {
  if (dbWatcher.isWatching) {
    log.info("Already watching database files");
    return true;
  }

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir) || !existsSync(dbPath)) {
    log.error(`Cannot start watcher: database or directory does not exist`);
    return false;
  }

  try {
    const watcher = watch(dbDir, (event, filename) => {
      if (event === "rename") {
        handlePotentialDeletion(filename, dbPath);
      }
    });

    watcher.on("error", (error) => {
      log.error(`Database watcher error: ${error.message}`);
    });

    dbWatcher = {
      watcher,
      dbPath,
      isWatching: true,
      deletionDetected: false,
    };

    log.info(`Started watching database: ${dbPath}`);
    return true;
  } catch (error) {
    log.error(`Failed to start database watcher: ${error.message}`);
    return false;
  }
}

/**
 * Stop the database file watcher
 */
function stopDatabaseWatcher() {
  if (dbWatcher.watcher) {
    try {
      dbWatcher.watcher.close();
    } catch { /* ignore */ }
  }
  dbWatcher = { watcher: null, dbPath: "", isWatching: false, deletionDetected: false };
}

// =============================================================================
// DATABASE CONNECTION
// =============================================================================
let db;
let actualDbPath;

try {
  const result = initDatabase();
  db = result.db;
  actualDbPath = result.actualDbPath;

  // Perform daily backup maintenance
  try {
    const backupResult = performDailyBackupSync(actualDbPath);
    if (backupResult.backup.created) {
      log.info(backupResult.backup.message);
    }
    if (backupResult.cleanup.deleted > 0) {
      log.info(backupResult.cleanup.message);
    }
  } catch (backupError) {
    log.error("Backup maintenance failed", backupError);
  }

  // Acquire lock file and setup graceful shutdown
  const lockResult = acquireLock("mcp-server");
  if (lockResult.acquired) {
    log.info(lockResult.message);
    setupGracefulShutdown(db);
  } else {
    log.info(`Warning: ${lockResult.message}`);
  }

  // Start watching for unexpected database file deletions
  startDatabaseWatcher(actualDbPath);
} catch (error) {
  log.error(`Failed to open database`, error);
  process.exit(1);
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================
function validateRequired(args, fields) {
  const missing = fields.filter(f => !args[f] || (typeof args[f] === "string" && !args[f].trim()));
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

function validateEnum(value, allowed, fieldName) {
  if (value && !allowed.includes(value)) {
    return `Invalid ${fieldName}: "${value}". Must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

// =============================================================================
// GIT HELPERS
// =============================================================================

/**
 * Generate a URL-safe slug from a string
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "")     // Trim leading/trailing hyphens
    .substring(0, 50);           // Limit length
}

/**
 * Get short ID from UUID (first 8 characters)
 */
function shortId(uuid) {
  return uuid.substring(0, 8);
}

/**
 * Generate branch name for a ticket
 * Format: feature/{short-id}-{slug}
 */
function generateBranchName(ticketId, ticketTitle) {
  const slug = slugify(ticketTitle);
  return `feature/${shortId(ticketId)}-${slug}`;
}

/**
 * Run a git command in a directory
 * Returns { success: boolean, output: string, error?: string }
 */
function runGitCommand(command, cwd) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error.stderr?.trim() || error.message,
    };
  }
}

// =============================================================================
// MCP SERVER SETUP
// =============================================================================
const server = new Server(
  {
    name: "brain-dump",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: `List all projects registered in Brain Dumpy.

Returns an array of projects with their IDs, names, and paths.
Use this to find the projectId needed for creating tickets.

Example response:
[
  { "id": "abc-123", "name": "My App", "path": "/home/user/my-app" }
]`,
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "find_project_by_path",
        description: `Find a project by filesystem path.

Searches for a project whose path matches or contains the given path.
Useful for auto-detecting which project you're working in.

Args:
  path: The directory path to search for (e.g., current working directory)

Returns the matching project or a message if no project found.`,
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute filesystem path to search for",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "create_project",
        description: `Create a new project in Brain Dumpy.

Use this when working in a directory that isn't yet registered.
The path must be an absolute filesystem path that exists.

Args:
  name: Display name for the project (e.g., "My App", "Backend API")
  path: Absolute path to project root (e.g., "/home/user/projects/my-app")
  color: Optional hex color (e.g., "#3b82f6" for blue)

Returns the created project with its generated ID.`,
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Project display name",
            },
            path: {
              type: "string",
              description: "Absolute filesystem path to project root",
            },
            color: {
              type: "string",
              description: "Optional hex color (e.g., '#3b82f6')",
            },
          },
          required: ["name", "path"],
        },
      },
      {
        name: "create_ticket",
        description: `Create a new ticket in Brain Dumpy.

The ticket will be added to the Backlog column.
First use find_project_by_path or list_projects to get the projectId.

Args:
  projectId: ID of the project (use list_projects to find)
  title: Short, descriptive title for the ticket
  description: Optional detailed description (supports markdown)
  priority: Optional priority level (low, medium, high)
  epicId: Optional epic ID to group the ticket
  tags: Optional array of tags for categorization

Returns the created ticket with its generated ID.`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID (from list_projects or find_project_by_path)",
            },
            title: {
              type: "string",
              description: "Ticket title - short, descriptive summary",
            },
            description: {
              type: "string",
              description: "Detailed description (markdown supported)",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Priority level",
            },
            epicId: {
              type: "string",
              description: "Epic ID to associate with",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
          },
          required: ["projectId", "title"],
        },
      },
      {
        name: "list_tickets",
        description: `List tickets with optional filters.

Args:
  projectId: Optional - filter by project
  status: Optional - filter by status (backlog, ready, in_progress, review, ai_review, human_review, done)
  limit: Optional - max tickets to return (default: 20)

Returns array of tickets sorted by creation date (newest first).`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Filter by project ID",
            },
            status: {
              type: "string",
              enum: ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"],
              description: "Filter by status",
            },
            limit: {
              type: "number",
              description: "Max tickets to return (default: 20)",
            },
          },
          required: [],
        },
      },
      {
        name: "update_ticket_status",
        description: `Update a ticket's status.

Status flow: backlog -> ready -> in_progress -> review -> done
Alternate flow: in_progress -> ai_review -> human_review -> done

Args:
  ticketId: The ticket ID to update
  status: New status value

Returns the updated ticket.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to update",
            },
            status: {
              type: "string",
              enum: ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"],
              description: "New status",
            },
          },
          required: ["ticketId", "status"],
        },
      },
      {
        name: "list_epics",
        description: `List epics for a project.

Epics are used to group related tickets together.

Args:
  projectId: The project ID to list epics for

Returns array of epics with their IDs and titles.`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID",
            },
          },
          required: ["projectId"],
        },
      },
      {
        name: "create_epic",
        description: `Create a new epic to group related tickets.

Args:
  projectId: Project ID to create the epic in
  title: Epic title
  description: Optional description
  color: Optional hex color

Returns the created epic.`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID",
            },
            title: {
              type: "string",
              description: "Epic title",
            },
            description: {
              type: "string",
              description: "Optional description",
            },
            color: {
              type: "string",
              description: "Optional hex color",
            },
          },
          required: ["projectId", "title"],
        },
      },
      {
        name: "add_ticket_comment",
        description: `Add a comment or work summary to a ticket.

Use this to document work completed, test results, or any notes about the ticket.
This creates an audit trail of changes made by Claude or Ralph.

Args:
  ticketId: The ticket ID to add comment to
  content: The comment text (markdown supported)
  author: Who is adding the comment (claude, ralph, or user)
  type: Type of comment (comment, work_summary, test_report)

Returns the created comment.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to add comment to",
            },
            content: {
              type: "string",
              description: "Comment content (markdown supported). For work summaries, include: what was done, files changed, tests run.",
            },
            author: {
              type: "string",
              enum: ["claude", "ralph", "user"],
              description: "Who is adding the comment",
            },
            type: {
              type: "string",
              enum: ["comment", "work_summary", "test_report"],
              description: "Type of comment (default: comment)",
            },
          },
          required: ["ticketId", "content", "author"],
        },
      },
      {
        name: "get_ticket_comments",
        description: `Get all comments for a ticket.

Returns array of comments sorted by creation date (newest first).

Args:
  ticketId: The ticket ID to get comments for`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "start_ticket_work",
        description: `Start working on a ticket.

This tool:
1. Creates a git branch: feature/{ticket-short-id}-{slug}
2. Sets the ticket status to in_progress
3. Returns the branch name and ticket context

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details, and project path for context.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to start working on",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "complete_ticket_work",
        description: `Complete work on a ticket and move it to review.

This tool:
1. Sets the ticket status to review
2. Gets git commits on the current branch (for PR description)
3. Returns a summary of work done
4. Signals that context should be cleared for fresh perspective on next task

Use this when you've finished implementing a ticket.
Call this before creating a pull request.

IMPORTANT - Fresh Eyes Workflow:
After completing a ticket, the AI should clear its context before starting the next task.
This ensures each ticket gets worked on with a clean slate, without accumulated assumptions
from previous work. The response includes environment-specific guidance for how to reset.

Args:
  ticketId: The ticket ID to complete
  summary: Optional work summary to include

Returns:
  Updated ticket, git commits summary, suggested PR description, and context reset guidance.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to complete",
            },
            summary: {
              type: "string",
              description: "Optional work summary describing what was done",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "link_commit_to_ticket",
        description: `Link a git commit to a ticket.

Stores the commit reference in the ticket's metadata.
Multiple commits can be linked to a single ticket.

Use this to track which commits are related to a ticket.
The commit can be queried later to see all work done.

Args:
  ticketId: The ticket ID to link the commit to
  commitHash: The git commit hash (full or short)
  message: Optional commit message (auto-fetched if not provided)

Returns:
  Updated list of linked commits for the ticket.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to link the commit to",
            },
            commitHash: {
              type: "string",
              description: "Git commit hash (full or abbreviated)",
            },
            message: {
              type: "string",
              description: "Optional commit message (auto-fetched if in git repo)",
            },
          },
          required: ["ticketId", "commitHash"],
        },
      },
      {
        name: "link_files_to_ticket",
        description: `Link files to a ticket.

Associates file paths with a ticket for context tracking.
Multiple files can be linked to a single ticket.

Use this to track which files are related to a ticket.
Helpful for providing context when working on related issues.

Args:
  ticketId: The ticket ID to link files to
  files: Array of file paths (relative or absolute)

Returns:
  Updated list of linked files for the ticket.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to link files to",
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "Array of file paths to link",
            },
          },
          required: ["ticketId", "files"],
        },
      },
      {
        name: "get_tickets_for_file",
        description: `Find tickets related to a file.

Searches for tickets that have this file linked.
Useful for getting context when working on a file.

Supports partial path matching - will find tickets where
the linked file path contains the search path.

Args:
  filePath: The file path to search for
  projectId: Optional - limit search to a specific project

Returns:
  Array of tickets that have this file linked.`,
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "File path to search for (supports partial matching)",
            },
            projectId: {
              type: "string",
              description: "Optional project ID to limit search",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "get_database_health",
        description: `Get database health and backup status.

Returns a comprehensive health report including:
- Database status (healthy/warning/error)
- Database path and size
- Last backup timestamp
- Number of available backups
- Integrity check result
- Lock file status
- Any detected issues

Use this to diagnose database problems or verify system health.

Returns:
  Health report object with status, paths, backup info, and issues.`,
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_environment",
        description: `Get current environment information.

Detects whether the MCP server is being called from:
- Claude Code (Anthropic's CLI)
- VS Code (with MCP extension)
- Unknown environment

Also returns the current workspace path and auto-detected project.

Returns:
  {
    "environment": "claude-code" | "vscode" | "unknown",
    "workspacePath": "/path/to/project",
    "detectedProject": { project info } | null,
    "envVarsDetected": ["CLAUDE_CODE", ...]
  }

Use this to determine which features are available and to provide
environment-specific guidance or behavior.`,
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_project_settings",
        description: `Get project settings including working method preference.

Returns the project's configured working method and computes the effective
environment based on the setting and current detection.

Args:
  projectId: The project ID to get settings for

Returns:
  {
    "projectId": "...",
    "projectName": "...",
    "workingMethod": "auto" | "claude-code" | "vscode",
    "effectiveEnvironment": "claude-code" | "vscode" | "unknown",
    "detectedEnvironment": "claude-code" | "vscode" | "unknown"
  }

The effectiveEnvironment is computed as:
- If workingMethod is "auto": uses detectedEnvironment
- If workingMethod is "claude-code" or "vscode": uses that value
- Otherwise: falls back to detectedEnvironment`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID to get settings for",
            },
          },
          required: ["projectId"],
        },
      },
      {
        name: "update_project_settings",
        description: `Update project settings.

Currently supports updating the working method preference, which controls
how the environment is detected for this project.

Args:
  projectId: The project ID to update settings for
  workingMethod: The working method preference:
    - "auto": Auto-detect environment (default)
    - "claude-code": Always use Claude Code behavior
    - "vscode": Always use VS Code behavior

Returns:
  Updated project settings with the new working method and computed
  effective environment.`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID to update settings for",
            },
            workingMethod: {
              type: "string",
              enum: ["auto", "claude-code", "vscode"],
              description: "Working method preference",
            },
          },
          required: ["projectId", "workingMethod"],
        },
      },
    ],
  };
});

// =============================================================================
// TOOL HANDLERS
// =============================================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log.debug(`Tool called: ${name}`);

  try {
    switch (name) {
      // -----------------------------------------------------------------------
      // LIST PROJECTS
      // -----------------------------------------------------------------------
      case "list_projects": {
        const projects = db.prepare("SELECT * FROM projects ORDER BY name").all();
        return {
          content: [{
            type: "text",
            text: projects.length > 0
              ? JSON.stringify(projects, null, 2)
              : "No projects found. Use create_project to add one.",
          }],
        };
      }

      // -----------------------------------------------------------------------
      // FIND PROJECT BY PATH
      // -----------------------------------------------------------------------
      case "find_project_by_path": {
        const error = validateRequired(args, ["path"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { path } = args;
        const projects = db.prepare("SELECT * FROM projects").all();

        // Find project where paths match (either direction for subdirectories)
        const matchingProject = projects.find(
          (p) => path.startsWith(p.path) || p.path.startsWith(path)
        );

        if (matchingProject) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(matchingProject, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `No project found for path: ${path}\n\nUse create_project to register this directory.`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // CREATE PROJECT
      // -----------------------------------------------------------------------
      case "create_project": {
        const error = validateRequired(args, ["name", "path"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { name: projectName, path, color } = args;

        // Check if path exists on filesystem
        if (!existsSync(path)) {
          return {
            content: [{ type: "text", text: `Directory does not exist: ${path}` }],
            isError: true,
          };
        }

        // Check if project with this path already exists
        const existing = db.prepare("SELECT * FROM projects WHERE path = ?").get(path);
        if (existing) {
          return {
            content: [{
              type: "text",
              text: `Project already exists at this path:\n\n${JSON.stringify(existing, null, 2)}`,
            }],
          };
        }

        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          "INSERT INTO projects (id, name, path, color, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(id, projectName.trim(), path, color || null, now);

        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
        log.info(`Created project: ${projectName} at ${path}`);

        return {
          content: [{
            type: "text",
            text: `Project created!\n\n${JSON.stringify(project, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // CREATE TICKET
      // -----------------------------------------------------------------------
      case "create_ticket": {
        const error = validateRequired(args, ["projectId", "title"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId, title, description, priority, epicId, tags } = args;

        // Validate priority if provided
        if (priority) {
          const priorityError = validateEnum(priority, ["low", "medium", "high"], "priority");
          if (priorityError) {
            return { content: [{ type: "text", text: priorityError }], isError: true };
          }
        }

        // Verify project exists
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
          return {
            content: [{ type: "text", text: `Project not found: ${projectId}\n\nUse list_projects to see available projects.` }],
            isError: true,
          };
        }

        // Verify epic exists if provided
        if (epicId) {
          const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId);
          if (!epic) {
            return {
              content: [{ type: "text", text: `Epic not found: ${epicId}\n\nUse list_epics to see available epics.` }],
              isError: true,
            };
          }
        }

        // Get max position in backlog
        const maxPos = db.prepare(
          "SELECT MAX(position) as maxPos FROM tickets WHERE project_id = ? AND status = 'backlog'"
        ).get(projectId);
        const position = (maxPos?.maxPos ?? 0) + 1;

        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, tags, created_at, updated_at)
           VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          title.trim(),
          description?.trim() || null,
          priority || null,
          position,
          projectId,
          epicId || null,
          tags ? JSON.stringify(tags) : null,
          now,
          now
        );

        const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
        log.info(`Created ticket: ${title} in project ${project.name}`);

        return {
          content: [{
            type: "text",
            text: `Ticket created in "${project.name}"!\n\n${JSON.stringify(ticket, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LIST TICKETS
      // -----------------------------------------------------------------------
      case "list_tickets": {
        const { projectId, status, limit = 20 } = args;

        // Validate status if provided
        if (status) {
          const statusError = validateEnum(status, ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"], "status");
          if (statusError) {
            return { content: [{ type: "text", text: statusError }], isError: true };
          }
        }

        let query = "SELECT t.*, p.name as project_name FROM tickets t JOIN projects p ON t.project_id = p.id WHERE 1=1";
        const params = [];

        if (projectId) {
          query += " AND t.project_id = ?";
          params.push(projectId);
        }
        if (status) {
          query += " AND t.status = ?";
          params.push(status);
        }

        query += " ORDER BY t.created_at DESC LIMIT ?";
        params.push(Math.min(limit, 100)); // Cap at 100

        const tickets = db.prepare(query).all(...params);

        return {
          content: [{
            type: "text",
            text: tickets.length > 0
              ? JSON.stringify(tickets, null, 2)
              : "No tickets found matching the criteria.",
          }],
        };
      }

      // -----------------------------------------------------------------------
      // UPDATE TICKET STATUS
      // -----------------------------------------------------------------------
      case "update_ticket_status": {
        const error = validateRequired(args, ["ticketId", "status"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, status } = args;

        // Validate status
        const statusError = validateEnum(status, ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"], "status");
        if (statusError) {
          return { content: [{ type: "text", text: statusError }], isError: true };
        }

        const existing = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        if (!existing) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        const now = new Date().toISOString();
        const completedAt = status === "done" ? now : null;

        db.prepare(
          "UPDATE tickets SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?"
        ).run(status, now, completedAt, ticketId);

        const updated = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        log.info(`Updated ticket ${ticketId} status: ${existing.status} -> ${status}`);

        return {
          content: [{
            type: "text",
            text: `Ticket status updated: ${existing.status} -> ${status}\n\n${JSON.stringify(updated, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LIST EPICS
      // -----------------------------------------------------------------------
      case "list_epics": {
        const error = validateRequired(args, ["projectId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId } = args;

        // Verify project exists
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
          return {
            content: [{ type: "text", text: `Project not found: ${projectId}` }],
            isError: true,
          };
        }

        const epics = db.prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY title").all(projectId);

        return {
          content: [{
            type: "text",
            text: epics.length > 0
              ? JSON.stringify(epics, null, 2)
              : `No epics found for project "${project.name}". Use create_epic to add one.`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // CREATE EPIC
      // -----------------------------------------------------------------------
      case "create_epic": {
        const error = validateRequired(args, ["projectId", "title"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId, title, description, color } = args;

        // Verify project exists
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
          return {
            content: [{ type: "text", text: `Project not found: ${projectId}` }],
            isError: true,
          };
        }

        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, title.trim(), description?.trim() || null, projectId, color || null, now);

        const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(id);
        log.info(`Created epic: ${title} in project ${project.name}`);

        return {
          content: [{
            type: "text",
            text: `Epic created in "${project.name}"!\n\n${JSON.stringify(epic, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // ADD TICKET COMMENT
      // -----------------------------------------------------------------------
      case "add_ticket_comment": {
        const error = validateRequired(args, ["ticketId", "content", "author"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, content, author, type = "comment" } = args;

        // Validate author
        const authorError = validateEnum(author, ["claude", "ralph", "user"], "author");
        if (authorError) {
          return { content: [{ type: "text", text: authorError }], isError: true };
        }

        // Validate type
        const typeError = validateEnum(type, ["comment", "work_summary", "test_report"], "type");
        if (typeError) {
          return { content: [{ type: "text", text: typeError }], isError: true };
        }

        // Verify ticket exists
        const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, ticketId, content.trim(), author, type, now);

        const comment = db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get(id);
        log.info(`Added ${type} to ticket ${ticketId} by ${author}`);

        return {
          content: [{
            type: "text",
            text: `Comment added to ticket "${ticket.title}"!\n\n${JSON.stringify(comment, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET TICKET COMMENTS
      // -----------------------------------------------------------------------
      case "get_ticket_comments": {
        const error = validateRequired(args, ["ticketId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId } = args;

        // Verify ticket exists
        const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        const comments = db.prepare(
          "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC"
        ).all(ticketId);

        return {
          content: [{
            type: "text",
            text: comments.length > 0
              ? JSON.stringify(comments, null, 2)
              : `No comments found for ticket "${ticket.title}".`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // START TICKET WORK
      // -----------------------------------------------------------------------
      case "start_ticket_work": {
        const error = validateRequired(args, ["ticketId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId } = args;

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Check if ticket is already in progress
        if (ticket.status === "in_progress") {
          return {
            content: [{
              type: "text",
              text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}`,
            }],
          };
        }

        // Check if project path exists
        if (!existsSync(ticket.project_path)) {
          return {
            content: [{
              type: "text",
              text: `Project path does not exist: ${ticket.project_path}`,
            }],
            isError: true,
          };
        }

        // Check if it's a git repository
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (!gitCheck.success) {
          return {
            content: [{
              type: "text",
              text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init`,
            }],
            isError: true,
          };
        }

        // Generate branch name
        const branchName = generateBranchName(ticketId, ticket.title);

        // Check if branch already exists
        const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, ticket.project_path);

        let branchCreated = false;
        if (!branchExists.success) {
          // Branch doesn't exist, create it
          const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
          if (!createBranch.success) {
            return {
              content: [{
                type: "text",
                text: `Failed to create branch ${branchName}: ${createBranch.error}`,
              }],
              isError: true,
            };
          }
          branchCreated = true;
        } else {
          // Branch exists, check it out
          const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
          if (!checkoutBranch.success) {
            return {
              content: [{
                type: "text",
                text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}`,
              }],
              isError: true,
            };
          }
        }

        // Update ticket status to in_progress
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?"
        ).run(now, ticketId);

        // Get updated ticket
        const updatedTicket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        log.info(`Started work on ticket ${ticketId}: branch ${branchName}`);

        return {
          content: [{
            type: "text",
            text: `Started work on ticket!

Branch: ${branchName}
${branchCreated ? "Created new branch" : "Checked out existing branch"}

Project: ${updatedTicket.project_name}
Path: ${updatedTicket.project_path}

Ticket:
${JSON.stringify(updatedTicket, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // COMPLETE TICKET WORK
      // -----------------------------------------------------------------------
      case "complete_ticket_work": {
        const error = validateRequired(args, ["ticketId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, summary } = args;

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Check if ticket is in a valid state to complete
        if (ticket.status === "done") {
          return {
            content: [{
              type: "text",
              text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}`,
            }],
          };
        }

        if (ticket.status === "review") {
          return {
            content: [{
              type: "text",
              text: `Ticket is already in review.\n\n${JSON.stringify(ticket, null, 2)}`,
            }],
          };
        }

        // Try to get git commits for this ticket's branch
        let commitsInfo = "";
        let prDescription = "";

        if (existsSync(ticket.project_path)) {
          const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);

          if (gitCheck.success) {
            // Get current branch
            const branchResult = runGitCommand("git branch --show-current", ticket.project_path);
            const currentBranch = branchResult.success ? branchResult.output : "unknown";

            // Get commits on this branch (compared to main/master)
            // Try main first, then master
            let baseBranch = "main";
            const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", ticket.project_path);
            if (!mainExists.success) {
              const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", ticket.project_path);
              if (masterExists.success) {
                baseBranch = "master";
              }
            }

            // Get commit log
            const commitsResult = runGitCommand(
              `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
              ticket.project_path
            );

            if (commitsResult.success && commitsResult.output) {
              commitsInfo = commitsResult.output;

              // Generate PR description
              const commitLines = commitsInfo.split("\n").filter(l => l.trim());
              prDescription = `## Summary
${summary || ticket.title}

## Changes
${commitLines.map(c => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}

## Ticket
- ID: ${shortId(ticketId)}
- Title: ${ticket.title}
`;
            }
          }
        }

        // Update ticket status to review
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET status = 'review', updated_at = ? WHERE id = ?"
        ).run(now, ticketId);

        // Get updated ticket
        const updatedTicket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        log.info(`Completed work on ticket ${ticketId}, moved to review`);

        // Detect environment for context reset guidance
        const environment = detectEnvironment();

        // Build context reset guidance based on environment
        let contextResetGuidance = "";
        if (environment === "claude-code") {
          contextResetGuidance = `
## Context Reset Required

This ticket has been completed. To ensure fresh perspective on the next task:

**For Claude Code:**
- Run \`/clear\` command to reset conversation context
- Or start a new conversation session

**Why?** Each ticket should be worked on with clean context to avoid:
- Accumulated assumptions from previous work
- Stale mental models that don't apply
- Potential bugs from mixing contexts

**Next steps:**
1. Push your changes if not already done
2. Create a PR if needed
3. Clear context with \`/clear\`
4. Pick up the next ticket from Brain Dumpy`;
        } else if (environment === "vscode") {
          contextResetGuidance = `
## Context Reset Required

This ticket has been completed. To ensure fresh perspective on the next task:

**For VS Code:**
- Click "New Chat" or press Cmd/Ctrl+L to start fresh
- Close the current chat panel and open a new one

**Why?** Each ticket should be worked on with clean context to avoid:
- Accumulated assumptions from previous work
- Stale mental models that don't apply
- Potential bugs from mixing contexts

**Next steps:**
1. Push your changes if not already done
2. Create a PR if needed
3. Start a new chat session
4. Pick up the next ticket from Brain Dumpy`;
        } else {
          contextResetGuidance = `
## Context Reset Required

This ticket has been completed. To ensure fresh perspective on the next task:

**Fresh Eyes Workflow:**
- Start a new conversation/chat session
- Clear any accumulated context from this task

**Why?** Each ticket should be worked on with clean context to avoid:
- Accumulated assumptions from previous work
- Stale mental models that don't apply
- Potential bugs from mixing contexts

**Next steps:**
1. Push your changes if not already done
2. Create a PR if needed
3. Start fresh context (new conversation/session)
4. Pick up the next ticket from Brain Dumpy`;
        }

        return {
          content: [{
            type: "text",
            text: `Ticket moved to review!

Project: ${updatedTicket.project_name}
Status: ${updatedTicket.status}

${commitsInfo ? `Commits:\n${commitsInfo}\n` : ""}
${prDescription ? `Suggested PR Description:\n\`\`\`\n${prDescription}\`\`\`\n` : ""}
Ticket:
${JSON.stringify(updatedTicket, null, 2)}
${contextResetGuidance}

---
clearContext: true
environment: ${environment}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LINK COMMIT TO TICKET
      // -----------------------------------------------------------------------
      case "link_commit_to_ticket": {
        const error = validateRequired(args, ["ticketId", "commitHash"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, commitHash, message } = args;

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Try to get commit message if not provided
        let commitMessage = message || "";
        if (!commitMessage && existsSync(ticket.project_path)) {
          const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
          if (gitCheck.success) {
            const msgResult = runGitCommand(
              `git log -1 --format=%s ${commitHash} 2>/dev/null`,
              ticket.project_path
            );
            if (msgResult.success && msgResult.output) {
              commitMessage = msgResult.output;
            }
          }
        }

        // Parse existing linked commits
        let linkedCommits = [];
        if (ticket.linked_commits) {
          try {
            linkedCommits = JSON.parse(ticket.linked_commits);
          } catch {
            linkedCommits = [];
          }
        }

        // Check if commit already linked
        const alreadyLinked = linkedCommits.some(c => c.hash === commitHash || c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash));
        if (alreadyLinked) {
          return {
            content: [{
              type: "text",
              text: `Commit ${commitHash} is already linked to this ticket.\n\nLinked commits:\n${JSON.stringify(linkedCommits, null, 2)}`,
            }],
          };
        }

        // Add new commit
        const newCommit = {
          hash: commitHash,
          message: commitMessage,
          linkedAt: new Date().toISOString(),
        };
        linkedCommits.push(newCommit);

        // Update ticket
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?"
        ).run(JSON.stringify(linkedCommits), now, ticketId);

        log.info(`Linked commit ${commitHash} to ticket ${ticketId}`);

        return {
          content: [{
            type: "text",
            text: `Commit linked to ticket "${ticket.title}"!

Commit: ${commitHash}
Message: ${commitMessage || "(no message)"}

All linked commits (${linkedCommits.length}):
${linkedCommits.map(c => `- ${c.hash.substring(0, 8)}: ${c.message || "(no message)"}`).join("\n")}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LINK FILES TO TICKET
      // -----------------------------------------------------------------------
      case "link_files_to_ticket": {
        const error = validateRequired(args, ["ticketId", "files"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, files } = args;

        // Validate files is an array
        if (!Array.isArray(files)) {
          return {
            content: [{ type: "text", text: "files must be an array of file paths" }],
            isError: true,
          };
        }

        if (files.length === 0) {
          return {
            content: [{ type: "text", text: "files array cannot be empty" }],
            isError: true,
          };
        }

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Parse existing linked files
        let linkedFiles = [];
        if (ticket.linked_files) {
          try {
            linkedFiles = JSON.parse(ticket.linked_files);
          } catch {
            linkedFiles = [];
          }
        }

        // Normalize and add new files (avoid duplicates)
        const newFiles = [];
        for (const file of files) {
          // Normalize the path - convert to relative if it starts with project path
          let normalizedPath = file;
          if (file.startsWith(ticket.project_path)) {
            normalizedPath = file.substring(ticket.project_path.length).replace(/^\//, "");
          }

          // Check if already linked
          if (!linkedFiles.includes(normalizedPath)) {
            linkedFiles.push(normalizedPath);
            newFiles.push(normalizedPath);
          }
        }

        // Update ticket
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET linked_files = ?, updated_at = ? WHERE id = ?"
        ).run(JSON.stringify(linkedFiles), now, ticketId);

        log.info(`Linked ${newFiles.length} files to ticket ${ticketId}`);

        return {
          content: [{
            type: "text",
            text: `Files linked to ticket "${ticket.title}"!

New files added: ${newFiles.length}
${newFiles.length > 0 ? newFiles.map(f => `  + ${f}`).join("\n") : "  (all files were already linked)"}

All linked files (${linkedFiles.length}):
${linkedFiles.map(f => `  - ${f}`).join("\n")}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET TICKETS FOR FILE
      // -----------------------------------------------------------------------
      case "get_tickets_for_file": {
        const error = validateRequired(args, ["filePath"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { filePath, projectId } = args;

        // Normalize the search path (remove leading slash if present)
        const searchPath = filePath.replace(/^\//, "");

        // Build query
        let query = `
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.linked_files IS NOT NULL
        `;
        const params = [];

        if (projectId) {
          query += " AND t.project_id = ?";
          params.push(projectId);
        }

        const allTickets = db.prepare(query).all(...params);

        // Filter tickets that have the file linked (partial matching)
        const matchingTickets = allTickets.filter(ticket => {
          try {
            const linkedFiles = JSON.parse(ticket.linked_files);
            return linkedFiles.some(f =>
              f.includes(searchPath) || searchPath.includes(f)
            );
          } catch {
            return false;
          }
        });

        if (matchingTickets.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No tickets found with file: ${filePath}\n\nTip: Use link_files_to_ticket to associate files with tickets.`,
            }],
          };
        }

        // Format results
        const results = matchingTickets.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          project: t.project_name,
          linkedFiles: JSON.parse(t.linked_files),
        }));

        log.info(`Found ${matchingTickets.length} tickets for file ${filePath}`);

        return {
          content: [{
            type: "text",
            text: `Found ${matchingTickets.length} ticket(s) for file "${filePath}":

${results.map(t => `## ${t.title}
- ID: ${t.id}
- Status: ${t.status}
- Priority: ${t.priority || "none"}
- Project: ${t.project}
- Linked files: ${t.linkedFiles.join(", ")}`).join("\n\n")}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET DATABASE HEALTH
      // -----------------------------------------------------------------------
      case "get_database_health": {
        const issues = [];
        let status = "healthy";

        // Database path and size
        const actualDbPath = getDbPath();
        let dbSize = 0;
        let dbSizeFormatted = "unknown";

        if (existsSync(actualDbPath)) {
          try {
            const stats = statSync(actualDbPath);
            dbSize = stats.size;
            if (dbSize < 1024) {
              dbSizeFormatted = `${dbSize} B`;
            } else if (dbSize < 1024 * 1024) {
              dbSizeFormatted = `${(dbSize / 1024).toFixed(1)} KB`;
            } else {
              dbSizeFormatted = `${(dbSize / (1024 * 1024)).toFixed(1)} MB`;
            }
          } catch (e) {
            issues.push(`Could not read database size: ${e.message}`);
            status = "warning";
          }
        } else {
          issues.push("Database file not found");
          status = "error";
        }

        // Integrity check
        let integrityCheck = "unknown";
        try {
          const result = db.pragma("integrity_check(1)");
          integrityCheck = result[0]?.integrity_check === "ok" ? "ok" : "failed";
          if (integrityCheck !== "ok") {
            issues.push("Database integrity check failed");
            status = "error";
          }
        } catch (e) {
          integrityCheck = "error";
          issues.push(`Integrity check error: ${e.message}`);
          status = "error";
        }

        // Backup info
        const backups = listBackups();
        const lastBackup = backups.length > 0 ? backups[0] : null;

        // Lock file info
        const lockCheck = checkLock();
        const lockInfo = {
          exists: lockCheck.isLocked || lockCheck.isStale,
          ...(lockCheck.lockInfo ? {
            pid: lockCheck.lockInfo.pid,
            type: lockCheck.lockInfo.type,
            startedAt: lockCheck.lockInfo.startedAt,
          } : {}),
          isStale: lockCheck.isStale,
        };

        if (lockCheck.isStale) {
          issues.push("Stale lock file detected (from crashed process)");
          if (status !== "error") status = "warning";
        }

        // WAL file check
        const walPath = actualDbPath + "-wal";
        const shmPath = actualDbPath + "-shm";
        const hasWal = existsSync(walPath);
        const hasShm = existsSync(shmPath);
        let walSize = 0;
        if (hasWal) {
          try {
            walSize = statSync(walPath).size;
            if (walSize > 10 * 1024 * 1024) { // > 10MB
              issues.push(`WAL file is large (${(walSize / (1024 * 1024)).toFixed(1)} MB) - consider checkpointing`);
              if (status !== "error") status = "warning";
            }
          } catch { /* ignore */ }
        }

        // Count stats
        let projectCount = 0;
        let epicCount = 0;
        let ticketCount = 0;
        try {
          projectCount = db.prepare("SELECT COUNT(*) as count FROM projects").get()?.count || 0;
          epicCount = db.prepare("SELECT COUNT(*) as count FROM epics").get()?.count || 0;
          ticketCount = db.prepare("SELECT COUNT(*) as count FROM tickets").get()?.count || 0;
        } catch (e) {
          issues.push(`Could not count records: ${e.message}`);
        }

        const health = {
          status,
          databasePath: actualDbPath,
          databaseSize: dbSizeFormatted,
          integrityCheck,
          stats: {
            projects: projectCount,
            epics: epicCount,
            tickets: ticketCount,
          },
          backup: {
            lastBackup: lastBackup ? lastBackup.date : null,
            backupCount: backups.length,
            backupsDir: getBackupsDir(),
          },
          wal: {
            walExists: hasWal,
            shmExists: hasShm,
            walSize: walSize > 0 ? `${(walSize / 1024).toFixed(1)} KB` : null,
          },
          lockFile: lockInfo,
          issues,
        };

        log.info(`Database health check: ${status}`);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(health, null, 2),
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET ENVIRONMENT
      // -----------------------------------------------------------------------
      case "get_environment": {
        const envInfo = getEnvironmentInfo();

        // Try to auto-detect project from workspace path
        let detectedProject = null;
        if (envInfo.workspacePath) {
          const projects = db.prepare("SELECT * FROM projects").all();

          // Find project where paths match (either direction for subdirectories)
          detectedProject = projects.find(
            (p) => envInfo.workspacePath.startsWith(p.path) || p.path.startsWith(envInfo.workspacePath)
          ) || null;
        }

        const result = {
          environment: envInfo.environment,
          workspacePath: envInfo.workspacePath,
          detectedProject,
          envVarsDetected: envInfo.envVarsDetected,
        };

        log.info(`Environment detected: ${envInfo.environment}`);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET PROJECT SETTINGS
      // -----------------------------------------------------------------------
      case "get_project_settings": {
        const error = validateRequired(args, ["projectId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId } = args;

        // Get project
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
          return {
            content: [{ type: "text", text: `Project not found: ${projectId}` }],
            isError: true,
          };
        }

        // Get detected environment
        const detectedEnvironment = detectEnvironment();

        // Get working method (default to 'auto' if not set)
        const workingMethod = project.working_method || "auto";

        // Compute effective environment
        let effectiveEnvironment;
        if (workingMethod === "auto") {
          effectiveEnvironment = detectedEnvironment;
        } else if (workingMethod === "claude-code" || workingMethod === "vscode") {
          effectiveEnvironment = workingMethod;
        } else {
          // Invalid value, fall back to detected
          effectiveEnvironment = detectedEnvironment;
        }

        const result = {
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          workingMethod,
          effectiveEnvironment,
          detectedEnvironment,
        };

        log.info(`Got settings for project ${project.name}: workingMethod=${workingMethod}, effective=${effectiveEnvironment}`);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      // -----------------------------------------------------------------------
      // UPDATE PROJECT SETTINGS
      // -----------------------------------------------------------------------
      case "update_project_settings": {
        const error = validateRequired(args, ["projectId", "workingMethod"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId, workingMethod } = args;

        // Validate workingMethod
        const validWorkingMethods = ["auto", "claude-code", "vscode"];
        const workingMethodError = validateEnum(workingMethod, validWorkingMethods, "workingMethod");
        if (workingMethodError) {
          return { content: [{ type: "text", text: workingMethodError }], isError: true };
        }

        // Get project
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
          return {
            content: [{ type: "text", text: `Project not found: ${projectId}` }],
            isError: true,
          };
        }

        // Update working_method
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE projects SET working_method = ?, updated_at = ? WHERE id = ?"
        ).run(workingMethod, now, projectId);

        // Get updated project
        const updatedProject = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);

        // Get detected environment
        const detectedEnvironment = detectEnvironment();

        // Compute effective environment
        let effectiveEnvironment;
        if (workingMethod === "auto") {
          effectiveEnvironment = detectedEnvironment;
        } else if (workingMethod === "claude-code" || workingMethod === "vscode") {
          effectiveEnvironment = workingMethod;
        } else {
          effectiveEnvironment = detectedEnvironment;
        }

        const result = {
          projectId: updatedProject.id,
          projectName: updatedProject.name,
          projectPath: updatedProject.path,
          workingMethod: updatedProject.working_method,
          effectiveEnvironment,
          detectedEnvironment,
        };

        log.info(`Updated settings for project ${project.name}: workingMethod=${workingMethod}`);

        return {
          content: [{
            type: "text",
            text: `Project settings updated!\n\n${JSON.stringify(result, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // UNKNOWN TOOL
      // -----------------------------------------------------------------------
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    log.error(`Tool ${name} failed`, error);
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server started successfully");
}

main().catch((error) => {
  log.error("Fatal error starting server", error);
  process.exit(1);
});
