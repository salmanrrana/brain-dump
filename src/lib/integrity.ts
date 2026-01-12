import { existsSync, statSync } from "fs";
import Database from "better-sqlite3";
import { getDatabasePath } from "./xdg";
import { listBackups } from "./backup";

/**
 * Database Integrity Check Module
 *
 * Provides SQLite integrity checks to detect corruption early.
 * Runs quick checks on startup and full checks on demand.
 */

export interface IntegrityCheckResult {
  success: boolean;
  status: "ok" | "warning" | "error";
  message: string;
  details: string[];
}

export interface QuickCheckResult {
  success: boolean;
  status: "ok" | "warning" | "error";
  message: string;
  durationMs: number;
}

export interface FullCheckResult {
  integrityCheck: IntegrityCheckResult;
  foreignKeyCheck: IntegrityCheckResult;
  walCheck: IntegrityCheckResult;
  tableCheck: IntegrityCheckResult;
  overallStatus: "ok" | "warning" | "error";
  durationMs: number;
  suggestions: string[];
}

/**
 * Required tables for Brain Dumpy to function
 */
const REQUIRED_TABLES = ["projects", "epics", "tickets", "settings", "ticket_comments"];

/**
 * Perform a quick integrity check (fast, for startup)
 * Uses PRAGMA integrity_check(1) which stops at first error.
 */
