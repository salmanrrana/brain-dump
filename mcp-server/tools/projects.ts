/**
 * Project management tools for Brain Dump MCP server.
 *
 * These are thin wrappers around core/project.ts functions.
 * Business logic lives in the core layer; this file only handles
 * MCP protocol formatting and Zod input schemas.
 *
 * @module tools/projects
 */
import { z } from "zod";
import { log } from "../lib/logging.js";
import { mcpError } from "../lib/mcp-response.ts";
import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CoreError } from "../../core/errors.ts";
import {
  listProjects,
  findProjectByPath,
  createProject,
  deleteProject,
} from "../../core/project.ts";

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
      const projects = listProjects(db);
      return {
        content: [
          {
            type: "text" as const,
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
      const project = findProjectByPath(db, path);

      if (project) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(project) }],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
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
      try {
        const project = createProject(db, { name: projectName, path, color });

        log.info(`Created project: ${projectName} at ${path}`);

        return {
          content: [
            {
              type: "text" as const,
              text: `Project created!\n\n${JSON.stringify(project)}`,
            },
          ],
        };
      } catch (err) {
        if (err instanceof CoreError) {
          log.error(`Failed to create project "${projectName}": ${err.message}`);
        }
        return mcpError(err);
      }
    }
  );

  // Delete project
  server.tool(
    "delete_project",
    `Delete a project and ALL its associated data.

\u26a0\ufe0f  DESTRUCTIVE OPERATION: This will permanently delete:
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
      try {
        const result = deleteProject(db, projectId, confirm ?? false);

        if (result.dryRun) {
          return {
            content: [
              {
                type: "text" as const,
                text: `\u26a0\ufe0f  DRY RUN - Delete Project Preview\n${"─".repeat(50)}\n\nProject: "${result.wouldDelete.title}"\nID: ${result.wouldDelete.id}\nChildren: ${result.wouldDelete.childCount}\n\n${result.warning}`,
              },
            ],
          };
        }

        log.info(
          `Deleted project: ${result.deleted.title} (${result.deleted.childrenDeleted} children)`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Project "${result.deleted.title}" deleted successfully.\n\nDeleted ${result.deleted.childrenDeleted} associated item(s).`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
