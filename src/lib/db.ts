import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Ensure the data directory exists
const dataDir = join(homedir(), ".brain-dump");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, "brain-dump.db");

// Create database connection
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export { sqlite, dbPath };
