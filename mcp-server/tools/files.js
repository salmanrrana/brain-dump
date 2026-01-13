/**
 * File linking tools for Brain Dump MCP server.
 * @module tools/files
 */
import { z } from "zod";
import { log } from "../lib/logging.js";

/**
 * Register file linking tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerFileTools(server, db) {
  // Link files to ticket
  server.tool(
    "link_files_to_ticket",
    `Link files to a ticket.

Associates file paths with a ticket for context tracking.
Multiple files can be linked to a single ticket.

Use this to track which files are related to a ticket.
Helpful for providing context when working on related issues.

Args:
  ticketId: The ticket ID to link files to
  files: Array of file paths (relative or absolute)

Returns:
  Updated list of linked files for the ticket.`,
    {
      ticketId: z.string().describe("Ticket ID to link files to"),
      files: z.array(z.string()).describe("Array of file paths to link"),
    },
    async ({ ticketId, files }) => {
      if (files.length === 0) {
        return { content: [{ type: "text", text: "files array cannot be empty" }], isError: true };
      }

      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      let linkedFiles = [];
      if (ticket.linked_files) {
        try { linkedFiles = JSON.parse(ticket.linked_files); } catch { linkedFiles = []; }
      }

      const newFiles = [];
      for (const file of files) {
        let normalizedPath = file;
        if (file.startsWith(ticket.project_path)) {
          normalizedPath = file.substring(ticket.project_path.length).replace(/^\//, "");
        }
        if (!linkedFiles.includes(normalizedPath)) {
          linkedFiles.push(normalizedPath);
          newFiles.push(normalizedPath);
        }
      }

      const now = new Date().toISOString();
      db.prepare("UPDATE tickets SET linked_files = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(linkedFiles), now, ticketId);

      log.info(`Linked ${newFiles.length} files to ticket ${ticketId}`);

      return {
        content: [{
          type: "text",
          text: `Files linked to ticket "${ticket.title}"!\n\nNew files added: ${newFiles.length}\n${newFiles.length > 0 ? newFiles.map(f => `  + ${f}`).join("\n") : "  (all files were already linked)"}\n\nAll linked files (${linkedFiles.length}):\n${linkedFiles.map(f => `  - ${f}`).join("\n")}`,
        }],
      };
    }
  );

  // Get tickets for file
  server.tool(
    "get_tickets_for_file",
    `Find tickets related to a file.

Searches for tickets that have this file linked.
Useful for getting context when working on a file.

Supports partial path matching - will find tickets where
the linked file path contains the search path.

Args:
  filePath: The file path to search for
  projectId: Optional - limit search to a specific project

Returns:
  Array of tickets that have this file linked.`,
    {
      filePath: z.string().describe("File path to search for (supports partial matching)"),
      projectId: z.string().optional().describe("Optional project ID to limit search"),
    },
    async ({ filePath, projectId }) => {
      const searchPath = filePath.replace(/^\//, "");

      let query = `
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id
        WHERE t.linked_files IS NOT NULL
      `;
      const params = [];

      if (projectId) {
        query += " AND t.project_id = ?";
        params.push(projectId);
      }

      const allTickets = db.prepare(query).all(...params);

      const matchingTickets = allTickets.filter(ticket => {
        try {
          const linkedFiles = JSON.parse(ticket.linked_files);
          return linkedFiles.some(f => f.includes(searchPath) || searchPath.includes(f));
        } catch {
          return false;
        }
      });

      if (matchingTickets.length === 0) {
        return {
          content: [{ type: "text", text: `No tickets found with file: ${filePath}\n\nTip: Use link_files_to_ticket to associate files with tickets.` }],
        };
      }

      const results = matchingTickets.map(t => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority,
        project: t.project_name, linkedFiles: JSON.parse(t.linked_files),
      }));

      log.info(`Found ${matchingTickets.length} tickets for file ${filePath}`);

      return {
        content: [{
          type: "text",
          text: `Found ${matchingTickets.length} ticket(s) for file "${filePath}":\n\n${results.map(t => `## ${t.title}\n- ID: ${t.id}\n- Status: ${t.status}\n- Priority: ${t.priority || "none"}\n- Project: ${t.project}\n- Linked files: ${t.linkedFiles.join(", ")}`).join("\n\n")}`,
        }],
      };
    }
  );
}
