/**
 * Epic management tools for Brain Dump MCP server.
 *
 * These are thin wrappers around core/epic.ts functions.
 * Business logic lives in the core layer; this file only handles
 * MCP protocol formatting and Zod input schemas.
 *
 * @module tools/epics
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import { createEpic, listEpics, updateEpic, deleteEpic } from "../../core/epic.ts";

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
      try {
        const epics = listEpics(db, projectId);

        return {
          content: [
            {
              type: "text" as const,
              text:
                epics.length > 0
                  ? JSON.stringify(epics)
                  : `No epics found for project. Use create_epic to add one.`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to list epics: ${err.message}`);
        }
        return mcpError(err);
      }
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
      try {
        const epic = createEpic(db, { projectId, title, description, color });

        log.info(`Created epic: ${title}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Epic created!\n\n${JSON.stringify(epic)}`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to create epic "${title}": ${err.message}`);
        }
        return mcpError(err);
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
      try {
        const epic = updateEpic(db, epicId, { title, description, color });

        log.info(`Updated epic: ${epic.title}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Epic updated!\n\n${JSON.stringify(epic)}`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to update epic: ${err.message}`);
        }
        return mcpError(err);
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
      try {
        const result = deleteEpic(db, epicId, confirm ?? false);

        if (result.dryRun) {
          return {
            content: [{ type: "text" as const, text: result.warning }],
          };
        }

        log.info(
          `Deleted epic: ${result.deleted.title} (unlinked ${result.deleted.childrenDeleted} tickets)`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Epic "${result.deleted.title}" deleted successfully. ${result.deleted.childrenDeleted} ticket(s) were unlinked.`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to delete epic: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
