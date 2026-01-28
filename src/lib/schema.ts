import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Projects table
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  color: text("color"),
  workingMethod: text("working_method").default("auto"), // 'claude-code', 'vscode', 'opencode', 'auto'
  // Worktree default settings
  defaultIsolationMode: text("default_isolation_mode").$type<
    "branch" | "worktree" | "ask" | null
  >(), // 'branch' | 'worktree' | 'ask' | null (null = ask each time)
  worktreeLocation: text("worktree_location")
    .default("sibling")
    .$type<"sibling" | "subfolder" | "custom">(), // 'sibling' | 'subfolder' | 'custom'
  worktreeBasePath: text("worktree_base_path"), // Only used if worktree_location = 'custom'
  maxWorktrees: integer("max_worktrees").default(5), // Limit to prevent disk exhaustion
  autoCleanupWorktrees: integer("auto_cleanup_worktrees", { mode: "boolean" }).default(false), // Auto-cleanup when PR merged
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Epics table
export const epics = sqliteTable(
  "epics",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    color: text("color"),
    isolationMode: text("isolation_mode").$type<"branch" | "worktree" | null>(), // 'branch' | 'worktree' | null
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_epics_project").on(table.projectId)]
);

// Tickets table
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("backlog"),
    priority: text("priority"),
    position: real("position").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    epicId: text("epic_id").references(() => epics.id, { onDelete: "set null" }),
    tags: text("tags"), // JSON array
    subtasks: text("subtasks"), // JSON array of {text, completed}
    isBlocked: integer("is_blocked", { mode: "boolean" }).default(false),
    blockedReason: text("blocked_reason"),
    linkedFiles: text("linked_files"), // JSON array of file paths
    attachments: text("attachments"), // JSON array of attachment paths
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    completedAt: text("completed_at"),
    // Git/PR tracking fields
    branchName: text("branch_name"), // e.g., "feature/abc123-add-login"
    prNumber: integer("pr_number"), // GitHub PR number
    prUrl: text("pr_url"), // Full PR URL
    prStatus: text("pr_status").$type<"draft" | "open" | "merged" | "closed" | null>(), // 'draft' | 'open' | 'merged' | 'closed'
  },
  (table) => [
    index("idx_tickets_project").on(table.projectId),
    index("idx_tickets_epic").on(table.epicId),
    index("idx_tickets_status").on(table.status),
  ]
);

// Ticket comments table (activity log for AI work summaries)
export const ticketComments = sqliteTable(
  "ticket_comments",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    author: text("author").notNull(), // 'claude', 'ralph', 'opencode', or user identifier
    type: text("type").notNull().default("comment"), // 'comment', 'work_summary', 'test_report'
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_comments_ticket").on(table.ticketId)]
);

// Settings table (single row for app-wide settings)
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("default"),
  terminalEmulator: text("terminal_emulator"), // null = auto-detect
  ralphSandbox: integer("ralph_sandbox", { mode: "boolean" }).default(false), // Run Ralph in Docker
  ralphTimeout: integer("ralph_timeout").default(3600), // Timeout in seconds (default: 1 hour)
  ralphMaxIterations: integer("ralph_max_iterations").default(10), // Max iterations for Ralph loop (default: 10)
  autoCreatePr: integer("auto_create_pr", { mode: "boolean" }).default(true), // Auto-create PR when done
  prTargetBranch: text("pr_target_branch").default("dev"), // Target branch for PRs
  defaultProjectsDirectory: text("default_projects_directory"), // Where to create new projects
  defaultWorkingMethod: text("default_working_method").default("auto"), // Default environment for new projects: 'auto', 'claude-code', 'vscode', 'opencode'
  // Docker runtime settings
  dockerRuntime: text("docker_runtime"), // 'auto' | 'lima' | 'colima' | 'rancher' | 'docker-desktop' | 'podman' - null = auto-detect
  dockerSocketPath: text("docker_socket_path"), // Custom socket path override (null = use detected path)
  // Enterprise conversation logging settings
  conversationRetentionDays: integer("conversation_retention_days").default(90), // Days to retain conversation logs (default: 90)
  conversationLoggingEnabled: integer("conversation_logging_enabled", { mode: "boolean" }).default(
    true
  ), // Enable/disable conversation logging
  // Git worktree feature flag (gradual rollout)
  enableWorktreeSupport: integer("enable_worktree_support", { mode: "boolean" }).default(false), // Global opt-in for worktree support
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Type exports
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Epic = typeof epics.$inferSelect;
export type NewEpic = typeof epics.$inferInsert;

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type TicketComment = typeof ticketComments.$inferSelect;
export type NewTicketComment = typeof ticketComments.$inferInsert;

