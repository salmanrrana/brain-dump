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

/**
 * Check if the legacy ~/.brain-dump directory exists and has data
 */
export function hasLegacyData(): boolean {
  const legacyDir = getLegacyDir();
  if (!existsSync(legacyDir)) {
    return false;
  }

  // Check for database file
  const legacyDb = join(legacyDir, "brain-dump.db");
  return existsSync(legacyDb);
}

/**
 * Check if migration has already been performed
 */
export function isMigrationComplete(): boolean {
  const legacyDir = getLegacyDir();
  const markerPath = join(legacyDir, MIGRATED_MARKER);
  return existsSync(markerPath);
}

/**
 * Check if the XDG location already has a database
 */
export function hasXdgData(): boolean {
  const xdgDb = join(getDataDir(), "brain-dumpy.db");
  return existsSync(xdgDb);
}

/**
 * Verify SQLite database integrity
 */
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

/**
 * Copy a file safely with verification
 */
function copyFileSafe(src: string, dest: string): boolean {
  try {
    copyFileSync(src, dest, constants.COPYFILE_EXCL);

    // Verify the copy by checking file sizes
    const srcStats = statSync(src);
    const destStats = statSync(dest);
    return srcStats.size === destStats.size;
  } catch (error) {
    // If file exists (COPYFILE_EXCL), that's okay
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return true;
    }
    throw error;
  }
}

/**
 * Get the current timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Append a message to the migration log
 */
function logMigration(message: string): void {
  const logPath = join(getStateDir(), MIGRATION_LOG_FILE);
  const timestamp = getTimestamp();
  const logEntry = `[${timestamp}] ${message}\n`;

  try {
    // Ensure state directory exists
    const stateDir = getStateDir();
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    }

    // Append to log file
    const existingContent = existsSync(logPath) ? readFileSync(logPath, "utf-8") : "";
    writeFileSync(logPath, existingContent + logEntry, { mode: 0o600 });
  } catch (error) {
    // Log to console if file logging fails
    console.error(`Migration log failed: ${message}`, error);
  }
}

/**
 * Create a backup of the database before migration
 */
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

/**
 * Copy all files from legacy attachments directory
 */
function copyAttachments(legacyDir: string, xdgDataDir: string): number {
  const legacyAttachments = join(legacyDir, "attachments");
  const xdgAttachments = join(xdgDataDir, "attachments");

  if (!existsSync(legacyAttachments)) {
    return 0;
  }

  // Create attachments directory
  if (!existsSync(xdgAttachments)) {
    mkdirSync(xdgAttachments, { recursive: true, mode: 0o700 });
  }

  let copiedCount = 0;
  const files = readdirSync(legacyAttachments);

  for (const file of files) {
    const srcPath = join(legacyAttachments, file);
    const destPath = join(xdgAttachments, file);

    // Only copy files, skip directories
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

/**
 * Create the migration marker file
 */
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
 * Perform the migration from legacy to XDG directories.
 * This is a safe operation:
 * - Creates a backup before migration
 * - Verifies database integrity after copy
 * - Never deletes legacy data
 * - Only runs once (creates marker file)
 */
export async function migrateFromLegacy(): Promise<MigrationResult> {
  logMigration("Starting migration check...");

  // Already migrated?
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
    // Ensure XDG directories exist
    ensureDirectoriesSync();

    // 1. Create pre-migration backup
    const backupPath = createPreMigrationBackup(legacyDbPath);
    details.backupCreated = backupPath !== null;

    // 2. Copy database file
    const xdgDbPath = join(xdgDataDir, "brain-dumpy.db");
    logMigration(`Copying database from ${legacyDbPath} to ${xdgDbPath}`);

    copyFileSafe(legacyDbPath, xdgDbPath);
    details.databaseCopied = true;

    // 3. Copy WAL and SHM files if they exist
    const walFile = legacyDbPath + "-wal";
    const shmFile = legacyDbPath + "-shm";
    if (existsSync(walFile)) {
      copyFileSafe(walFile, xdgDbPath + "-wal");
    }
    if (existsSync(shmFile)) {
      copyFileSafe(shmFile, xdgDbPath + "-shm");
    }

    // 4. Verify database integrity at new location
    details.integrityVerified = verifyDatabaseIntegrity(xdgDbPath);
    if (!details.integrityVerified) {
      throw new Error("Database integrity check failed after copy");
    }
    logMigration("Database integrity verified at new location");

    // 5. Copy attachments
    details.attachmentsCopied = copyAttachments(legacyDir, xdgDataDir);
    logMigration(`Copied ${details.attachmentsCopied} attachments`);

    // 6. Create migration marker in legacy directory
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

/**
 * Synchronous version of migration for startup.
 * Returns immediately if no migration needed.
 */
export function migrateFromLegacySync(): MigrationResult {
  // Already migrated?
  if (isMigrationComplete()) {
    return {
      success: true,
      migrated: false,
      message: "Migration already complete",
    };
  }

  // No legacy data?
  if (!hasLegacyData()) {
    return {
      success: true,
      migrated: false,
      message: "No legacy data to migrate",
    };
  }

  // XDG already has data?
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
    // Ensure XDG directories exist
    ensureDirectoriesSync();

    // 1. Create pre-migration backup
    const backupPath = createPreMigrationBackup(legacyDbPath);
    details.backupCreated = backupPath !== null;

    // 2. Copy database file
    const xdgDbPath = join(xdgDataDir, "brain-dumpy.db");
    copyFileSafe(legacyDbPath, xdgDbPath);
    details.databaseCopied = true;

    // 3. Copy WAL and SHM files if they exist
    const walFile = legacyDbPath + "-wal";
    const shmFile = legacyDbPath + "-shm";
    if (existsSync(walFile)) {
      copyFileSafe(walFile, xdgDbPath + "-wal");
    }
    if (existsSync(shmFile)) {
      copyFileSafe(shmFile, xdgDbPath + "-shm");
    }

    // 4. Verify database integrity at new location
    details.integrityVerified = verifyDatabaseIntegrity(xdgDbPath);
    if (!details.integrityVerified) {
      throw new Error("Database integrity check failed after copy");
    }

    // 5. Copy attachments
    details.attachmentsCopied = copyAttachments(legacyDir, xdgDataDir);

    // 6. Create migration marker in legacy directory
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