export function quickIntegrityCheck(dbPath?: string): QuickCheckResult {
  const targetPath = dbPath || getDatabasePath();
  const startTime = Date.now();

  if (!existsSync(targetPath)) {
    return {
      success: false,
      status: "error",
      message: `Database not found: ${targetPath}`,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const db = new Database(targetPath, { readonly: true });

    // Quick integrity check - stops at first error
    const result = db.pragma("integrity_check(1)") as { integrity_check: string }[];
    db.close();

    const isOk = result.length === 1 && result[0]?.integrity_check === "ok";
    const durationMs = Date.now() - startTime;

    if (isOk) {
      return {
        success: true,
        status: "ok",
        message: "Database integrity verified",
        durationMs,
      };
    }

    const errorMsg = result[0]?.integrity_check || "Unknown error";
    return {
      success: false,
      status: "error",
      message: `Integrity check failed: ${errorMsg}`,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "error",
      message: `Integrity check error: ${errorMessage}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Perform full integrity check (PRAGMA integrity_check without limit)
 * This checks all pages and can be slow on large databases.
 */
export function fullIntegrityCheck(dbPath?: string): IntegrityCheckResult {
  const targetPath = dbPath || getDatabasePath();

  if (!existsSync(targetPath)) {
    return {
      success: false,
      status: "error",
      message: `Database not found: ${targetPath}`,
      details: [],
    };
  }

  try {
    const db = new Database(targetPath, { readonly: true });

    // Full integrity check
    const result = db.pragma("integrity_check") as { integrity_check: string }[];
    db.close();

    const isOk = result.length === 1 && result[0]?.integrity_check === "ok";

    if (isOk) {
      return {
        success: true,
        status: "ok",
        message: "Full integrity check passed",
        details: [],
      };
    }

    const errors = result.map((r) => r.integrity_check);
    return {
      success: false,
      status: "error",
      message: `Found ${errors.length} integrity issue(s)`,
      details: errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "error",
      message: `Integrity check error: ${errorMessage}`,
      details: [],
    };
  }
}

/**
 * Check foreign key integrity
 */
export function foreignKeyCheck(dbPath?: string): IntegrityCheckResult {
  const targetPath = dbPath || getDatabasePath();

  if (!existsSync(targetPath)) {
    return {
      success: false,
      status: "error",
      message: `Database not found: ${targetPath}`,
      details: [],
    };
  }

  try {
    const db = new Database(targetPath, { readonly: true });

    // Foreign key check returns rows for violations
    const result = db.pragma("foreign_key_check") as {
      table: string;
      rowid: number;
      parent: string;
      fkid: number;
    }[];
    db.close();

    if (result.length === 0) {
      return {
        success: true,
        status: "ok",
        message: "No foreign key violations",
        details: [],
      };
    }

    const violations = result.map(
      (r) => `Table '${r.table}' row ${r.rowid}: missing parent in '${r.parent}'`
    );
    return {
      success: false,
      status: "error",
      message: `Found ${result.length} foreign key violation(s)`,
      details: violations,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "error",
      message: `Foreign key check error: ${errorMessage}`,
      details: [],
    };
  }
}

/**
 * Check WAL file consistency
 */
export function walCheck(dbPath?: string): IntegrityCheckResult {
  const targetPath = dbPath || getDatabasePath();

  if (!existsSync(targetPath)) {
    return {
      success: false,
      status: "error",
      message: `Database not found: ${targetPath}`,
      details: [],
    };
  }

  const walPath = targetPath + "-wal";
  const shmPath = targetPath + "-shm";
  const details: string[] = [];
  let status: "ok" | "warning" | "error" = "ok";

  // Check if WAL exists but SHM doesn't (inconsistent state)
  if (existsSync(walPath) && !existsSync(shmPath)) {
    details.push("WAL file exists without SHM file - possible corruption");
    status = "warning";
  }

  // Check WAL file size
  if (existsSync(walPath)) {
    try {
      const walStats = statSync(walPath);
      const walSizeMB = walStats.size / (1024 * 1024);
      details.push(`WAL file size: ${walSizeMB.toFixed(2)} MB`);

      // Large WAL files might indicate issues
      if (walSizeMB > 100) {
        details.push("Warning: WAL file is unusually large (>100MB)");
        status = "warning";
      }
    } catch {
      details.push("Could not stat WAL file");
    }
  } else {
    details.push("No WAL file present (database may be in rollback mode)");
  }

  try {
    const db = new Database(targetPath, { readonly: true });

    // Check journal mode
    const journalMode = db.pragma("journal_mode") as { journal_mode: string }[];
    const mode = journalMode[0]?.journal_mode || "unknown";
    details.push(`Journal mode: ${mode}`);

    // Get WAL checkpoint info
    if (mode === "wal") {
      const checkpointInfo = db.pragma("wal_checkpoint(PASSIVE)") as {
        busy: number;
        log: number;
        checkpointed: number;
      }[];
      if (checkpointInfo[0]) {
        const info = checkpointInfo[0];
        details.push(`WAL pages: ${info.log} total, ${info.checkpointed} checkpointed`);

        // Large number of uncheckpointed pages might indicate issues
        const uncheckpointed = info.log - info.checkpointed;
        if (uncheckpointed > 10000) {
          details.push(`Warning: ${uncheckpointed} uncheckpointed pages`);
          if (status === "ok") status = "warning";
        }
      }
    }

    db.close();

    return {
      success: true,
      status,
      message: status === "ok" ? "WAL consistency verified" : "WAL check completed with warnings",
      details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "error",
      message: `WAL check error: ${errorMessage}`,
      details,
    };
  }
}

/**
 * Check that expected tables exist
 */
export function tableCheck(dbPath?: string): IntegrityCheckResult {
  const targetPath = dbPath || getDatabasePath();

  if (!existsSync(targetPath)) {
    return {
      success: false,
      status: "error",
      message: `Database not found: ${targetPath}`,
      details: [],
    };
  }

  try {
    const db = new Database(targetPath, { readonly: true });

    // Get all tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));
    db.close();

    const missingTables = REQUIRED_TABLES.filter((t) => !tableNames.has(t));
    const details: string[] = [];

    details.push(`Found ${tableNames.size} table(s)`);

    if (missingTables.length === 0) {
      return {
        success: true,
        status: "ok",
        message: "All required tables present",
        details,
      };
    }

    return {
      success: false,
      status: "error",
      message: `Missing ${missingTables.length} required table(s)`,
      details: [...details, `Missing: ${missingTables.join(", ")}`],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "error",
      message: `Table check error: ${errorMessage}`,
      details: [],
    };
  }
}

/**
 * Perform comprehensive database health check.
 * Runs all checks and provides suggestions for issues found.
 */
export function fullDatabaseCheck(dbPath?: string): FullCheckResult {
  const startTime = Date.now();

  const integrityCheck = fullIntegrityCheck(dbPath);
  const fkCheck = foreignKeyCheck(dbPath);
  const walResult = walCheck(dbPath);
  const tableResult = tableCheck(dbPath);

  const suggestions: string[] = [];

  // Determine overall status
  let overallStatus: "ok" | "warning" | "error" = "ok";

  if (
    integrityCheck.status === "error" ||
    fkCheck.status === "error" ||
    tableResult.status === "error"
  ) {
    overallStatus = "error";
  } else if (
    integrityCheck.status === "warning" ||
    fkCheck.status === "warning" ||
    walResult.status === "warning" ||
    tableResult.status === "warning"
  ) {
    overallStatus = "warning";
  }

  // Generate suggestions based on findings
  if (integrityCheck.status === "error") {
    suggestions.push("Database corruption detected - restore from backup recommended");
    const backups = listBackups();
    if (backups.length > 0 && backups[0]) {
      suggestions.push(`Latest backup: ${backups[0].filename} (${backups[0].date})`);
      suggestions.push("Run: brain-dump restore --latest");
    } else {
      suggestions.push("No backups available - data recovery may be limited");
    }
  }

  if (fkCheck.status === "error") {
    suggestions.push("Foreign key violations found - database has referential integrity issues");
    suggestions.push("This may cause issues with queries and data consistency");
  }

  if (walResult.status === "warning") {
    suggestions.push("WAL status warnings - consider running PRAGMA wal_checkpoint(TRUNCATE)");
  }

  if (tableResult.status === "error") {
    suggestions.push("Missing required tables - database may need to be re-initialized");
    suggestions.push("Try starting Brain Dumpy to auto-create missing tables");
  }

  return {
    integrityCheck,
    foreignKeyCheck: fkCheck,
    walCheck: walResult,
    tableCheck: tableResult,
    overallStatus,
    durationMs: Date.now() - startTime,
    suggestions,
  };
}

/**
 * Perform startup integrity check.
 * This is a quick check designed to run on every startup.
 * Returns true if database is healthy, false if issues detected.
 */
export function startupIntegrityCheck(dbPath?: string): {
  healthy: boolean;
  message: string;
  shouldWarn: boolean;
  suggestRestore: boolean;
} {
  const quickResult = quickIntegrityCheck(dbPath);

  if (quickResult.status === "ok") {
    return {
      healthy: true,
      message: `Database integrity OK (${quickResult.durationMs}ms)`,
      shouldWarn: false,
      suggestRestore: false,
    };
  }

  // Quick check failed - we have a problem
  const backups = listBackups();
  const hasBackups = backups.length > 0;

  return {
    healthy: false,
    message: quickResult.message,
    shouldWarn: true,
    suggestRestore: hasBackups,
  };
}