// Ralph events table (for real-time UI streaming)
export const ralphEvents = sqliteTable(
  "ralph_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(), // Links to a Ralph session (ticket ID or custom session)
    type: text("type").notNull(), // 'thinking', 'tool_start', 'tool_end', 'file_change', 'progress', 'state_change', 'error'
    data: text("data"), // JSON object with event-specific data
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_ralph_events_session").on(table.sessionId),
    index("idx_ralph_events_created").on(table.createdAt),
  ]
);

export type RalphEvent = typeof ralphEvents.$inferSelect;
export type NewRalphEvent = typeof ralphEvents.$inferInsert;

// Ralph event types
export type RalphEventType =
  | "thinking" // Claude is processing
  | "tool_start" // About to call a tool
  | "tool_end" // Tool call completed
  | "file_change" // File was modified
  | "progress" // General progress update
  | "state_change" // Session state transition
  | "error"; // Error occurred

// Ralph event data interface
export interface RalphEventData {
  message?: string;
  tool?: string;
  file?: string;
  state?: string;
  error?: string;
  success?: boolean;
  [key: string]: unknown;
}

// Ralph sessions table (for state machine observability)
export const ralphSessions = sqliteTable(
  "ralph_sessions",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    currentState: text("current_state").notNull().default("idle"), // 'idle', 'analyzing', 'implementing', 'testing', 'committing', 'reviewing', 'done'
    stateHistory: text("state_history"), // JSON array of {state, timestamp, metadata}
    outcome: text("outcome"), // 'success', 'failure', 'timeout', 'cancelled', null while in progress
    errorMessage: text("error_message"), // Error details if outcome is 'failure'
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_ralph_sessions_ticket").on(table.ticketId),
    index("idx_ralph_sessions_state").on(table.currentState),
  ]
);

export type RalphSession = typeof ralphSessions.$inferSelect;
export type NewRalphSession = typeof ralphSessions.$inferInsert;

// Ralph session states
export type RalphSessionState =
  | "idle" // Session created but work not started
  | "analyzing" // Reading specs, understanding requirements
  | "implementing" // Writing/editing code
  | "testing" // Running tests, verifying behavior
  | "committing" // Creating git commits
  | "reviewing" // Self-review before completing
  | "done"; // Session completed

// State history entry interface
export interface StateHistoryEntry {
  state: RalphSessionState;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Enterprise Conversation Logging Tables
// ============================================

// Conversation sessions table - tracks AI conversation sessions for compliance
export const conversationSessions = sqliteTable(
  "conversation_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    ticketId: text("ticket_id").references(() => tickets.id, {
      onDelete: "set null",
    }),
    userId: text("user_id"), // Nullable for future multi-user support
    environment: text("environment").notNull().default("unknown"), // 'claude-code', 'vscode', 'opencode', 'unknown'
    sessionMetadata: text("session_metadata"), // JSON object with additional context
    dataClassification: text("data_classification").default("internal"), // 'public', 'internal', 'confidential', 'restricted'
    legalHold: integer("legal_hold", { mode: "boolean" }).default(false), // Prevents deletion for legal/audit purposes
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    endedAt: text("ended_at"), // Null while session is active
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_conversation_sessions_project").on(table.projectId),
    index("idx_conversation_sessions_ticket").on(table.ticketId),
    index("idx_conversation_sessions_user").on(table.userId),
    index("idx_conversation_sessions_started").on(table.startedAt),
  ]
);

