import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Projects table
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  color: text("color"),
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

// Type exports
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Epic = typeof epics.$inferSelect;
export type NewEpic = typeof epics.$inferInsert;

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
