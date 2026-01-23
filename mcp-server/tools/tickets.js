/**
 * Ticket management tools for Brain Dump MCP server.
 * @module tools/tickets
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";

const STATUSES = ["backlog", "ready", "in_progress", "review", "ai_review", "human_review", "done"];
const PRIORITIES = ["low", "medium", "high"];

/** Valid attachment types for AI context */
const ATTACHMENT_TYPES = [
  "mockup",
  "wireframe",
  "bug-screenshot",
  "expected-behavior",
  "actual-behavior",
  "diagram",
  "error-message",
  "console-log",
  "reference",
  "asset",
];

/** Valid attachment priorities */
const ATTACHMENT_PRIORITIES = ["primary", "supplementary"];

/** Valid attachment uploaders - exported for use in other modules if needed */
const _ATTACHMENT_UPLOADERS = ["human", "claude", "ralph", "opencode", "cursor", "windsurf"];

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

  // Delete ticket
  server.tool(
    "delete_ticket",
    `Delete a ticket and all its associated comments.

**Safety feature:** By default, this performs a DRY RUN showing what would be deleted.
Set confirm=true to actually delete the ticket.

Args:
  ticketId: The ticket ID to delete
  confirm: Set to true to actually delete (default: false, dry run only)

Returns:
  - If confirm=false: Preview of the ticket and comments that would be deleted
  - If confirm=true: Confirmation of deletion`,
    {
      ticketId: z.string().describe("Ticket ID to delete"),
      confirm: z.boolean().optional().default(false).describe("Set to true to actually delete (default: false, dry run)"),
    },
    async ({ ticketId, confirm }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, e.title as epic_title
        FROM tickets t
        JOIN projects p ON t.project_id = p.id
        LEFT JOIN epics e ON t.epic_id = e.id
        WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      // Get comments that would be deleted
      const comments = db.prepare("SELECT id, author, type, created_at FROM ticket_comments WHERE ticket_id = ?").all(ticketId);

      // Dry run - show what would be deleted
      if (!confirm) {
        let preview = `⚠️  DRY RUN - Delete Ticket Preview\n`;
        preview += `${"─".repeat(50)}\n\n`;
        preview += `Ticket: "${ticket.title}"\n`;
        preview += `ID: ${ticketId}\n`;
        preview += `Status: ${ticket.status}\n`;
        preview += `Project: ${ticket.project_name}\n`;
        if (ticket.epic_title) {
          preview += `Epic: ${ticket.epic_title}\n`;
        }
        preview += `\n`;

        if (ticket.description) {
          preview += `Description:\n${ticket.description.substring(0, 200)}${ticket.description.length > 200 ? "..." : ""}\n\n`;
        }

        preview += `${"─".repeat(50)}\n`;
        preview += `This will also delete ${comments.length} comment(s):\n`;
        if (comments.length > 0) {
          comments.forEach((c, i) => {
            const date = new Date(c.created_at).toLocaleDateString();
            preview += `  ${i + 1}. [${c.type}] by ${c.author} on ${date}\n`;
          });
        } else {
          preview += `  (none)\n`;
        }

        preview += `\n${"─".repeat(50)}\n`;
        preview += `To confirm deletion, call delete_ticket with confirm=true`;

        return {
          content: [{ type: "text", text: preview }],
        };
      }

      // Actually delete (wrapped in transaction for atomicity)
      const deleteTicket = db.transaction(() => {
        // 1. Delete comments
        db.prepare("DELETE FROM ticket_comments WHERE ticket_id = ?").run(ticketId);

        // 2. Delete ticket
        db.prepare("DELETE FROM tickets WHERE id = ?").run(ticketId);
      });

      try {
        deleteTicket();
        log.info(`Deleted ticket: ${ticket.title} (${comments.length} comments)`);
      } catch (error) {
        log.error(`Failed to delete ticket "${ticket.title}": ${error.message}`);
        const userMessage = error.message.includes("SQLITE_BUSY")
          ? "The database is busy. Please try again in a moment."
          : error.message;
        return {
          content: [{ type: "text", text: `❌ Failed to delete ticket: ${userMessage}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `✅ Ticket "${ticket.title}" deleted successfully.\n\nDeleted ${comments.length} comment(s).`,
        }],
      };
    }
  );

  // Update attachment metadata
  server.tool(
    "update_attachment_metadata",
    `Update metadata for a ticket attachment.

Use this to add context about an attachment's purpose (mockup, bug screenshot, etc.).
This helps AI understand how to interpret and act on the attachment.

Args:
  ticketId: The ticket ID containing the attachment
  attachmentId: The attachment ID to update (or filename for legacy attachments)
  metadata: Object with fields to update:
    - type: Attachment type (mockup, wireframe, bug-screenshot, expected-behavior, actual-behavior, diagram, error-message, console-log, reference, asset)
    - description: Human-provided context about the attachment
    - priority: Importance level (primary, supplementary)
    - linkedCriteria: Array of acceptance criteria IDs to link

Returns the updated attachment.`,
    {
      ticketId: z.string().describe("Ticket ID containing the attachment"),
      attachmentId: z.string().describe("Attachment ID or filename to update"),
      metadata: z.object({
        type: z.enum(ATTACHMENT_TYPES).optional().describe("Attachment type"),
        description: z.string().optional().describe("Human-provided context"),
        priority: z.enum(ATTACHMENT_PRIORITIES).optional().describe("Importance level"),
        linkedCriteria: z.array(z.string()).optional().describe("Linked acceptance criteria IDs"),
      }).describe("Metadata fields to update"),
    },
    async ({ ticketId, attachmentId, metadata }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      // Parse existing attachments
      let attachments = [];
      try {
        attachments = ticket.attachments ? JSON.parse(ticket.attachments) : [];
      } catch (e) {
        return {
          content: [{ type: "text", text: `Failed to parse attachments: ${e.message}` }],
          isError: true,
        };
      }

      // Normalize attachments (handle legacy string format)
      const normalizedAttachments = attachments.map((item, index) => {
        // Legacy format: just a filename string
        if (typeof item === "string") {
          return {
            id: `legacy-${index}-${item}`,
            filename: item,
            type: "reference",
            priority: "primary",
            uploadedBy: "human",
            uploadedAt: new Date().toISOString(),
          };
        }
        // Already in object format
        return item;
      });

      // Find the attachment by ID or filename
      const attachmentIndex = normalizedAttachments.findIndex(
        (a) => a.id === attachmentId || a.filename === attachmentId
      );

      if (attachmentIndex === -1) {
        const availableAttachments = normalizedAttachments
          .map((a) => `  - ${a.id}: "${a.filename}" (${a.type})`)
          .join("\n");
        return {
          content: [{
            type: "text",
            text: `Attachment not found: ${attachmentId}\n\nAvailable attachments:\n${availableAttachments || "(none)"}`,
          }],
          isError: true,
        };
      }

      // Update the attachment metadata
      const attachment = normalizedAttachments[attachmentIndex];
      if (metadata.type !== undefined) {
        attachment.type = metadata.type;
      }
      if (metadata.description !== undefined) {
        attachment.description = metadata.description;
      }
      if (metadata.priority !== undefined) {
        attachment.priority = metadata.priority;
      }
      if (metadata.linkedCriteria !== undefined) {
        attachment.linkedCriteria = metadata.linkedCriteria;
      }

      // Save back to database
      const now = new Date().toISOString();
      db.prepare("UPDATE tickets SET attachments = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(normalizedAttachments),
        now,
        ticketId
      );

      log.info(`Updated attachment metadata for ${attachmentId} in ticket ${ticketId}`, {
        type: attachment.type,
        priority: attachment.priority,
      });

      return {
        content: [{
          type: "text",
          text: `Attachment metadata updated:\n\n${JSON.stringify(attachment, null, 2)}`,
        }],
      };
    }
  );
}
