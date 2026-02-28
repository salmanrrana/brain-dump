/**
 * Database initialization adapter for Brain Dump MCP server.
 *
 * Thin adapter over the core database module that handles MCP-specific
 * logging and interface requirements while leveraging core as single source of truth.
 */

import type Database from "better-sqlite3";
import { initDatabase as coreInitDatabase, type Logger } from "../../core/db.ts";
import { log } from "./logging.js";

interface InitDatabaseResult {
  db: Database.Database;
  actualDbPath: string;
}

const mcpLogger: Logger = {
  info: (msg: string) => log.info(msg),
  warn: (msg: string, err?: Error) => log.warn(msg, err),
  error: (msg: string, err?: Error) => log.error(msg, err),
};

export function initDatabase(dbPath?: string): InitDatabaseResult {
  const result = coreInitDatabase({
    ...(dbPath && { dbPath }),
    logger: mcpLogger,
  });

  return {
    db: result.db,
    actualDbPath: result.dbPath,
  };
}
