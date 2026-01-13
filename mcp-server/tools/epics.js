/**
 * Epic management tools for Brain Dump MCP server.
 * @module tools/epics
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";

/**
 * Register epic management tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerEpicTools(server, db) {
  // List epics
  server.tool(
    "list_epics",
    `List epics for a project.

Epics are used to group related tickets together.

Args:
  projectId: The project ID to list epics for

Returns array of epics with their IDs and titles.`,
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      const epics = db.prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY title").all(projectId);

      return {
        content: [{
          type: "text",
          text: epics.length > 0
            ? JSON.stringify(epics, null, 2)
            : `No epics found for project "${project.name}". Use create_epic to add one.`,
        }],
      };
    }
  );

  // Create epic
  server.tool(
    "create_epic",
    `Create a new epic to group related tickets.

Args:
  projectId: Project ID to create the epic in
  title: Epic title
  description: Optional description
  color: Optional hex color

Returns the created epic.`,
    {
      projectId: z.string().describe("Project ID"),
      title: z.string().describe("Epic title"),
      description: z.string().optional().describe("Optional description"),
      color: z.string().optional().describe("Optional hex color"),
    },
    async ({ projectId, title, description, color }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, title.trim(), description?.trim() || null, projectId, color || null, now);

      const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(id);
      log.info(`Created epic: ${title} in project ${project.name}`);

      return {
        content: [{ type: "text", text: `Epic created in "${project.name}"!\n\n${JSON.stringify(epic, null, 2)}` }],
      };
    }
  );
}
