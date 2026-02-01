/**
 * Health and settings tools for Brain Dump MCP server.
 * @module tools/health
 */
import { z } from "zod";
import { existsSync, statSync } from "fs";
import { log } from "../lib/logging.js";
import { getDbPath, getBackupsDir } from "../lib/xdg.js";
import { listBackups } from "../lib/backup.js";
import { checkLock } from "../lib/lock.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";

const WORKING_METHODS = ["auto", "claude-code", "vscode"] as const;

/** Row shape for a project from the database */
interface ProjectRow {
  id: string;
  name: string;
  path: string;
  working_method: string | null;
}

/** Shape returned by integrity_check pragma */
interface IntegrityCheckRow {
  integrity_check: string;
}

/** Shape returned by COUNT(*) queries */
interface CountRow {
  count: number;
}

/** Environment detection function signature */
type DetectEnvironmentFn = () => string;

/** Environment info returned by getEnvironmentInfo */
interface EnvironmentInfoResult {
  environment: string;
  workspacePath: string | null;
  envVarsDetected: string[];
}

/** Full environment info function signature */
type GetEnvironmentInfoFn = () => EnvironmentInfoResult;

/**
 * Register health and settings tools with the MCP server.
 */
export function registerHealthTools(
  server: McpServer,
  db: Database.Database,
  detectEnvironment: DetectEnvironmentFn,
  getEnvironmentInfo: GetEnvironmentInfoFn
): void {
  // Get database health
  server.tool(
    "get_database_health",
    `Get database health and backup status.

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
    {},
    async () => {
      const issues: string[] = [];
      let status: "healthy" | "warning" | "error" = "healthy";

      const actualDbPath = getDbPath();
      let dbSizeFormatted = "unknown";

      if (existsSync(actualDbPath)) {
        try {
          const stats = statSync(actualDbPath);
          const dbSize = stats.size;
          if (dbSize < 1024) dbSizeFormatted = `${dbSize} B`;
          else if (dbSize < 1024 * 1024) dbSizeFormatted = `${(dbSize / 1024).toFixed(1)} KB`;
          else dbSizeFormatted = `${(dbSize / (1024 * 1024)).toFixed(1)} MB`;
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          issues.push(`Could not read database size: ${errorMsg}`);
          status = "warning";
        }
      } else {
        issues.push("Database file not found");
        status = "error";
      }

      let integrityCheck = "unknown";
      try {
        const result = db.pragma("integrity_check(1)") as IntegrityCheckRow[];
        integrityCheck = result[0]?.integrity_check === "ok" ? "ok" : "failed";
        if (integrityCheck !== "ok") {
          issues.push("Database integrity check failed");
          status = "error";
        }
      } catch (e) {
        integrityCheck = "error";
        const errorMsg = e instanceof Error ? e.message : String(e);
        issues.push(`Integrity check error: ${errorMsg}`);
        status = "error";
      }

      const backups = listBackups();
      const lastBackup = backups.length > 0 ? backups[0] : null;

      const lockCheck = checkLock();
      const lockInfo: Record<string, unknown> = {
        exists: lockCheck.isLocked || lockCheck.isStale,
        ...(lockCheck.lockInfo
          ? {
              pid: lockCheck.lockInfo.pid,
              type: lockCheck.lockInfo.type,
              startedAt: lockCheck.lockInfo.startedAt,
            }
          : {}),
        isStale: lockCheck.isStale,
      };

      if (lockCheck.isStale) {
        issues.push("Stale lock file detected (from crashed process)");
        if (status !== "error") status = "warning";
      }

      const walPath = actualDbPath + "-wal";
      const shmPath = actualDbPath + "-shm";
      const hasWal = existsSync(walPath);
      const hasShm = existsSync(shmPath);
      let walSize = 0;
      if (hasWal) {
        try {
          walSize = statSync(walPath).size;
          if (walSize > 10 * 1024 * 1024) {
            issues.push(
              `WAL file is large (${(walSize / (1024 * 1024)).toFixed(1)} MB) - consider checkpointing`
            );
            if (status !== "error") status = "warning";
          }
        } catch {
          /* ignore */
        }
      }

      let projectCount = 0,
        epicCount = 0,
        ticketCount = 0;
      try {
        projectCount =
          (db.prepare("SELECT COUNT(*) as count FROM projects").get() as CountRow | undefined)
            ?.count ?? 0;
        epicCount =
          (db.prepare("SELECT COUNT(*) as count FROM epics").get() as CountRow | undefined)
            ?.count ?? 0;
        ticketCount =
          (db.prepare("SELECT COUNT(*) as count FROM tickets").get() as CountRow | undefined)
            ?.count ?? 0;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        issues.push(`Could not count records: ${errorMsg}`);
      }

      const health = {
        status,
        databasePath: actualDbPath,
        databaseSize: dbSizeFormatted,
        integrityCheck,
        stats: { projects: projectCount, epics: epicCount, tickets: ticketCount },
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
      return { content: [{ type: "text", text: JSON.stringify(health) }] };
    }
  );

  // Get environment
  server.tool(
    "get_environment",
    `Get current environment information.

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
    {},
    async () => {
      const envInfo = getEnvironmentInfo();
      let detectedProject: ProjectRow | null = null;
      if (envInfo.workspacePath) {
        const projects = db.prepare("SELECT * FROM projects").all() as ProjectRow[];
        detectedProject =
          projects.find(
            (p) =>
              envInfo.workspacePath!.startsWith(p.path) || p.path.startsWith(envInfo.workspacePath!)
          ) ?? null;
      }

      const result = {
        environment: envInfo.environment,
        workspacePath: envInfo.workspacePath,
        detectedProject,
        envVarsDetected: envInfo.envVarsDetected,
      };

      log.info(`Environment detected: ${envInfo.environment}`);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  // Get project settings
  server.tool(
    "get_project_settings",
    `Get project settings including working method preference.

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
  }`,
    { projectId: z.string().describe("Project ID to get settings for") },
    async ({ projectId }: { projectId: string }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
        | ProjectRow
        | undefined;
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      const detectedEnvironment = detectEnvironment();
      const workingMethod = project.working_method || "auto";

      let effectiveEnvironment: string;
      if (workingMethod === "auto") effectiveEnvironment = detectedEnvironment;
      else if (workingMethod === "claude-code" || workingMethod === "vscode")
        effectiveEnvironment = workingMethod;
      else effectiveEnvironment = detectedEnvironment;

      const result = {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        workingMethod,
        effectiveEnvironment,
        detectedEnvironment,
      };

      log.info(
        `Got settings for project ${project.name}: workingMethod=${workingMethod}, effective=${effectiveEnvironment}`
      );
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  // Update project settings
  server.tool(
    "update_project_settings",
    `Update project settings.

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
    {
      projectId: z.string().describe("Project ID to update settings for"),
      workingMethod: z.enum(WORKING_METHODS).describe("Working method preference"),
    },
    async ({
      projectId,
      workingMethod,
    }: {
      projectId: string;
      workingMethod: (typeof WORKING_METHODS)[number];
    }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
        | ProjectRow
        | undefined;
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      const now = new Date().toISOString();
      db.prepare("UPDATE projects SET working_method = ?, updated_at = ? WHERE id = ?").run(
        workingMethod,
        now,
        projectId
      );

      const updatedProject = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as ProjectRow;
      const detectedEnvironment = detectEnvironment();

      let effectiveEnvironment: string;
      if (workingMethod === "auto") effectiveEnvironment = detectedEnvironment;
      else if (workingMethod === "claude-code" || workingMethod === "vscode")
        effectiveEnvironment = workingMethod;
      else effectiveEnvironment = detectedEnvironment;

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
        content: [{ type: "text", text: `Project settings updated!\n\n${JSON.stringify(result)}` }],
      };
    }
  );
}