export type ConversationSession = typeof conversationSessions.$inferSelect;
export type NewConversationSession = typeof conversationSessions.$inferInsert;

// Conversation messages table - stores individual messages within a session
export const conversationMessages = sqliteTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => conversationSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user', 'assistant', 'system', 'tool'
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(), // HMAC-SHA256 for tamper detection
    toolCalls: text("tool_calls"), // JSON array of {name, parameters, result}
    tokenCount: integer("token_count"), // Token usage for the message
    modelId: text("model_id"), // Model identifier (e.g., 'claude-3-opus')
    sequenceNumber: integer("sequence_number").notNull(), // Order within session
    containsPotentialSecrets: integer("contains_potential_secrets", {
      mode: "boolean",
    }).default(false), // Flag if secret patterns detected
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_conversation_messages_session").on(table.sessionId),
    index("idx_conversation_messages_session_seq").on(table.sessionId, table.sequenceNumber),
    index("idx_conversation_messages_created").on(table.createdAt),
  ]
);

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;

// Message role types
export type ConversationRole = "user" | "assistant" | "system" | "tool";

// Tool call interface for JSON storage
export interface ToolCall {
  name: string;
  parameters?: Record<string, unknown>;
  result?: unknown;
}

// Audit log access table - tracks who accessed conversation logs
export const auditLogAccess = sqliteTable(
  "audit_log_access",
  {
    id: text("id").primaryKey(),
    accessorId: text("accessor_id").notNull(), // Who accessed (user ID or system identifier)
    targetType: text("target_type").notNull(), // 'session', 'message', 'export'
    targetId: text("target_id").notNull(), // ID of the accessed resource
    action: text("action").notNull(), // 'read', 'export', 'delete', 'legal_hold'
    result: text("result").notNull(), // 'success', 'denied', 'error'
    accessedAt: text("accessed_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_audit_log_accessor").on(table.accessorId),
    index("idx_audit_log_target").on(table.targetType, table.targetId),
    index("idx_audit_log_accessed").on(table.accessedAt),
  ]
);

export type AuditLogAccess = typeof auditLogAccess.$inferSelect;
export type NewAuditLogAccess = typeof auditLogAccess.$inferInsert;

// Data classification levels
export type DataClassification =
  | "public" // Non-sensitive, publicly shareable
  | "internal" // Internal use, default for most conversations
  | "confidential" // Sensitive business data
  | "restricted"; // Highly sensitive, regulatory requirements

// Audit action types
export type AuditAction = "read" | "export" | "delete" | "legal_hold";

// Audit result types
export type AuditResult = "success" | "denied" | "error";

// ============================================
// AI Telemetry Tables
// ============================================

// Telemetry sessions track a full AI work session on a ticket
export const telemetrySessions = sqliteTable(
  "telemetry_sessions",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").references(() => tickets.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    environment: text("environment").notNull().default("unknown"), // 'claude-code', 'vscode', 'cursor', etc.
    branchName: text("branch_name"), // Git branch being worked on
    claudeSessionId: text("claude_session_id"), // Claude's internal session ID if available
    startedAt: text("started_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    endedAt: text("ended_at"),
    // Summary stats computed at session end
    totalPrompts: integer("total_prompts").default(0),
    totalToolCalls: integer("total_tool_calls").default(0),
    totalDurationMs: integer("total_duration_ms"),
    totalTokens: integer("total_tokens"),
    outcome: text("outcome"), // 'success', 'failure', 'timeout', 'cancelled'
  },
  (table) => [
    index("idx_telemetry_sessions_ticket").on(table.ticketId),
    index("idx_telemetry_sessions_project").on(table.projectId),
    index("idx_telemetry_sessions_started").on(table.startedAt),
  ]
);

export type TelemetrySession = typeof telemetrySessions.$inferSelect;
export type NewTelemetrySession = typeof telemetrySessions.$inferInsert;

