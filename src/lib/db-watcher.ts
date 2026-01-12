import { watch, existsSync, FSWatcher, statSync, appendFileSync } from "fs";
import { dirname, basename, join } from "path";
import { getStateDir } from "./xdg";

/**
 * Database file watcher module.
 *
 * Monitors database files for unexpected deletion while in use.
 * This was created after an incident where database files were
 * mysteriously deleted while processes held open file handles.
 */

/**
 * Callback for when deletion is detected
 */
export type DeletionCallback = (deletedFile: string) => void;

/**
 * Watcher state
 */
interface WatcherState {
  watcher: FSWatcher | null;
  dbPath: string;
  isWatching: boolean;
  deletionDetected: boolean;
  onDeletion: DeletionCallback | null;
}

let state: WatcherState = {
  watcher: null,
  dbPath: "",
  isWatching: false,
  deletionDetected: false,
  onDeletion: null,
};

/**
 * Log an error message to stderr.
 */
function logError(message: string): void {
  console.error(`[db-watcher] ${message}`);
}

/**
 * Log an info message to stderr.
 */
function logInfo(message: string): void {
  console.error(`[db-watcher] ${message}`);
}

/**
 * Check if a file exists and is a regular file.
 */
function fileExists(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Get the list of database-related files to monitor.
 * Includes main db, WAL file, and SHM file.
 */
export function getDatabaseFiles(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

/**
 * Check if any of the database files have been deleted.
 * Returns the name of the first deleted file, or null if all exist.
 */
export function checkDatabaseFiles(dbPath: string): string | null {
  // Only check the main database file - WAL and SHM may not always exist
  if (!fileExists(dbPath)) {
    return basename(dbPath);
  }
  return null;
}

/**
 * Handle a potential database deletion event.
 * Called by the file watcher when a file rename event occurs.
 */
function handlePotentialDeletion(
  filename: string | null,
  dbPath: string
): void {
  if (!filename) return;

  // Check if this could be a database file
  const dbBasename = basename(dbPath);
  const isDbFile =
    filename === dbBasename ||
    filename === `${dbBasename}-wal` ||
    filename === `${dbBasename}-shm`;

  if (!isDbFile) return;

  // Verify the file is actually gone
  const filePath =
    filename === dbBasename ? dbPath : `${dirname(dbPath)}/${filename}`;

  if (!existsSync(filePath)) {
    // File was deleted!
    if (!state.deletionDetected) {
      state.deletionDetected = true;
      logError(`CRITICAL: Database file deleted: ${filename}`);
      logError(`Full path: ${filePath}`);

      // Call the deletion callback if set
      if (state.onDeletion) {
        try {
          state.onDeletion(filename);
        } catch (error) {
          logError(`Error in deletion callback: ${error}`);
        }
      }
    }
  }
}

/**
 * Start watching the database directory for file deletions.
 *
 * @param dbPath - Path to the main database file
 * @param onDeletion - Callback to run when deletion is detected
 * @returns true if watcher started successfully, false otherwise
 */
export function startWatching(
  dbPath: string,
  onDeletion?: DeletionCallback
): boolean {
  // Already watching?
  if (state.isWatching) {
    logInfo("Already watching database files");
    return true;
  }

  // Verify the database directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    logError(`Database directory does not exist: ${dbDir}`);
    return false;
  }

  // Verify the database file exists
  if (!existsSync(dbPath)) {
    logError(`Database file does not exist: ${dbPath}`);
    return false;
  }

  try {
    // Watch the directory, not the file, because we need to detect deletion
    const watcher = watch(dbDir, (event, filename) => {
      // 'rename' event can indicate file deletion
      if (event === "rename") {
        handlePotentialDeletion(filename, dbPath);
      }
    });

    // Handle watcher errors
    watcher.on("error", (error) => {
      logError(`Watcher error: ${error.message}`);
    });

    state = {
      watcher,
      dbPath,
      isWatching: true,
      deletionDetected: false,
      onDeletion: onDeletion || null,
    };

    logInfo(`Started watching database: ${dbPath}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logError(`Failed to start watcher: ${err.message}`);
    return false;
  }
}

/**
 * Stop watching database files.
 */
export function stopWatching(): void {
  if (state.watcher) {
    try {
      state.watcher.close();
    } catch {
      // Ignore close errors
    }
  }

  state = {
    watcher: null,
    dbPath: "",
    isWatching: false,
    deletionDetected: false,
    onDeletion: null,
  };

  logInfo("Stopped watching database files");
}

/**
 * Check if the watcher is currently active.
 */
export function isWatching(): boolean {
  return state.isWatching;
}

/**
 * Check if a deletion has been detected.
 */
export function wasDeletionDetected(): boolean {
  return state.deletionDetected;
}

/**
 * Get the path being watched.
 */
export function getWatchedPath(): string {
  return state.dbPath;
}

/**
 * Log a deletion event to the state directory.
 */
export function logDeletionEvent(deletedFile: string): void {
  try {
    const logPath = join(getStateDir(), "deletion-events.log");
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} DELETED: ${deletedFile}\n`;

    appendFileSync(logPath, entry, { mode: 0o600 });
    logError(`Deletion logged to ${logPath}`);
  } catch (error) {
    const err = error as Error;
    logError(`Failed to log deletion event: ${err.message}`);
  }
}

/**
 * Default deletion handler that logs and alerts.
 */
export function defaultDeletionHandler(deletedFile: string): void {
  // Log to file
  logDeletionEvent(deletedFile);

  // Log critical error
  logError(`CRITICAL: Database file "${deletedFile}" was deleted!`);
  logError("Data may be lost. Check for processes or scripts that may have removed the file.");
  logError("If you have a recent backup, you may be able to restore from:");
  logError(`  ${join(getStateDir(), "backups")}`);
}

/**
 * Initialize the database watcher with default settings.
 * Convenience function that combines startWatching with defaultDeletionHandler.
 *
 * @param dbPath - Path to the main database file
 * @returns true if watcher started successfully
 */
export function initializeWatcher(dbPath: string): boolean {
  return startWatching(dbPath, defaultDeletionHandler);
}
