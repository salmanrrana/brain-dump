/**
 * CLI database initialization.
 *
 * Thin wrapper over core/db.ts with lazy singleton pattern.
 * The database is initialized once on first access and reused for all commands.
 */

import { initDatabase, consoleLogger } from "../../core/index.ts";
import type { InitDatabaseResult } from "../../core/index.ts";

let cached: InitDatabaseResult | null = null;

/**
 * Get or initialize the database for CLI usage.
 * Uses consoleLogger so errors/warnings are visible to the user.
 */
export function getDb(): InitDatabaseResult {
  if (!cached) {
    cached = initDatabase({ logger: consoleLogger });
  }
  return cached;
}