// Telemetry events capture individual interactions during a session
export const telemetryEvents = sqliteTable(
  "telemetry_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => telemetrySessions.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id").references(() => tickets.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(), // 'prompt', 'tool_start', 'tool_end', 'mcp_call', 'task_created', 'task_completed', 'error'
    toolName: text("tool_name"), // For tool events: 'Edit', 'Bash', 'mcp__brain-dump__*', etc.
    eventData: text("event_data"), // JSON: params, result summary, error details
    durationMs: integer("duration_ms"), // For tool_end events
    tokenCount: integer("token_count"), // For prompt events if available
    isError: integer("is_error", { mode: "boolean" }).default(false),
    // For pairing tool_start/tool_end events
    correlationId: text("correlation_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_telemetry_events_session").on(table.sessionId),
    index("idx_telemetry_events_ticket").on(table.ticketId),
    index("idx_telemetry_events_type").on(table.eventType),
    index("idx_telemetry_events_created").on(table.createdAt),
    index("idx_telemetry_events_correlation").on(table.correlationId),
  ]
);

export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type NewTelemetryEvent = typeof telemetryEvents.$inferInsert;

// Telemetry event types
export type TelemetryEventType =
  | "session_start" // Session began
  | "session_end" // Session ended
  | "prompt" // User prompt submitted
  | "tool_start" // Tool call started
  | "tool_end" // Tool call completed
  | "mcp_call" // MCP tool invocation
  | "task_created" // Claude Task created
  | "task_started" // Claude Task started
  | "task_completed" // Claude Task completed
  | "context_loaded" // Context loaded (files, comments, images)
  | "error"; // Error occurred

// Event data interfaces for type safety
export interface PromptEventData {
  prompt: string;
  promptLength: number;
  redacted?: boolean;
}

export interface ToolEventData {
  toolName: string;
  params?: Record<string, unknown>;
  paramsSummary?: string;
  result?: string;
  resultSummary?: string;
  success?: boolean;
  error?: string;
}

export interface TaskEventData {
  taskId: string;
  subject?: string;
  description?: string;
  outcome?: string;
}

export interface ContextLoadedEventData {
  hasDescription: boolean;
  hasAcceptanceCriteria: boolean;
  criteriaCount: number;
  commentCount: number;
  attachmentCount: number;
  imageCount: number;
}

// ============================================
// Claude Tasks Tables
// ============================================

// Claude tasks table - stores tasks created by Claude via TodoWrite tool when working on tickets
export const claudeTasks = sqliteTable(
  "claude_tasks",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(), // Task title/subject
    description: text("description"), // Optional detailed description
    status: text("status").notNull().default("pending"), // 'pending', 'in_progress', 'completed'
    activeForm: text("active_form"), // Present continuous form shown during execution (e.g., "Running tests")
    position: real("position").notNull(), // Order within the ticket's task list
    statusHistory: text("status_history"), // JSON array of {status, timestamp} for tracking changes
    sessionId: text("session_id"), // Optional link to Ralph session that created this task
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    completedAt: text("completed_at"), // When the task was marked completed
  },
  (table) => [
    index("idx_claude_tasks_ticket").on(table.ticketId),
    index("idx_claude_tasks_session").on(table.sessionId),
    index("idx_claude_tasks_status").on(table.status),
    index("idx_claude_tasks_position").on(table.ticketId, table.position),
  ]
);

export type ClaudeTask = typeof claudeTasks.$inferSelect;
export type NewClaudeTask = typeof claudeTasks.$inferInsert;

// Claude task status types
export type ClaudeTaskStatus = "pending" | "in_progress" | "completed";

// Status history entry interface
export interface TaskStatusHistoryEntry {
  status: ClaudeTaskStatus;
  timestamp: string;
}

