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
  autoCreatePr: integer("auto_create_pr", { mode: "boolean" }).default(true), // Auto-create PR when done
  prTargetBranch: text("pr_target_branch").default("dev"), // Target branch for PRs
  defaultProjectsDirectory: text("default_projects_directory"), // Where to create new projects
  defaultWorkingMethod: text("default_working_method").default("auto"), // Default environment for new projects: 'auto', 'claude-code', 'vscode', 'opencode'
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
