import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync, readFileSync, constants } from "fs";
import { join } from "path";
import { getLegacyDir, getDataDir, getStateDir, ensureDirectoriesSync } from "./xdg";
import Database from "better-sqlite3";

const MIGRATED_MARKER = ".migrated";
const MIGRATION_LOG_FILE = "migration.log";

export interface MigrationResult {
  success: boolean;
  migrated: boolean;
  message: string;
  details?: {
    databaseCopied: boolean;
    attachmentsCopied: number;
    backupCreated: boolean;
    integrityVerified: boolean;
  };
}

export function hasLegacyData(): boolean {
  const legacyDir = getLegacyDir();
  if (!existsSync(legacyDir)) {
    return false;
  }

  const legacyDb = join(legacyDir, "brain-dump.db");
  return existsSync(legacyDb);
}

export function isMigrationComplete(): boolean {
  const legacyDir = getLegacyDir();
  const markerPath = join(legacyDir, MIGRATED_MARKER);
  return existsSync(markerPath);
}

export function hasXdgData(): boolean {
  const xdgDb = join(getDataDir(), "brain-dumpy.db");
  return existsSync(xdgDb);
}

export function verifyDatabaseIntegrity(dbPath: string): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const result = db.pragma("integrity_check") as { integrity_check: string }[];
    db.close();
    return result.length === 1 && result[0]?.integrity_check === "ok";
  } catch (error) {
    console.error(`[Migration] Database integrity check failed: ${error}`);
    return false;
  }
}

function copyFileSafe(src: string, dest: string): boolean {
  try {
    copyFileSync(src, dest, constants.COPYFILE_EXCL);

    const srcStats = statSync(src);
    const destStats = statSync(dest);
    return srcStats.size === destStats.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return true;
    }
    throw error;
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function logMigration(message: string): void {
  const logPath = join(getStateDir(), MIGRATION_LOG_FILE);
  const timestamp = getTimestamp();
  const logEntry = `[${timestamp}] ${message}\n`;

  try {
    const stateDir = getStateDir();
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    }

    const existingContent = existsSync(logPath) ? readFileSync(logPath, "utf-8") : "";
    writeFileSync(logPath, existingContent + logEntry, { mode: 0o600 });
  } catch (error) {
    console.error(`Migration log failed: ${message}`, error);
  }
}

function createPreMigrationBackup(dbPath: string): string | null {
  try {
    const backupsDir = join(getStateDir(), "backups");
    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `pre-migration-${timestamp}.db`;
    const backupPath = join(backupsDir, backupName);

    // Use SQLite backup API for consistency
    const srcDb = new Database(dbPath, { readonly: true });
    srcDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    srcDb.close();

    logMigration(`Created pre-migration backup: ${backupPath}`);
    return backupPath;
  } catch (error) {
    logMigration(`Failed to create pre-migration backup: ${error}`);
    return null;
  }
}

function copyAttachments(legacyDir: string, xdgDataDir: string): number {
  const legacyAttachments = join(legacyDir, "attachments");
  const xdgAttachments = join(xdgDataDir, "attachments");

  if (!existsSync(legacyAttachments)) {
    return 0;
  }

  if (!existsSync(xdgAttachments)) {
    mkdirSync(xdgAttachments, { recursive: true, mode: 0o700 });
  }

  let copiedCount = 0;
  const files = readdirSync(legacyAttachments);

  for (const file of files) {
    const srcPath = join(legacyAttachments, file);
    const destPath = join(xdgAttachments, file);

    if (statSync(srcPath).isFile()) {
      try {
        copyFileSafe(srcPath, destPath);
        copiedCount++;
      } catch (error) {
        logMigration(`Failed to copy attachment ${file}: ${error}`);
      }
    }
  }

  return copiedCount;
}

function createMigrationMarker(legacyDir: string): void {
  const markerPath = join(legacyDir, MIGRATED_MARKER);
  const content = JSON.stringify({
    migratedAt: getTimestamp(),
    migratedTo: getDataDir(),
    note: "Data has been migrated to XDG directories. This directory is preserved for safety. You may delete it after verifying the migration.",
  }, null, 2);

  writeFileSync(markerPath, content, { mode: 0o600 });
}

/**
 * Migrate from legacy to XDG directories. Safe operation that creates backups,
 * verifies integrity, never deletes legacy data, and only runs once.
 */
