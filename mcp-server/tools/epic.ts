/**
 * Consolidated epic resource tool for Brain Dump MCP server.
 *
 * Merges 4 individual epic tools into 1 action-dispatched tool.
 * Business logic lives in core/epic.ts.
 *
 * @module tools/epic
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import { CoreError } from "../../core/errors.ts";
import { createEpic, listEpics, updateEpic, deleteEpic } from "../../core/epic.ts";

const ACTIONS = ["create", "list", "update", "delete"] as const;

/**
 * Register the consolidated epic tool with the MCP server.
 */
export function registerEpicTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "epic",
    `Manage epics in Brain Dump. Epics group related tickets together.

## Actions

### create
Create a new epic to group related tickets.
Required params: projectId, title
Optional params: description, color

### list
List all epics for a project.
Required params: projectId

### update
Update an epic's title, description, or color.
Required params: epicId
Optional params: title, description, color

### delete
Delete an epic (unlinks tickets but does NOT delete them). DRY RUN by default.
Required params: epicId
Optional params: confirm

## Parameters
- action: (required) The operation to perform
- projectId: Project ID. Required for: create, list
- epicId: Epic ID. Required for: update, delete
- title: Epic title. Required for: create. Optional for: update
- description: Epic description. Optional for: create, update
- color: Hex color. Optional for: create, update
- confirm: Confirm deletion. Optional for: delete`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      projectId: z.string().optional().describe("Project ID. Required for: create, list"),
      epicId: z.string().optional().describe("Epic ID. Required for: update, delete"),
      title: z.string().optional().describe("Epic title. Required for: create"),
      description: z.string().optional().describe("Epic description"),
      color: z.string().optional().describe("Hex color"),
      confirm: z.boolean().optional().describe("Confirm deletion"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      projectId?: string | undefined;
      epicId?: string | undefined;
      title?: string | undefined;
      description?: string | undefined;
      color?: string | undefined;
      confirm?: boolean | undefined;
    }) => {
      try {
        switch (params.action) {
          case "create": {
            const projectId = requireParam(params.projectId, "projectId", "create");
            const title = requireParam(params.title, "title", "create");
            const epic = createEpic(db, {
              projectId,
              title,
              description: params.description,
              color: params.color,
            });
            log.info(`Created epic: ${title}`);
            return formatResult(epic, "Epic created!");
          }

          case "list": {
            const projectId = requireParam(params.projectId, "projectId", "list");
            const epics = listEpics(db, projectId);
            if (epics.length === 0) {
              return formatEmpty("epics");
            }
            return formatResult(epics);
          }

          case "update": {
            const epicId = requireParam(params.epicId, "epicId", "update");
            const epic = updateEpic(db, epicId, {
              title: params.title,
              description: params.description,
              color: params.color,
            });
            log.info(`Updated epic: ${epic.title}`);
            return formatResult(epic, "Epic updated!");
          }

          case "delete": {
            const epicId = requireParam(params.epicId, "epicId", "delete");
            const result = deleteEpic(db, epicId, params.confirm ?? false);

            if (result.dryRun) {
              return formatResult(result.warning);
            }

            log.info(
              `Deleted epic: ${result.deleted.title} (unlinked ${result.deleted.childrenDeleted} tickets)`
            );
            return formatResult(
              `Epic "${result.deleted.title}" deleted successfully. ${result.deleted.childrenDeleted} ticket(s) were unlinked.`
            );
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`epic/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
