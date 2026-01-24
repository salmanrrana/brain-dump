/**
 * Claude Tasks tools for Brain Dump MCP server.
 * Provides tools to save and retrieve Claude's tasks associated with tickets.
 * These tasks are created by Claude via the TodoWrite tool when working on tickets.
 * @module tools/claude-tasks
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { log } from "../lib/logging.js";

const TASK_STATUSES = /** @type {const} */ (["pending", "in_progress", "completed"]);

/**
 * Task input schema for save_claude_tasks.
 * Matches the TodoWrite tool's task format.
 */
const taskInputSchema = z.object({
  id: z.string().optional().describe("Optional task ID (generated if not provided)"),
  subject: z.string().describe("Task title/subject - the imperative form"),
  description: z.string().optional().describe("Optional detailed description"),
  status: z.enum(TASK_STATUSES).describe("Task status: pending, in_progress, or completed"),
  activeForm: z.string().optional().describe("Present continuous form shown during execution"),
});

/**
 * Read Ralph state file to auto-detect active ticket.
 * @param {string} [projectPath] - Optional project path to check
 * @returns {{ ticketId: string | null, sessionId: string | null }}
 */
function readRalphState(projectPath) {
  const paths = [
    projectPath ? join(projectPath, ".claude", "ralph-state.json") : null,
    join(process.cwd(), ".claude", "ralph-state.json"),
  ].filter(Boolean);

  for (const statePath of paths) {
    if (existsSync(statePath)) {
      try {
        const state = JSON.parse(readFileSync(statePath, "utf-8"));
        return {
          ticketId: state.ticketId || null,
          sessionId: state.sessionId || null,
        };
      } catch (err) {
        log.warn(`Failed to read Ralph state from ${statePath}: ${err.message}`);
      }
    }
  }

  return { ticketId: null, sessionId: null };
}

/**
 * Verify that a ticket exists in the database.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {object|null} The ticket object if found, null otherwise
 */
function ensureTicketExists(db, ticketId) {
  return db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(ticketId);
}

/**
 * Get the emoji icon for a task status.
 * @param {string} status - Task status ('pending', 'in_progress', or 'completed')
 * @returns {string} Status icon emoji
 */
function getTaskStatusIcon(status) {
  switch (status) {
    case "completed":
      return "✅";
    case "in_progress":
      return "🔄";
    default:
      return "○";
  }
}