export async function migrateFromLegacy(): Promise<MigrationResult> {
  logMigration("Starting migration check...");

  if (isMigrationComplete()) {
    logMigration("Migration already complete (marker file exists)");
    return {
      success: true,
      migrated: false,
      message: "Migration already complete",
    };
  }

  // No legacy data?
  if (!hasLegacyData()) {
    logMigration("No legacy data found, skipping migration");
    return {
      success: true,
      migrated: false,
      message: "No legacy data to migrate",
    };
  }

  // XDG already has data?
  if (hasXdgData()) {
    logMigration("XDG location already has data, skipping migration");
    console.warn(
      "[Migration] Both legacy (~/.brain-dump) and XDG (~/.local/share/brain-dumpy) locations have data. " +
      "Using XDG location. You may want to manually merge or remove the legacy data."
    );
    return {
      success: true,
      migrated: false,
      message: "XDG location already has data, using existing XDG database",
    };
  }

  logMigration("Starting migration from legacy directory...");
  console.log("[Migration] Migrating data from ~/.brain-dump to XDG directories...");

  const legacyDir = getLegacyDir();
  const xdgDataDir = getDataDir();
  const legacyDbPath = join(legacyDir, "brain-dump.db");

  const details = {
    databaseCopied: false,
    attachmentsCopied: 0,
    backupCreated: false,
    integrityVerified: false,
  };

  try {
    ensureDirectoriesSync();

    const backupPath = createPreMigrationBackup(legacyDbPath);
    details.backupCreated = backupPath !== null;

    const xdgDbPath = join(xdgDataDir, "brain-dumpy.db");
    logMigration(`Copying database from ${legacyDbPath} to ${xdgDbPath}`);

    copyFileSafe(legacyDbPath, xdgDbPath);
    details.databaseCopied = true;

    const walFile = legacyDbPath + "-wal";
    const shmFile = legacyDbPath + "-shm";
    if (existsSync(walFile)) {
      copyFileSafe(walFile, xdgDbPath + "-wal");
    }
    if (existsSync(shmFile)) {
      copyFileSafe(shmFile, xdgDbPath + "-shm");
    }

    details.integrityVerified = verifyDatabaseIntegrity(xdgDbPath);
    if (!details.integrityVerified) {
      throw new Error("Database integrity check failed after copy");
    }
    logMigration("Database integrity verified at new location");

    details.attachmentsCopied = copyAttachments(legacyDir, xdgDataDir);
    logMigration(`Copied ${details.attachmentsCopied} attachments`);

    createMigrationMarker(legacyDir);
    logMigration("Created migration marker in legacy directory");

    const message = `Migration complete! Database and ${details.attachmentsCopied} attachments migrated to XDG directories.`;
    logMigration(message);
    console.log(`[Migration] ${message}`);
    console.log("[Migration] Legacy data preserved in ~/.brain-dump (not deleted)");

    return {
      success: true,
      migrated: true,
      message,
      details,
    };
  } catch (error) {
    const errorMessage = `Migration failed: ${error}`;
    logMigration(errorMessage);
    console.error(`[Migration] ${errorMessage}`);

    return {
      success: false,
      migrated: false,
      message: errorMessage,
      details,
    };
  }
}

export function migrateFromLegacySync(): MigrationResult {
  if (isMigrationComplete()) {
    return {
      success: true,
      migrated: false,
      message: "Migration already complete",
    };
  }

  if (!hasLegacyData()) {
    return {
      success: true,
      migrated: false,
      message: "No legacy data to migrate",
    };
  }

  if (hasXdgData()) {
    console.warn(
      "[Migration] Both legacy (~/.brain-dump) and XDG (~/.local/share/brain-dumpy) locations have data. " +
      "Using XDG location."
    );
    return {
      success: true,
      migrated: false,
      message: "XDG location already has data",
    };
  }

  console.log("[Migration] Migrating data from ~/.brain-dump to XDG directories...");

  const legacyDir = getLegacyDir();
  const xdgDataDir = getDataDir();
  const legacyDbPath = join(legacyDir, "brain-dump.db");

  const details = {
    databaseCopied: false,
    attachmentsCopied: 0,
    backupCreated: false,
    integrityVerified: false,
  };

  try {
    ensureDirectoriesSync();

    const backupPath = createPreMigrationBackup(legacyDbPath);
    details.backupCreated = backupPath !== null;

    const xdgDbPath = join(xdgDataDir, "brain-dumpy.db");
    copyFileSafe(legacyDbPath, xdgDbPath);
    details.databaseCopied = true;

    const walFile = legacyDbPath + "-wal";
    const shmFile = legacyDbPath + "-shm";
    if (existsSync(walFile)) {
      copyFileSafe(walFile, xdgDbPath + "-wal");
    }
    if (existsSync(shmFile)) {
      copyFileSafe(shmFile, xdgDbPath + "-shm");
    }

    details.integrityVerified = verifyDatabaseIntegrity(xdgDbPath);
    if (!details.integrityVerified) {
      throw new Error("Database integrity check failed after copy");
    }

    details.attachmentsCopied = copyAttachments(legacyDir, xdgDataDir);

    createMigrationMarker(legacyDir);

    const message = `Migration complete! Database and ${details.attachmentsCopied} attachments migrated.`;
    console.log(`[Migration] ${message}`);
    console.log("[Migration] Legacy data preserved in ~/.brain-dump (not deleted)");

    return {
      success: true,
      migrated: true,
      message,
      details,
    };
  } catch (error) {
    const errorMessage = `Migration failed: ${error}`;
    console.error(`[Migration] ${errorMessage}`);

    return {
      success: false,
      migrated: false,
      message: errorMessage,
      details,
    };
  }
}
