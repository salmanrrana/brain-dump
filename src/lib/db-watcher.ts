import { watch, existsSync, FSWatcher, statSync, appendFileSync } from "fs";
import { dirname, basename, join } from "path";
import { getStateDir } from "./xdg";

export type DeletionCallback = (deletedFile: string) => void;

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

// Debounce timer for file watcher events
// PERFORMANCE: File system events can fire rapidly; debouncing prevents excessive processing
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 100; // Wait 100ms after last event before processing

function logError(message: string): void {
  console.error(`[db-watcher] ${message}`);
}

function logInfo(message: string): void {
  console.error(`[db-watcher] ${message}`);
}

function fileExists(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile();
  } catch (error) {
    console.error(`[db-watcher] Failed to check file existence for ${path}: ${error}`);
    return false;
  }
}

export function getDatabaseFiles(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

export function checkDatabaseFiles(dbPath: string): string | null {
  if (!fileExists(dbPath)) {
    return basename(dbPath);
  }
  return null;
}

function handlePotentialDeletion(
  filename: string | null,
  dbPath: string
): void {
  if (!filename) return;

  const dbBasename = basename(dbPath);
  const isDbFile =
    filename === dbBasename ||
    filename === `${dbBasename}-wal` ||
    filename === `${dbBasename}-shm`;

  if (!isDbFile) return;

  const filePath =
    filename === dbBasename ? dbPath : join(dirname(dbPath), filename);

  if (!existsSync(filePath)) {
    if (!state.deletionDetected) {
      state.deletionDetected = true;
      logError(`CRITICAL: Database file deleted: ${filename}`);
      logError(`Full path: ${filePath}`);

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

export function startWatching(
  dbPath: string,
  onDeletion?: DeletionCallback
): boolean {
  if (state.isWatching) {
    logInfo("Already watching database files");
    return true;
  }

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    logError(`Database directory does not exist: ${dbDir}`);
    return false;
  }

  if (!existsSync(dbPath)) {
    logError(`Database file does not exist: ${dbPath}`);
    return false;
  }

  try {
    // Watch directory (not file) to detect deletion
    // PERFORMANCE: Debounce events to prevent rapid-fire processing
    const watcher = watch(dbDir, (event, filename) => {
      if (event === "rename") {
        // Clear existing timer and set a new one
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          handlePotentialDeletion(filename, dbPath);
          debounceTimer = null;
        }, DEBOUNCE_MS);
      }
    });

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

export function stopWatching(): void {
  // Clear any pending debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (state.watcher) {
    try {
      state.watcher.close();
    } catch (error) {
      console.error(`[db-watcher] Failed to close watcher: ${error}`);
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

export function isWatching(): boolean {
  return state.isWatching;
}

export function wasDeletionDetected(): boolean {
  return state.deletionDetected;
}

export function getWatchedPath(): string {
  return state.dbPath;
}

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

export function defaultDeletionHandler(deletedFile: string): void {
  logDeletionEvent(deletedFile);

  logError(`CRITICAL: Database file "${deletedFile}" was deleted!`);
  logError("Data may be lost. Check for processes or scripts that may have removed the file.");
  logError("If you have a recent backup, you may be able to restore from:");
  logError(`  ${join(getStateDir(), "backups")}`);
}

export function initializeWatcher(dbPath: string): boolean {
  return startWatching(dbPath, defaultDeletionHandler);
}
