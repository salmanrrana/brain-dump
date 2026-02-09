/**
 * Health and settings business logic for the core layer.
 *
 * Extracted from mcp-server/tools/health.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { existsSync, statSync } from "fs";
import type { DbHandle } from "./types.ts";
import { ProjectNotFoundError } from "./errors.ts";
import { getDbPath, getBackupsDir } from "./db.ts";
import type { DbProjectRow } from "./db-rows.ts";

// ============================================
// External Dependencies (injected by callers)
// ============================================

/**
 * Functions that vary between environments.
 * MCP server provides its own implementations; CLI can provide different ones.
 */
export interface HealthDependencies {
  listBackups: () => Array<{ date: string; path: string; size: number }>;
  checkLock: () => {
    isLocked: boolean;
    isStale: boolean;
    lockInfo: { pid: number; type: string; startedAt: string } | null;
  };
}

export interface EnvironmentDetector {
  detectEnvironment: () => string;
  getEnvironmentInfo: () => {
    environment: string;
    workspacePath: string | null;
    envVarsDetected: string[];
  };
}

// ============================================
// Internal Types
// ============================================

interface IntegrityCheckRow {
  integrity_check: string;
}

interface CountRow {
  count: number;
}

// ============================================
// Public Types
// ============================================

export type WorkingMethod =
  | "auto"
  | "claude-code"
  | "vscode"
  | "opencode"
  | "cursor"
  | "copilot-cli"
  | "codex";

export interface HealthReport {
  status: "healthy" | "warning" | "error";
  databasePath: string;
  databaseSize: string;
  integrityCheck: string;
  stats: { projects: number; epics: number; tickets: number };
  backup: {
    lastBackup: string | null;
    backupCount: number;
    backupsDir: string;
  };
  wal: {
    walExists: boolean;
    shmExists: boolean;
    walSize: string | null;
  };
  lockFile: Record<string, unknown>;
  issues: string[];
}

export interface EnvironmentResult {
  environment: string;
  workspacePath: string | null;
  detectedProject: DbProjectRow | null;
  envVarsDetected: string[];
}

export interface ProjectSettingsResult {
  projectId: string;
  projectName: string;
  projectPath: string;
  workingMethod: string;
  effectiveEnvironment: string;
  detectedEnvironment: string;
}

// ============================================
// Internal Helpers
// ============================================

function getProjectOrThrow(db: DbHandle, projectId: string): DbProjectRow {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | DbProjectRow
    | undefined;
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  return project;
}

function resolveEffectiveEnvironment(workingMethod: string, detectedEnvironment: string): string {
  if (workingMethod === "auto") return detectedEnvironment;
  if (
    workingMethod === "claude-code" ||
    workingMethod === "vscode" ||
    workingMethod === "opencode" ||
    workingMethod === "cursor" ||
    workingMethod === "copilot-cli" ||
    workingMethod === "codex"
  ) {
    return workingMethod;
  }
  return detectedEnvironment;
}

// ============================================
// Public API
// ============================================

/**
 * Get comprehensive database health report.
 */
export function getDatabaseHealth(db: DbHandle, deps: HealthDependencies): HealthReport {
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

  const backups = deps.listBackups();
  const lastBackup = backups.length > 0 ? backups[0] : null;

  const lockCheck = deps.checkLock();
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
      (db.prepare("SELECT COUNT(*) as count FROM projects").get() as CountRow | undefined)?.count ??
      0;
    epicCount =
      (db.prepare("SELECT COUNT(*) as count FROM epics").get() as CountRow | undefined)?.count ?? 0;
    ticketCount =
      (db.prepare("SELECT COUNT(*) as count FROM tickets").get() as CountRow | undefined)?.count ??
      0;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    issues.push(`Could not count records: ${errorMsg}`);
  }

  return {
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
}

/**
 * Get current environment information.
 */
export function getEnvironment(db: DbHandle, detector: EnvironmentDetector): EnvironmentResult {
  const envInfo = detector.getEnvironmentInfo();
  let detectedProject: DbProjectRow | null = null;

  if (envInfo.workspacePath) {
    const projects = db.prepare("SELECT * FROM projects").all() as DbProjectRow[];
    detectedProject =
      projects.find(
        (p) =>
          envInfo.workspacePath!.startsWith(p.path) || p.path.startsWith(envInfo.workspacePath!)
      ) ?? null;
  }

  return {
    environment: envInfo.environment,
    workspacePath: envInfo.workspacePath,
    detectedProject,
    envVarsDetected: envInfo.envVarsDetected,
  };
}

/**
 * Get project settings including working method preference.
 */
export function getProjectSettings(
  db: DbHandle,
  projectId: string,
  detectEnvironment: () => string
): ProjectSettingsResult {
  const project = getProjectOrThrow(db, projectId);
  const detectedEnvironment = detectEnvironment();
  const workingMethod = project.working_method || "auto";

  return {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    workingMethod,
    effectiveEnvironment: resolveEffectiveEnvironment(workingMethod, detectedEnvironment),
    detectedEnvironment,
  };
}

/**
 * Update project settings (working method preference).
 */
export function updateProjectSettings(
  db: DbHandle,
  projectId: string,
  workingMethod: WorkingMethod,
  detectEnvironment: () => string
): ProjectSettingsResult {
  const project = getProjectOrThrow(db, projectId);

  db.prepare("UPDATE projects SET working_method = ? WHERE id = ?").run(workingMethod, projectId);

  const detectedEnvironment = detectEnvironment();

  return {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    workingMethod,
    effectiveEnvironment: resolveEffectiveEnvironment(workingMethod, detectedEnvironment),
    detectedEnvironment,
  };
}
