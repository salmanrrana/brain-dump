/**
 * Consolidated admin resource tool for Brain Dump MCP server.
 *
 * Merges 4 health/settings tools into 1 action-dispatched tool.
 * Business logic lives in core/health.ts.
 *
 * @module tools/admin
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult } from "../lib/mcp-format.ts";
import { listBackups } from "../lib/backup.js";
import { checkLock } from "../lib/lock.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import {
  getDatabaseHealth,
  getEnvironment,
  getProjectSettings,
  updateProjectSettings,
} from "../../core/health.ts";
import type { WorkingMethod, EnvironmentDetector } from "../../core/health.ts";

const ACTIONS = ["health", "environment", "settings", "update-settings"] as const;
const WORKING_METHODS = ["auto", "claude-code", "vscode"] as const;

/**
 * Register the consolidated admin tool with the MCP server.
 */
export function registerAdminTool(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: () => string,
  getEnvironmentInfo: () => {
    environment: string;
    workspacePath: string | null;
    envVarsDetected: string[];
  }
): void {
  const healthDeps = { listBackups, checkLock };
  const envDetector: EnvironmentDetector = { detectEnvironment, getEnvironmentInfo };

  server.tool(
    "admin",
    `Brain Dump administration and health monitoring.

## Actions

### health
Get comprehensive database health report including integrity check, backup status, and statistics.
No additional params required.

### environment
Get current environment information (auto-detects Claude Code, VS Code, etc.).
No additional params required.

### settings
Get project settings including working method preference.
Required params: projectId

### update-settings
Update project settings (working method preference).
Required params: projectId, workingMethod

## Parameters
- action: (required) The operation to perform
- projectId: Project ID. Required for: settings, update-settings
- workingMethod: Working method (auto, claude-code, vscode). Required for: update-settings`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      projectId: z.string().optional().describe("Project ID"),
      workingMethod: z.enum(WORKING_METHODS).optional().describe("Working method preference"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      projectId?: string | undefined;
      workingMethod?: (typeof WORKING_METHODS)[number] | undefined;
    }) => {
      try {
        switch (params.action) {
          case "health": {
            const report = getDatabaseHealth(db, healthDeps);
            log.info(`Health check: ${report.status}`);
            return formatResult(report);
          }

          case "environment": {
            const result = getEnvironment(db, envDetector);
            return formatResult(result);
          }

          case "settings": {
            const projectId = requireParam(params.projectId, "projectId", "settings");
            const result = getProjectSettings(db, projectId, detectEnvironment);
            return formatResult(result);
          }

          case "update-settings": {
            const projectId = requireParam(params.projectId, "projectId", "update-settings");
            const workingMethod = requireParam(
              params.workingMethod,
              "workingMethod",
              "update-settings"
            );

            const result = updateProjectSettings(
              db,
              projectId,
              workingMethod as WorkingMethod,
              detectEnvironment
            );

            log.info(`Updated settings for project ${projectId}: workingMethod=${workingMethod}`);
            return formatResult(result, "Project settings updated!");
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`admin/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
