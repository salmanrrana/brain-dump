/**
 * Internal database row types shared across core modules.
 *
 * These represent the raw rows returned by better-sqlite3 queries
 * before they are transformed into the public API types in types.ts.
 *
 * NOT exported from core/index.ts — these are internal implementation details.
 */

export interface DbProjectRow {
  id: string;
  name: string;
  path: string;
  color: string | null;
  working_method: string | null;
  created_at: string;
}

export interface DbEpicRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  color: string | null;
  created_at: string;
}

export interface DbTicketRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  project_id: string;
  epic_id: string | null;
  tags: string | null;
  subtasks: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  linked_files: string | null;
  attachments: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  linked_commits: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
}

/**
 * Row shape for the ticket list summary query (used by listTickets and listTicketsByEpic).
 */
export interface DbTicketSummaryRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  epic_id: string | null;
  is_blocked: number;
  branch_name: string | null;
  pr_number: number | null;
  pr_status: string | null;
  created_at: string;
  updated_at: string;
  project_name: string;
}