// Claude task snapshots table - stores complete task list snapshots for history/audit
export const claudeTaskSnapshots = sqliteTable(
  "claude_task_snapshots",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    sessionId: text("session_id"), // Optional link to Ralph session
    tasks: text("tasks").notNull(), // JSON array of full task objects at snapshot time
    reason: text("reason"), // Why snapshot was taken: 'session_start', 'session_end', 'manual', etc.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_claude_task_snapshots_ticket").on(table.ticketId),
    index("idx_claude_task_snapshots_session").on(table.sessionId),
    index("idx_claude_task_snapshots_created").on(table.createdAt),
  ]
);

export type ClaudeTaskSnapshot = typeof claudeTaskSnapshots.$inferSelect;
export type NewClaudeTaskSnapshot = typeof claudeTaskSnapshots.$inferInsert;

// Task snapshot data interface
export interface TaskSnapshotData {
  id: string;
  subject: string;
  description?: string;
  status: ClaudeTaskStatus;
  activeForm?: string;
  position: number;
}

// ============================================
// Universal Quality Workflow Tables
// ============================================

// Ticket workflow state table - tracks ticket progress through workflow phases
export const ticketWorkflowState = sqliteTable(
  "ticket_workflow_state",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .unique()
      .references(() => tickets.id, { onDelete: "cascade" }),
    currentPhase: text("current_phase").notNull().default("implementation"), // 'implementation', 'ai_review', 'human_review', 'done'
    reviewIteration: integer("review_iteration").default(0), // How many review iterations completed
    findingsCount: integer("findings_count").default(0), // Total findings reported
    findingsFixed: integer("findings_fixed").default(0), // Findings marked as fixed
    demoGenerated: integer("demo_generated", { mode: "boolean" }).default(false), // Whether demo script exists
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_ticket_workflow_state_ticket").on(table.ticketId),
    index("idx_ticket_workflow_state_phase").on(table.currentPhase),
  ]
);

export type TicketWorkflowState = typeof ticketWorkflowState.$inferSelect;
export type NewTicketWorkflowState = typeof ticketWorkflowState.$inferInsert;

// Epic workflow state table - tracks epic progress and learnings
export const epicWorkflowState = sqliteTable(
  "epic_workflow_state",
  {
    id: text("id").primaryKey(),
    epicId: text("epic_id")
      .notNull()
      .unique()
      .references(() => epics.id, { onDelete: "cascade" }),
    ticketsTotal: integer("tickets_total").default(0), // Total tickets in epic
    ticketsDone: integer("tickets_done").default(0), // Completed tickets
    currentTicketId: text("current_ticket_id").references(() => tickets.id, {
      onDelete: "set null",
    }), // Currently being worked on
    learnings: text("learnings"), // JSON array of learning objects
    // Epic-level git branch tracking (for single PR per epic)
    epicBranchName: text("epic_branch_name"), // e.g., "feature/epic-abc123-my-epic"
    epicBranchCreatedAt: text("epic_branch_created_at"), // When branch was created
    prNumber: integer("pr_number"), // GitHub PR number for the epic
    prUrl: text("pr_url"), // Full PR URL
    prStatus: text("pr_status").$type<"draft" | "open" | "merged" | "closed" | null>(), // PR status
    // Worktree tracking fields
    worktreePath: text("worktree_path"), // Absolute path to the worktree directory
    worktreeCreatedAt: text("worktree_created_at"), // When the worktree was created
    worktreeStatus: text("worktree_status").$type<"active" | "stale" | "orphaned" | null>(), // "active" | "stale" | "orphaned"
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_epic_workflow_state_epic").on(table.epicId),
    index("idx_epic_workflow_state_current_ticket").on(table.currentTicketId),
    index("idx_epic_workflow_state_worktree_status").on(table.worktreeStatus),
  ]
);

export type EpicWorkflowState = typeof epicWorkflowState.$inferSelect;
export type NewEpicWorkflowState = typeof epicWorkflowState.$inferInsert;

