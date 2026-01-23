import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Projects table
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  color: text("color"),
  workingMethod: text("working_method").default("auto"), // 'claude-code', 'vscode', 'opencode', 'auto'
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
