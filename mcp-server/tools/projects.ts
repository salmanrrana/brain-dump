/**
 * Project management tools for Brain Dump MCP server.
 * @module tools/projects
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { log } from "../lib/logging.js";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbProject } from "../types.js";

/**
 * Register project management tools with the MCP server.
 */
export function registerProjectTools(server: McpServer, db: Database.Database): void {
  // List all projects
  server.tool(
    "list_projects",
    `List all projects registered in Brain Dump.

Returns an array of projects with their IDs, names, and paths.
Use this to find the projectId needed for creating tickets.

Example response:
[
  { "id": "abc-123", "name": "My App", "path": "/home/user/my-app" }
]`,
    {},
    async () => {
      const projects = db.prepare("SELECT * FROM projects ORDER BY name").all() as DbProject[];
      return {
        content: [
          {
            type: "text",
            text:
              projects.length > 0
                ? JSON.stringify(projects)
                : "No projects found. Use create_project to add one.",
          },
        ],
      };
    }
  );

  // Find project by path
  server.tool(
    "find_project_by_path",
    `Find a project by filesystem path.

Searches for a project whose path matches or contains the given path.
Useful for auto-detecting which project you're working in.

Args:
  path: The directory path to search for (e.g., current working directory)

Returns the matching project or a message if no project found.`,
    { path: z.string().describe("Absolute filesystem path to search for") },
    async ({ path }: { path: string }) => {
      const projects = db.prepare("SELECT * FROM projects").all() as DbProject[];
      const matchingProject = projects.find(
        (p) => path.startsWith(p.path) || p.path.startsWith(path)
      );

      if (matchingProject) {
        return {
          content: [{ type: "text", text: JSON.stringify(matchingProject) }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `No project found for path: ${path}\n\nUse create_project to register this directory.`,
          },
        ],
      };
    }
  );

  // Create project
  server.tool(
    "create_project",
    `Create a new project in Brain Dump.

Use this when working in a directory that isn't yet registered.
The path must be an absolute filesystem path that exists.

Args:
  name: Display name for the project (e.g., "My App", "Backend API")
  path: Absolute path to project root (e.g., "/home/user/projects/my-app")
  color: Optional hex color (e.g., "#3b82f6" for blue)

Returns the created project with its generated ID.`,
    {
      name: z.string().describe("Project display name"),
      path: z.string().describe("Absolute filesystem path to project root"),
      color: z.string().optional().describe("Optional hex color (e.g., '#3b82f6')"),
    },
    async ({
      name: projectName,
      path,
      color,
    }: {
      name: string;
      path: string;
      color?: string | undefined;
    }) => {
      if (!existsSync(path)) {
        return {
          content: [{ type: "text", text: `Directory does not exist: ${path}` }],
          isError: true,
        };
      }

      const existing = db.prepare("SELECT * FROM projects WHERE path = ?").get(path) as
        | DbProject
        | undefined;
      if (existing) {
        return {
          content: [
            {
              type: "text",
              text: `Project already exists at this path:\n\n${JSON.stringify(existing)}`,
            },
          ],
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      try {
        db.prepare(
          "INSERT INTO projects (id, name, path, color, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(id, projectName.trim(), path, color || null, now);

        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as DbProject;
        log.info(`Created project: ${projectName} at ${path}`);

        return {
          content: [
            {
              type: "text",
              text: `Project created!\n\n${JSON.stringify(project)}`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to create project "${projectName}": ${errorMsg}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create project: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Delete project
  server.tool(
    "delete_project",
    `Delete a project and ALL its associated data.

⚠️  DESTRUCTIVE OPERATION: This will permanently delete:
- The project itself
- ALL tickets in the project
- ALL epics in the project
- ALL comments on tickets in the project

**Safety feature:** By default, this performs a DRY RUN showing what would be deleted.
Set confirm=true to actually delete everything.

Args:
  projectId: The project ID to delete
  confirm: Set to true to actually delete (default: false, dry run only)

Returns:
  - If confirm=false: Preview of everything that would be deleted
  - If confirm=true: Confirmation of deletion with counts`,
    {
      projectId: z.string().describe("Project ID to delete"),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set to true to actually delete (default: false, dry run)"),
    },
    async ({ projectId, confirm }: { projectId: string; confirm?: boolean }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
        | DbProject
        | undefined;
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      // Gather all data that would be deleted
      const epics = db
        .prepare("SELECT id, title FROM epics WHERE project_id = ?")
        .all(projectId) as Array<{ id: string; title: string }>;
      const tickets = db
        .prepare("SELECT id, title, status, epic_id FROM tickets WHERE project_id = ?")
        .all(projectId) as Array<{
        id: string;
        title: string;
        status: string;
        epic_id: string | null;
      }>;
      const ticketIds = tickets.map((t) => t.id);

      let commentCount = 0;
      if (ticketIds.length > 0) {
        const placeholders = ticketIds.map(() => "?").join(",");
        const countResult = db
          .prepare(
            `SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id IN (${placeholders})`
          )
          .get(...ticketIds) as { count: number };
        commentCount = countResult.count;
      }

      // Dry run - show what would be deleted
      if (!confirm) {
        let preview = `⚠️  DRY RUN - Delete Project Preview\n`;
        preview += `${"═".repeat(50)}\n\n`;
        preview += `Project: "${project.name}"\n`;
        preview += `Path: ${project.path}\n`;
        preview += `ID: ${projectId}\n\n`;
        preview += `${"─".repeat(50)}\n`;
        preview += `This will PERMANENTLY DELETE:\n`;
        preview += `${"─".repeat(50)}\n\n`;

        // Epics
        preview += `📁 ${epics.length} Epic(s):\n`;
        if (epics.length > 0) {
          epics.forEach((e, i) => {
            preview += `   ${i + 1}. ${e.title}\n`;
          });
        } else {
          preview += `   (none)\n`;
        }
        preview += `\n`;

        // Tickets grouped by epic
        preview += `🎫 ${tickets.length} Ticket(s):\n`;
        if (tickets.length > 0) {
          // Group tickets by epic
          const ticketsByEpic: Record<string, typeof tickets> = {};
          tickets.forEach((t) => {
            const epicKey = t.epic_id || "_none_";
            if (!ticketsByEpic[epicKey]) ticketsByEpic[epicKey] = [];
            ticketsByEpic[epicKey].push(t);
          });

          // Show tickets without epic first
          const noEpicTickets = ticketsByEpic["_none_"];
          if (noEpicTickets) {
            preview += `   (No epic):\n`;
            noEpicTickets.forEach((t) => {
              preview += `     • [${t.status}] ${t.title}\n`;
            });
          }

          // Show tickets by epic
          epics.forEach((epic) => {
            if (ticketsByEpic[epic.id]) {
              preview += `   ${epic.title}:\n`;
              ticketsByEpic[epic.id]!.forEach((t) => {
                preview += `     • [${t.status}] ${t.title}\n`;
              });
            }
          });
        } else {
          preview += `   (none)\n`;
        }
        preview += `\n`;

        // Comments
        preview += `💬 ${commentCount} Comment(s)\n\n`;

        preview += `${"═".repeat(50)}\n`;
        preview += `⚠️  THIS ACTION CANNOT BE UNDONE!\n`;
        preview += `${"═".repeat(50)}\n\n`;
        preview += `To confirm deletion, call delete_project with confirm=true`;

        return {
          content: [{ type: "text", text: preview }],
        };
      }

      // Actually delete (wrapped in transaction for atomicity)
      const deleteProject = db.transaction(() => {
        // 1. Delete comments
        if (ticketIds.length > 0) {
          const placeholders = ticketIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM ticket_comments WHERE ticket_id IN (${placeholders})`).run(
            ...ticketIds
          );
        }

        // 2. Delete tickets
        db.prepare("DELETE FROM tickets WHERE project_id = ?").run(projectId);

        // 3. Delete epics
        db.prepare("DELETE FROM epics WHERE project_id = ?").run(projectId);

        // 4. Delete project
        db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      });

      try {
        deleteProject();
        log.info(
          `Deleted project: ${project.name} (${tickets.length} tickets, ${epics.length} epics, ${commentCount} comments)`
        );
      } catch (error) {
        log.error(
          `Failed to delete project "${project.name}": ${error instanceof Error ? error.message : String(error)}`
        );
        const userMessage =
          error instanceof Error && error.message.includes("SQLITE_BUSY")
            ? "The database is busy. Please try again in a moment."
            : error instanceof Error
              ? error.message
              : "Unknown error";
        return {
          content: [{ type: "text", text: `❌ Failed to delete project: ${userMessage}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ Project "${project.name}" deleted successfully.\n\nDeleted:\n- ${epics.length} epic(s)\n- ${tickets.length} ticket(s)\n- ${commentCount} comment(s)`,
          },
        ],
      };
    }
  );
}
