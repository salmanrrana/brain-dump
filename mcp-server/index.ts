#!/usr/bin/env tsx

/**
 * Brain Dump MCP Server
 *
 * Provides tools for managing tickets in Brain Dump from any project.
 * Uses the modern McpServer API with Zod schema validation.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { unlinkSync } from "fs";
import type Database from "better-sqlite3";

// Lib modules
import { log } from "./lib/logging.js";
import { initDatabase } from "./lib/database.js";
import { acquireLock, releaseLock, readLockFile } from "./lib/lock.js";
import { performDailyBackupSync } from "./lib/backup.js";
import { detectEnvironment, getEnvironmentInfo } from "./lib/environment.js";
import { getLockFilePath } from "./lib/xdg.js";

// Tool registration modules
import { registerProjectTools } from "./tools/projects.js";
import { registerTicketTools } from "./tools/tickets.js";
import { registerEpicTools } from "./tools/epics.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerWorkflowTools } from "./tools/workflow.js";
import { registerGitTools } from "./tools/git.js";
import { registerFileTools } from "./tools/files.js";
import { registerHealthTools } from "./tools/health.js";
import { registerEventTools } from "./tools/events.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerTelemetryTools } from "./tools/telemetry.js";
import { registerClaudeTasksTools } from "./tools/claude-tasks.js";
import { registerReviewFindingsTools } from "./tools/review-findings.js";
import { registerDemoTools } from "./tools/demo.js";
import { registerLearningsTools } from "./tools/learnings.js";

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================
let db: Database.Database;
let actualDbPath: string;

try {
  const result = initDatabase();
  db = result.db;
  actualDbPath = result.actualDbPath;

  // Perform daily backup maintenance
  try {
    const backupResult = performDailyBackupSync(actualDbPath);
    if (backupResult.backup.created) log.info(backupResult.backup.message);
    if (backupResult.cleanup.deleted > 0) log.info(backupResult.cleanup.message);
  } catch (backupError) {
    log.error("Backup maintenance failed", backupError as Error);
  }

  // Acquire lock file
  acquireLock("mcp-server");

  log.info("Brain Dump MCP server initialized");
} catch (error) {
  log.error("Failed to initialize database", error as Error);
  process.exit(1);
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================
function setupGracefulShutdown(): void {
  const cleanup = (): void => {
    releaseLock();
    db?.close();
  };

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("exit", () => {
    const lockInfo = readLockFile();
    if (lockInfo && lockInfo.pid === process.pid) {
      try {
        unlinkSync(getLockFilePath());
      } catch (err) {
        console.error(`[brain-dump] Failed to clean lock file: ${(err as Error).message}`);
      }
    }
  });
}

setupGracefulShutdown();

// =============================================================================
// MCP SERVER SETUP
// =============================================================================
const server = new McpServer({
  name: "brain-dump",
  version: "1.0.0",
});

// Register all tool modules
registerProjectTools(server, db);
registerTicketTools(server, db);
registerEpicTools(server, db);
registerCommentTools(server, db);
registerWorkflowTools(server, db, detectEnvironment);
registerGitTools(server, db);
registerFileTools(server, db);
registerHealthTools(server, db, detectEnvironment, getEnvironmentInfo);
registerEventTools(server, db);
registerSessionTools(server, db);
registerConversationTools(server, db, detectEnvironment);
registerTelemetryTools(server, db, detectEnvironment);
registerClaudeTasksTools(server, db);
registerReviewFindingsTools(server, db);
registerDemoTools(server, db);
registerLearningsTools(server, db);

// =============================================================================
// CONNECT AND START
// =============================================================================
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    log.info("Brain Dump MCP server connected");
  })
  .catch((error: unknown) => {
    log.error("Failed to connect MCP server", error as Error);
    process.exit(1);
  });
