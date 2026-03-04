/**
 * Consolidated project resource tool for Brain Dump MCP server.
 *
 * Merges 4 individual project tools into 1 action-dispatched tool.
 * Business logic lives in core/project.ts.
 *
 * @module tools/project
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import { requireParam, formatResult, formatEmpty } from "../lib/mcp-format.ts";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CoreError } from "../../core/errors.ts";
import {
  listProjects,
  findProjectByPath,
  createProject,
  deleteProject,
} from "../../core/project.ts";

const ACTIONS = ["list", "find-by-path", "create", "delete"] as const;

/**
 * Register the consolidated project tool with the MCP server.
 */
export function registerProjectTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "project",
    `Manage projects in Brain Dump.

### list - List all registered projects (IDs, names, paths)
### find-by-path - Find a project by filesystem path (auto-detect current project)
### create - Register a new project directory
### delete - Delete project and ALL associated data. DRY RUN by default; set confirm=true to delete.`,
    {
      action: z.enum(ACTIONS).describe("The operation to perform"),
      projectId: z.string().optional().describe("Project ID. Required for: delete"),
      path: z.string().optional().describe("Filesystem path. Required for: find-by-path, create"),
      name: z.string().optional().describe("Display name. Required for: create"),
      color: z.string().optional().describe("Hex color. Optional for: create"),
      confirm: z.boolean().optional().describe("Confirm deletion. Optional for: delete"),
    },
    async (params: {
      action: (typeof ACTIONS)[number];
      projectId?: string | undefined;
      path?: string | undefined;
      name?: string | undefined;
      color?: string | undefined;
      confirm?: boolean | undefined;
    }) => {
      try {
        switch (params.action) {
          case "list": {
            const projects = listProjects(db);
            if (projects.length === 0) {
              return formatEmpty("projects");
            }
            return formatResult(projects);
          }

          case "find-by-path": {
            const searchPath = requireParam(params.path, "path", "find-by-path");
            const project = findProjectByPath(db, searchPath);
            if (project) {
              return formatResult(project);
            }
            return formatResult(
              `No project found for path: ${searchPath}\n\nUse action 'create' to register this directory.`
            );
          }

          case "create": {
            const projectName = requireParam(params.name, "name", "create");
            const projectPath = requireParam(params.path, "path", "create");
            const project = createProject(db, {
              name: projectName,
              path: projectPath,
              color: params.color,
            });
            log.info(`Created project: ${projectName} at ${projectPath}`);
            return formatResult(project, "Project created!");
          }

          case "delete": {
            const projectId = requireParam(params.projectId, "projectId", "delete");
            const result = deleteProject(db, projectId, params.confirm ?? false);

            if (result.dryRun) {
              return formatResult(
                `DRY RUN - Delete Project Preview\n${"─".repeat(50)}\n\nProject: "${result.wouldDelete.title}"\nID: ${result.wouldDelete.id}\nChildren: ${result.wouldDelete.childCount}\n\n${result.warning}`
              );
            }

            log.info(
              `Deleted project: ${result.deleted.title} (${result.deleted.childrenDeleted} children)`
            );
            return formatResult(
              `Project "${result.deleted.title}" deleted successfully.\nDeleted ${result.deleted.childrenDeleted} associated item(s).`
            );
          }
        }
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`project/${params.action} failed: ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );
}