/**
 * Register Claude Tasks tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerClaudeTasksTools(server, db) {
  // Save Claude tasks
  server.tool(
    "save_claude_tasks",
    `Save Claude's task list to a ticket.

Called when Claude creates or updates tasks while working on a ticket.
This replaces the entire task list for the ticket - send all current tasks.

Auto-detects the active ticket from Ralph state if ticketId not provided.

Args:
  ticketId: The ticket ID (auto-detected if not provided)
  tasks: Array of tasks with { subject, status, activeForm, description? }
  createSnapshot: Whether to create an audit snapshot (default: false)

Returns the saved tasks.`,
    {
      ticketId: z.string().optional().describe("Ticket ID (auto-detected from Ralph state if not provided)"),
      tasks: z.array(taskInputSchema).describe("Array of tasks to save"),
      createSnapshot: z.boolean().optional().describe("Create an audit snapshot of the task list"),
    },
    async ({ ticketId, tasks, createSnapshot = false }) => {
      // Auto-detect ticket from Ralph state if not provided
      let resolvedTicketId = ticketId;
      let resolvedSessionId = null;

      if (!resolvedTicketId) {
        const ralphState = readRalphState();
        if (ralphState.ticketId) {
          resolvedTicketId = ralphState.ticketId;
          resolvedSessionId = ralphState.sessionId;
          log.info(`Auto-detected ticket ${resolvedTicketId} from Ralph state`);
        } else {
          return {
            content: [{ type: "text", text: "No ticketId provided and no active Ralph session found. Provide a ticketId or start ticket work first." }],
            isError: true,
          };
        }
      }

      // Verify ticket exists
      const ticket = ensureTicketExists(db, resolvedTicketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${resolvedTicketId}. Use list_tickets to see available tickets.` }],
          isError: true,
        };
      }

      // Validate tasks array
      if (!tasks || tasks.length === 0) {
        return {
          content: [{ type: "text", text: "No tasks provided. Send at least one task to save." }],
          isError: true,
        };
      }

      const now = new Date().toISOString();

      const transaction = db.transaction(() => {
        // Get existing tasks to preserve status history for audit trail
        const existingTasks = db.prepare(
          "SELECT id, status, status_history, created_at FROM claude_tasks WHERE ticket_id = ?"
        ).all(resolvedTicketId);
        const existingTaskMap = new Map(existingTasks.map(t => [t.id, t]));

        db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(resolvedTicketId);

        const insertStmt = db.prepare(`
          INSERT INTO claude_tasks (id, ticket_id, subject, description, status, active_form, position, status_history, session_id, created_at, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const savedTasks = [];
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const taskId = task.id || randomUUID();
          const position = i + 1;

          // Preserve or initialize status history
          let statusHistory = [];
          const existing = existingTaskMap.get(taskId);
          if (existing?.status_history) {
            try {
              statusHistory = JSON.parse(existing.status_history);
            } catch {
              statusHistory = [];
            }
          }

          // Add new status entry if status changed
          const lastStatus = statusHistory.length > 0 ? statusHistory[statusHistory.length - 1].status : null;
          if (task.status !== lastStatus) {
            statusHistory.push({ status: task.status, timestamp: now });
          }

          const completedAt = task.status === "completed" ? now : null;

          insertStmt.run(
            taskId,
            resolvedTicketId,
            task.subject,
            task.description || null,
            task.status,
            task.activeForm || null,
            position,
            JSON.stringify(statusHistory),
            resolvedSessionId,
            existing ? existing.created_at : now,
            now,
            completedAt
          );

          savedTasks.push({
            id: taskId,
            subject: task.subject,
            description: task.description,
            status: task.status,
            activeForm: task.activeForm,
            position,
          });
        }

        // Create snapshot if requested
        if (createSnapshot) {
          const snapshotId = randomUUID();
          db.prepare(`
            INSERT INTO claude_task_snapshots (id, ticket_id, session_id, tasks, reason, created_at)
            VALUES (?, ?, ?, ?, 'manual', ?)
          `).run(snapshotId, resolvedTicketId, resolvedSessionId, JSON.stringify(savedTasks), now);
        }

        return savedTasks;
      });

      try {
        const savedTasks = transaction();
        log.info(`Saved ${savedTasks.length} Claude tasks for ticket ${resolvedTicketId}`);

        const statusCounts = savedTasks.reduce((acc, t) => {
          acc[t.status] = (acc[t.status] || 0) + 1;
          return acc;
        }, {});

        return {
          content: [{
            type: "text",
            text: `## Claude Tasks Saved

**Ticket:** ${ticket.title}
**Tasks:** ${savedTasks.length} (${Object.entries(statusCounts).map(([s, c]) => `${c} ${s}`).join(", ")})
${createSnapshot ? "**Snapshot:** Created for audit trail" : ""}

${savedTasks.map((t, i) => `${i + 1}. ${getTaskStatusIcon(t.status)} ${t.subject}`).join("\n")}`,
          }],
        };
      } catch (err) {
        log.error(`Failed to save Claude tasks: ${err.message}`);
        return {
          content: [{ type: "text", text: `Failed to save tasks: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // Get Claude tasks
  server.tool(
    "get_claude_tasks",
    `Retrieve Claude's tasks for a ticket.

Returns the stored task list with full details including status history.

Auto-detects the active ticket from Ralph state if ticketId not provided.

Args:
  ticketId: The ticket ID (auto-detected if not provided)
  includeHistory: Include status change history (default: false)

Returns array of tasks with full details.`,
    {
      ticketId: z.string().optional().describe("Ticket ID (auto-detected from Ralph state if not provided)"),
      includeHistory: z.boolean().optional().describe("Include status change history"),
    },
    async ({ ticketId, includeHistory = false }) => {
      // Auto-detect ticket from Ralph state if not provided
      let resolvedTicketId = ticketId;

      if (!resolvedTicketId) {
        const ralphState = readRalphState();
        if (ralphState.ticketId) {
          resolvedTicketId = ralphState.ticketId;
          log.info(`Auto-detected ticket ${resolvedTicketId} from Ralph state`);
        } else {
          return {
            content: [{ type: "text", text: "No ticketId provided and no active Ralph session found. Provide a ticketId or start ticket work first." }],
            isError: true,
          };
        }
      }

      // Verify ticket exists
      const ticket = ensureTicketExists(db, resolvedTicketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${resolvedTicketId}. Use list_tickets to see available tickets.` }],
          isError: true,
        };
      }

      // Fetch tasks ordered by position
      const tasks = db.prepare(`
        SELECT id, subject, description, status, active_form as activeForm, position, status_history, session_id, created_at, updated_at, completed_at
        FROM claude_tasks
        WHERE ticket_id = ?
        ORDER BY position ASC
      `).all(resolvedTicketId);

      if (tasks.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No Claude tasks recorded for ticket "${ticket.title}".\n\nTasks are captured when Claude uses the TodoWrite tool while working on this ticket.`,
          }],
        };
      }

      // Parse status history if requested
      const formattedTasks = tasks.map(t => {
        const task = {
          id: t.id,
          subject: t.subject,
          description: t.description,
          status: t.status,
          activeForm: t.activeForm,
          position: t.position,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          completedAt: t.completed_at,
        };

        if (includeHistory && t.status_history) {
          try {
            task.statusHistory = JSON.parse(t.status_history);
          } catch {
            task.statusHistory = [];
          }
        }

        return task;
      });

      const statusCounts = formattedTasks.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});

      log.info(`Retrieved ${formattedTasks.length} Claude tasks for ticket ${resolvedTicketId}`);

      return {
        content: [{
          type: "text",
          text: `## Claude Tasks for "${ticket.title}"

**Total:** ${formattedTasks.length} (${Object.entries(statusCounts).map(([s, c]) => `${c} ${s}`).join(", ")})

${formattedTasks.map((t, i) => {
  let entry = `${i + 1}. ${getTaskStatusIcon(t.status)} **${t.subject}**`;
  if (t.description) entry += `\n   ${t.description}`;
  if (t.activeForm && t.status === "in_progress") entry += `\n   _${t.activeForm}_`;
  return entry;
}).join("\n\n")}

---
\`\`\`json
${JSON.stringify(formattedTasks, null, 2)}
\`\`\``,
        }],
      };
    }
  );

  // Clear Claude tasks
  server.tool(
    "clear_claude_tasks",
    `Clear all Claude tasks for a ticket.

Use this to reset the task list when starting fresh work on a ticket.
Creates a snapshot before clearing for audit purposes.

Args:
  ticketId: The ticket ID (auto-detected if not provided)

Returns confirmation of cleared tasks.`,
    {
      ticketId: z.string().optional().describe("Ticket ID (auto-detected from Ralph state if not provided)"),
    },
    async ({ ticketId }) => {
      // Auto-detect ticket from Ralph state if not provided
      let resolvedTicketId = ticketId;
      let resolvedSessionId = null;

      if (!resolvedTicketId) {
        const ralphState = readRalphState();
        if (ralphState.ticketId) {
          resolvedTicketId = ralphState.ticketId;
          resolvedSessionId = ralphState.sessionId;
        } else {
          return {
            content: [{ type: "text", text: "No ticketId provided and no active Ralph session found. Provide a ticketId or start ticket work first." }],
            isError: true,
          };
        }
      }

      // Verify ticket exists
      const ticket = ensureTicketExists(db, resolvedTicketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${resolvedTicketId}. Use list_tickets to see available tickets.` }],
          isError: true,
        };
      }

      // Get existing tasks for snapshot
      const existingTasks = db.prepare(`
        SELECT id, subject, description, status, active_form as activeForm, position
        FROM claude_tasks WHERE ticket_id = ? ORDER BY position ASC
      `).all(resolvedTicketId);

      if (existingTasks.length === 0) {
        return {
          content: [{ type: "text", text: `No Claude tasks to clear for ticket "${ticket.title}".` }],
        };
      }

      const now = new Date().toISOString();

      // Create snapshot before clearing
      const snapshotId = randomUUID();
      db.prepare(`
        INSERT INTO claude_task_snapshots (id, ticket_id, session_id, tasks, reason, created_at)
        VALUES (?, ?, ?, ?, 'cleared', ?)
      `).run(snapshotId, resolvedTicketId, resolvedSessionId, JSON.stringify(existingTasks), now);

      // Delete all tasks
      const result = db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(resolvedTicketId);

      log.info(`Cleared ${result.changes} Claude tasks for ticket ${resolvedTicketId}`);

      return {
        content: [{
          type: "text",
          text: `## Claude Tasks Cleared

**Ticket:** ${ticket.title}
**Cleared:** ${result.changes} task(s)
**Snapshot:** Created for audit trail (ID: ${snapshotId.substring(0, 8)}...)

The task list for this ticket is now empty.`,
        }],
      };
    }
  );

  // Get task snapshots
  server.tool(
    "get_claude_task_snapshots",
    `Get historical snapshots of Claude's task list for a ticket.

Snapshots are created when tasks are cleared or when explicitly requested.
Useful for auditing task changes over time.

Args:
  ticketId: The ticket ID
  limit: Maximum number of snapshots to return (default: 10)

Returns array of snapshots with task data.`,
    {
      ticketId: z.string().describe("Ticket ID"),
      limit: z.number().optional().describe("Maximum snapshots to return (default: 10)"),
    },
    async ({ ticketId, limit = 10 }) => {
      // Verify ticket exists
      const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}. Use list_tickets to see available tickets.` }],
          isError: true,
        };
      }

      // Fetch snapshots
      const snapshots = db.prepare(`
        SELECT id, session_id, tasks, reason, created_at
        FROM claude_task_snapshots
        WHERE ticket_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(ticketId, limit);

      if (snapshots.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No task snapshots recorded for ticket "${ticket.title}".`,
          }],
        };
      }

      // Parse tasks JSON
      const formattedSnapshots = snapshots.map(s => {
        let parsedTasks = [];
        try {
          parsedTasks = JSON.parse(s.tasks);
        } catch (err) {
          log.warn(`Failed to parse tasks snapshot ${s.id}: ${err.message}`);
        }
        return {
          id: s.id,
          sessionId: s.session_id,
          reason: s.reason,
          createdAt: s.created_at,
          tasks: parsedTasks,
          taskCount: parsedTasks.length,
        };
      });

      return {
        content: [{
          type: "text",
          text: `## Task Snapshots for "${ticket.title}"

${formattedSnapshots.map((s, i) => {
  const date = new Date(s.createdAt).toLocaleString();
  return `### ${i + 1}. ${s.reason} - ${date}
**Tasks:** ${s.taskCount}
${s.tasks.map(t => `- ${getTaskStatusIcon(t.status)} ${t.subject}`).join("\n")}`;
}).join("\n\n")}`,
        }],
      };
    }
  );
}
