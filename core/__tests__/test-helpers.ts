/**
 * Shared test seed functions for core module tests.
 *
 * These helpers eliminate duplication across test files by providing
 * flexible seed functions that accept options for the columns different
 * tests care about.
 */

import type Database from "better-sqlite3";

// ============================================
// Seed Options
// ============================================

export interface SeedProjectOptions {
  id?: string;
  name?: string;
  path?: string;
  workingMethod?: string;
}

export interface SeedTicketOptions {
  id?: string;
  projectId?: string;
  status?: string;
  epicId?: string;
  branchName?: string;
  description?: string;
  subtasks?: string;
  attachments?: string;
}

export interface SeedEpicOptions {
  id?: string;
  projectId?: string;
  title?: string;
}

// ============================================
// Seed Functions
// ============================================

export function seedProject(db: Database.Database, options: SeedProjectOptions = {}): string {
  const {
    id = "proj-1",
    name = "Test Project",
    path = "/tmp/test-project",
    workingMethod = "auto",
  } = options;
  db.prepare(
    "INSERT INTO projects (id, name, path, working_method, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, path, workingMethod, new Date().toISOString());
  return id;
}

export function seedTicket(db: Database.Database, options: SeedTicketOptions = {}): string {
  const {
    id = "ticket-1",
    projectId = "proj-1",
    status = "backlog",
    epicId = null,
    branchName = null,
    description = null,
    subtasks = null,
    attachments = null,
  } = options;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, branch_name, subtasks, attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'medium', 1, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    `Ticket ${id}`,
    description,
    status,
    projectId,
    epicId,
    branchName,
    subtasks,
    attachments,
    now,
    now
  );
  return id;
}

export function seedEpic(db: Database.Database, options: SeedEpicOptions = {}): string {
  const { id = "epic-1", projectId = "proj-1", title } = options;
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    title || `Epic ${id}`,
    projectId,
    new Date().toISOString()
  );
  return id;
}
