/**
 * Epic management tools for Brain Dump MCP server.
 * @module tools/epics
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import type { DbProject, DbEpic } from "../types.js";

/**
 * Register epic management tools with the MCP server.
 */
export function registerEpicTools(server: McpServer, db: Database.Database): void {
  // List epics
  server.tool(
    "list_epics",
    `List epics for a project.

Epics are used to group related tickets together.

Args:
  projectId: The project ID to list epics for

Returns array of epics with their IDs and titles.`,
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }: { projectId: string }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
        | DbProject
        | undefined;
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      const epics = db
        .prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY title")
        .all(projectId) as DbEpic[];

      return {
        content: [
          {
            type: "text",
            text:
              epics.length > 0
                ? JSON.stringify(epics)
                : `No epics found for project "${project.name}". Use create_epic to add one.`,
          },
        ],
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
    async ({
      projectId,
      title,
      description,
      color,
    }: {
      projectId: string;
      title: string;
      description?: string | undefined;
      color?: string | undefined;
    }) => {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
        | DbProject
        | undefined;
      if (!project) {
        return {
          content: [{ type: "text", text: `Project not found: ${projectId}` }],
          isError: true,
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      try {
        db.prepare(
          "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, title.trim(), description?.trim() || null, projectId, color || null, now);

        const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(id) as DbEpic;
        log.info(`Created epic: ${title} in project ${project.name}`);

        return {
          content: [
            {
              type: "text",
              text: `Epic created in "${project.name}"!\n\n${JSON.stringify(epic)}`,
            },
          ],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to create epic "${title}": ${errorMsg}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create epic: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Update epic
  server.tool(
    "update_epic",
    `Update an existing epic's title, description, or color.

Args:
  epicId: The epic ID to update
  title: New title (optional)
  description: New description (optional)
  color: New hex color (optional)

Returns the updated epic.`,
    {
      epicId: z.string().describe("Epic ID to update"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      color: z.string().optional().describe("New hex color"),
    },
    async ({
      epicId,
      title,
      description,
      color,
    }: {
      epicId: string;
      title?: string | undefined;
      description?: string | undefined;
      color?: string | undefined;
    }) => {
      const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpic | undefined;
      if (!epic) {
        return {
          content: [{ type: "text", text: `Epic not found: ${epicId}` }],
          isError: true,
        };
      }

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const values: (string | null)[] = [];

      if (title !== undefined) {
        updates.push("title = ?");
        values.push(title.trim());
      }
      if (description !== undefined) {
        updates.push("description = ?");
        values.push(description.trim() || null);
      }
      if (color !== undefined) {
        updates.push("color = ?");
        values.push(color || null);
      }

      if (updates.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No updates provided. Specify at least one of: title, description, color",
            },
          ],
          isError: true,
        };
      }

      values.push(epicId);

      try {
        db.prepare(`UPDATE epics SET ${updates.join(", ")} WHERE id = ?`).run(...values);

        const updatedEpic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpic;
        log.info(`Updated epic: ${updatedEpic.title}`);

        return {
          content: [{ type: "text", text: `Epic updated!\n\n${JSON.stringify(updatedEpic)}` }],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to update epic: ${errorMsg}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to update epic: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Delete epic
  server.tool(
    "delete_epic",
    `Delete an epic from a project.

Deleting an epic will unlink all associated tickets (they will remain in the project
but no longer belong to any epic). The tickets themselves are NOT deleted.

**Safety feature:** By default, this performs a DRY RUN showing what would be affected.
Set confirm=true to actually delete the epic.

Args:
  epicId: The epic ID to delete
  confirm: Set to true to actually delete (default: false, dry run only)

Returns:
  - If confirm=false: Preview of what would be affected
  - If confirm=true: Confirmation of deletion`,
    {
      epicId: z.string().describe("Epic ID to delete"),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set to true to actually delete (default: false, dry run)"),
    },
    async ({ epicId, confirm }: { epicId: string; confirm?: boolean | undefined }) => {
      const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as DbEpic | undefined;
      if (!epic) {
        return {
          content: [{ type: "text", text: `Epic not found: ${epicId}` }],
          isError: true,
        };
      }

      // Get tickets that would be unlinked
      const tickets = db
        .prepare("SELECT id, title, status FROM tickets WHERE epic_id = ?")
        .all(epicId) as Array<{ id: string; title: string; status: string }>;

      // Dry run - show what would be affected
      if (!confirm) {
        let preview = `⚠️  DRY RUN - Delete Epic Preview\n`;
        preview += `${"─".repeat(50)}\n\n`;
        preview += `Epic: "${epic.title}"\n`;
        preview += `ID: ${epicId}\n\n`;
        preview += `This will UNLINK ${tickets.length} ticket(s) from this epic:\n`;

        if (tickets.length > 0) {
          tickets.forEach((t, i) => {
            preview += `  ${i + 1}. [${t.status}] ${t.title}\n`;
          });
          preview += `\n(Tickets will remain in the project, just no longer associated with this epic)\n`;
        }

        preview += `\n${"─".repeat(50)}\n`;
        preview += `To confirm deletion, call delete_epic with confirm=true`;

        return {
          content: [{ type: "text", text: preview }],
        };
      }

      // Actually delete (wrapped in transaction for atomicity)
      const deleteEpic = db.transaction(() => {
        db.prepare("UPDATE tickets SET epic_id = NULL, updated_at = ? WHERE epic_id = ?").run(
          new Date().toISOString(),
          epicId
        );

        db.prepare("DELETE FROM epics WHERE id = ?").run(epicId);
      });

      try {
        deleteEpic();
        log.info(`Deleted epic: ${epic.title} (unlinked ${tickets.length} tickets)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`Failed to delete epic "${epic.title}": ${errorMsg}`);
        const userMessage = errorMsg.includes("SQLITE_BUSY")
          ? "The database is busy. Please try again in a moment."
          : errorMsg;
        return {
          content: [{ type: "text", text: `❌ Failed to delete epic: ${userMessage}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ Epic "${epic.title}" deleted successfully.\n\n${tickets.length} ticket(s) were unlinked from this epic.`,
          },
        ],
      };
    }
  );
}
