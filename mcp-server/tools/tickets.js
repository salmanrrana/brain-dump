/**
 * Ticket management tools for Brain Dump MCP server.
 * @module tools/tickets
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";

const STATUSES = ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"];
const PRIORITIES = ["low", "medium", "high"];

/**
 * Register ticket management tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerTicketTools(server, db) {
  // Create ticket
  server.tool(
    "create_ticket",
    `Create a new ticket in Brain Dump.

The ticket will be added to the Backlog column.
First use find_project_by_path or list_projects to get the projectId.

Args:
  projectId: ID of the project (use list_projects to find)
  title: Short, descriptive title for the ticket
  description: Optional detailed description (supports markdown)
  priority: Optional priority level (low, medium, high)
  epicId: Optional epic ID to group the ticket
  tags: Optional array of tags for categorization

Returns the created ticket with its generated ID.`,
    {
      projectId: z.string().describe("Project ID (from list_projects or find_project_by_path)"),
      title: z.string().describe("Ticket title - short, descriptive summary"),
      description: z.string().optional().describe("Detailed description (markdown supported)"),
      priority: z.enum(PRIORITIES).optional().describe("Priority level"),
      epicId: z.string().optional().describe("Epic ID to associate with"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async ({ projectId, title, description, priority, epicId, tags }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}\n\nUse list_projects to see available projects.` }],
          isError: true,
        };
      }

      if (epicId) {
        const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId);
        if (!epic) {
          return {
            content: [{ type: "text", text: `Epic not found: ${epicId}\n\nUse list_epics to see available epics.` }],
            isError: true,
          };
        }
      }

      const maxPos = db.prepare(
        "SELECT MAX(position) as maxPos FROM tickets WHERE project_id = ? AND status = 'backlog'"
      ).get(projectId);
      const position = (maxPos?.maxPos ?? 0) + 1;

      const id = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, tags, created_at, updated_at)
         VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, title.trim(), description?.trim() || null, priority || null, position, projectId, epicId || null, tags ? JSON.stringify(tags) : null, now, now);

      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
      log.info(`Created ticket: ${title} in project ${project.name}`);

      return {
        content: [{ type: "text", text: `Ticket created in "${project.name}"!\n\n${JSON.stringify(ticket, null, 2)}` }],
      };
    }
  );

  // List tickets
  server.tool(
    "list_tickets",
    `List tickets with optional filters.

Args:
  projectId: Optional - filter by project
  status: Optional - filter by status (backlog, ready, in_progress, review, ai_review, human_review, done)
  limit: Optional - max tickets to return (default: 20)

Returns array of tickets sorted by creation date (newest first).`,
    {
      projectId: z.string().optional().describe("Filter by project ID"),
      status: z.enum(STATUSES).optional().describe("Filter by status"),
      limit: z.number().optional().describe("Max tickets to return (default: 20)"),
    },
    async ({ projectId, status, limit = 20 }) => {
      let query = "SELECT t.*, p.name as project_name FROM tickets t JOIN projects p ON t.project_id = p.id WHERE 1=1";
      const params = [];

      if (projectId) {
        query += " AND t.project_id = ?";
        params.push(projectId);
      }
      if (status) {
        query += " AND t.status = ?";
        params.push(status);
      }

      query += " ORDER BY t.created_at DESC LIMIT ?";
      params.push(Math.min(limit, 100));

      const tickets = db.prepare(query).all(...params);

      return {
        content: [{
          type: "text",
          text: tickets.length > 0 ? JSON.stringify(tickets, null, 2) : "No tickets found matching the criteria.",
        }],
      };
    }
  );

  // Update ticket status
  server.tool(
    "update_ticket_status",
    `Update a ticket's status.

Status flow: backlog -> ready -> in_progress -> review -> done
Alternate flow: in_progress -> ai_review -> human_review -> done

Args:
  ticketId: The ticket ID to update
  status: New status value

Returns the updated ticket.`,
    {
      ticketId: z.string().describe("Ticket ID to update"),
      status: z.enum(STATUSES).describe("New status"),
    },
    async ({ ticketId, status }) => {
      const existing = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!existing) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const now = new Date().toISOString();
      const completedAt = status === "done" ? now : null;

      db.prepare("UPDATE tickets SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?").run(status, now, completedAt, ticketId);

      const updated = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      log.info(`Updated ticket ${ticketId} status: ${existing.status} -> ${status}`);

      return {
        content: [{ type: "text", text: `Ticket status updated: ${existing.status} -> ${status}\n\n${JSON.stringify(updated, null, 2)}` }],
      };
    }
  );
}
