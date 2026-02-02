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

export interface DbCommentRow {
  id: string;
  ticket_id: string;
  content: string;
  author: string;
  type: string;
  created_at: string;
}

// ============================================
// Review & Demo Row Types
// ============================================

export interface DbTicketWorkflowStateRow {
  id: string;
  ticket_id: string;
  current_phase: string;
  review_iteration: number;
  findings_count: number;
  findings_fixed: number;
  demo_generated: number;
  created_at: string;
  updated_at: string;
}

export interface DbReviewFindingRow {
  id: string;
  ticket_id: string;
  iteration: number;
  agent: string;
  severity: string;
  category: string;
  description: string;
  file_path: string | null;
  line_number: number | null;
  suggested_fix: string | null;
  status: string;
  fixed_at: string | null;
  created_at: string;
}

export interface DbDemoScriptRow {
  id: string;
  ticket_id: string;
  steps: string;
  generated_at: string;
  completed_at: string | null;
  feedback: string | null;
  passed: number | null;
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

// ============================================
// Ralph Session & Event Row Types
// ============================================

export interface DbRalphSessionRow {
  id: string;
  ticket_id: string;
  project_id: string | null;
  current_state: string;
  state_history: string | null;
  outcome: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

/** Extended session row including ticket/project joins */
export interface DbRalphSessionWithProjectRow extends DbRalphSessionRow {
  ticket_title: string | null;
  project_path: string | null;
}

export interface DbRalphEventRow {
  id: string;
  session_id: string;
  type: string;
  data: string | null;
  created_at: string;
}

// ============================================
// Telemetry Row Types
// ============================================

export interface DbTelemetrySessionRow {
  id: string;
  ticket_id: string | null;
  project_id: string | null;
  environment: string | null;
  branch_name: string | null;
  started_at: string;
  ended_at: string | null;
  total_prompts: number;
  total_tool_calls: number;
  total_duration_ms: number | null;
  total_tokens: number | null;
  outcome: string | null;
}

export interface DbTelemetryEventRow {
  id: string;
  session_id: string;
  ticket_id: string | null;
  event_type: string;
  tool_name: string | null;
  event_data: string | null;
  duration_ms: number | null;
  token_count: number | null;
  is_error: number;
  correlation_id: string | null;
  created_at: string;
}
