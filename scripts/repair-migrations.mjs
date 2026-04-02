#!/usr/bin/env node
/**
 * repair-migrations.mjs
 *
 * Repairs a desynchronised Drizzle migration journal.
 *
 * Scenario: The database was created outside of Drizzle's migration system
 * (e.g. via a schema dump or a previous install), so __drizzle_migrations is
 * empty even though most tables already exist. Running `pnpm db:migrate` then
 * fails because it tries to CREATE TABLE for objects that are already there.
 *
 * This script:
 *   1. Reads every migration SQL file listed in drizzle/meta/_journal.json
 *   2. Applies each statement safely:
 *      - CREATE TABLE   → converted to CREATE TABLE IF NOT EXISTS
 *      - CREATE INDEX   → converted to CREATE [UNIQUE] INDEX IF NOT EXISTS
 *      - ALTER TABLE ADD COLUMN → executed in a try/catch (SQLite has no
 *        IF NOT EXISTS for column addition)
 *      - Everything else → executed normally
 *   3. Stamps all migrations in __drizzle_migrations so that future
 *      `pnpm db:migrate` calls behave correctly
 *
 * Safe to run multiple times (idempotent).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const migrationsFolder = path.join(projectRoot, "drizzle");
const journalPath = path.join(migrationsFolder, "meta", "_journal.json");

function getDbPath() {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(
      process.env.HOME,
      "Library",
      "Application Support",
      "brain-dump",
      "brain-dump.db"
    );
  }
  if (platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(process.env.HOME, "AppData", "Roaming"),
      "brain-dump",
      "brain-dump.db"
    );
  }
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(process.env.HOME, ".local", "share");
  return path.join(dataHome, "brain-dump", "brain-dump.db");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split a migration file on Drizzle's statement-breakpoint marker and patch
 * CREATE TABLE / CREATE INDEX statements to be idempotent.
 */
function patchStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((stmt) => stmt.trim())
    .filter(Boolean)
    .map((stmt) => {
      if (/^CREATE\s+TABLE\s+`/i.test(stmt)) {
        return stmt.replace(/^CREATE\s+TABLE\s+`/i, "CREATE TABLE IF NOT EXISTS `");
      }
      if (/^CREATE\s+UNIQUE\s+INDEX\s+`/i.test(stmt)) {
        return stmt.replace(
          /^CREATE\s+UNIQUE\s+INDEX\s+`/i,
          "CREATE UNIQUE INDEX IF NOT EXISTS `"
        );
      }
      if (/^CREATE\s+INDEX\s+`/i.test(stmt)) {
        return stmt.replace(/^CREATE\s+INDEX\s+`/i, "CREATE INDEX IF NOT EXISTS `");
      }
      return stmt;
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(journalPath)) {
    console.error(`Journal not found: ${journalPath}`);
    process.exit(1);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const dbPath = getDbPath();

  if (!fs.existsSync(dbPath)) {
    console.log(`No database found at ${dbPath} — nothing to repair.`);
    process.exit(0);
  }

  console.log(`Repairing database: ${dbPath}`);
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const stamped = new Set(
    db.prepare("SELECT hash FROM __drizzle_migrations").all().map((r) => r.hash)
  );

  const insertMigration = db.prepare(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
  );

  let applied = 0;
  let skipped = 0;

  for (const entry of journal.entries) {
    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`  ⚠  Missing file: ${sqlPath} — skipping`);
      continue;
    }

    const rawSql = fs.readFileSync(sqlPath, "utf8");
    const hash = crypto.createHash("sha256").update(rawSql).digest("hex");

    if (stamped.has(hash)) {
      skipped++;
      continue;
    }

    console.log(`  → Applying ${entry.tag}`);

    for (const stmt of patchStatements(rawSql)) {
      if (!stmt) continue;
      try {
        db.exec(stmt);
      } catch (err) {
        if (
          err.code === "SQLITE_ERROR" &&
          (err.message.includes("already exists") ||
            err.message.includes("duplicate column name"))
        ) {
          // Object already exists — safe to skip
        } else {
          console.error(`  ✗  Failed on statement in ${entry.tag}:\n${stmt}\n${err.message}`);
          db.close();
          process.exit(1);
        }
      }
    }

    insertMigration.run(hash, entry.when);
    stamped.add(hash);
    applied++;
  }

  db.close();

  if (applied === 0 && skipped > 0) {
    console.log(`✓ All ${skipped} migrations already stamped — nothing to do.`);
  } else {
    console.log(
      `✓ Repair complete: ${applied} migration(s) applied, ${skipped} already stamped.`
    );
  }
}

main();