// Review findings table - stores findings from code review agents
export const reviewFindings = sqliteTable(
  "review_findings",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    iteration: integer("iteration").notNull(), // Which review iteration this finding is from
    agent: text("agent").notNull(), // 'code-reviewer', 'silent-failure-hunter', 'code-simplifier'
    severity: text("severity").notNull(), // 'critical', 'major', 'minor', 'suggestion'
    category: text("category").notNull(), // Type of finding
    description: text("description").notNull(), // What the issue is
    filePath: text("file_path"), // Optional file path affected
    lineNumber: integer("line_number"), // Optional line number
    suggestedFix: text("suggested_fix"), // Optional fix suggestion
    status: text("status").notNull().default("open"), // 'open', 'fixed', 'wont_fix', 'duplicate'
    fixedAt: text("fixed_at"), // When marked as fixed
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_review_findings_ticket").on(table.ticketId),
    index("idx_review_findings_status").on(table.status),
    index("idx_review_findings_severity").on(table.severity),
    index("idx_review_findings_agent").on(table.agent),
    index("idx_review_findings_iteration").on(table.ticketId, table.iteration),
  ]
);

export type ReviewFinding = typeof reviewFindings.$inferSelect;
export type NewReviewFinding = typeof reviewFindings.$inferInsert;

// Demo scripts table - stores demo steps for human review
export const demoScripts = sqliteTable(
  "demo_scripts",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .unique()
      .references(() => tickets.id, { onDelete: "cascade" }),
    steps: text("steps").notNull(), // JSON array of demo step objects
    generatedAt: text("generated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    completedAt: text("completed_at"), // When human completed the demo
    feedback: text("feedback"), // Human's feedback
    passed: integer("passed", { mode: "boolean" }), // Whether human approved (true) or rejected (false)
  },
  (table) => [
    index("idx_demo_scripts_ticket").on(table.ticketId),
    index("idx_demo_scripts_generated").on(table.generatedAt),
  ]
);

export type DemoScript = typeof demoScripts.$inferSelect;
export type NewDemoScript = typeof demoScripts.$inferInsert;

// Demo step interface for JSON storage
export interface DemoStep {
  order: number; // Step order
  description: string; // What to do
  expectedOutcome: string; // What should happen
  type: "manual" | "visual" | "automated"; // How to verify
  status?: "pending" | "passed" | "failed" | "skipped"; // Current status during review
  notes?: string; // Reviewer's notes
}

// Learning interface for epic workflow
export interface WorkflowLearning {
  type: "pattern" | "anti-pattern" | "tool-usage" | "workflow"; // Type of learning
  description: string; // What was learned
  ticketId: string; // Which ticket this learning came from
  ticketTitle?: string; // Title for context
  suggestedUpdate?: {
    file: string; // e.g., 'CLAUDE.md', 'AGENTS.md'
    section: string; // Section to update
    content: string; // Suggested content
  };
  appliedAt?: string; // When this learning was applied to docs
}

// Tool usage events table - tracks MCP tool invocations for analytics
export const toolUsageEvents = sqliteTable(
  "tool_usage_events",
  {
    id: text("id").primaryKey(),
    toolName: text("tool_name").notNull(),
    sessionId: text("session_id"), // Ralph session ID if applicable
    ticketId: text("ticket_id"), // Current ticket ID
    projectId: text("project_id"), // Current project ID
    context: text("context").default("unknown"), // Active context (ticket_work, planning, review, admin)
    invocations: integer("invocations").notNull().default(1),
    successCount: integer("success_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    totalDuration: integer("total_duration").default(0), // Total execution time in milliseconds
    lastUsedAt: text("last_used_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_tool_usage_tool_name").on(table.toolName),
    index("idx_tool_usage_session").on(table.sessionId),
    index("idx_tool_usage_ticket").on(table.ticketId),
    index("idx_tool_usage_project").on(table.projectId),
    index("idx_tool_usage_last_used").on(table.lastUsedAt),
  ]
);

export type ToolUsageEvent = typeof toolUsageEvents.$inferSelect;
export type NewToolUsageEvent = typeof toolUsageEvents.$inferInsert;
