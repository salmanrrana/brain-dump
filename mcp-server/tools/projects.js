/**
 * Project management tools for Brain Dump MCP server.
 * @module tools/projects
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { log } from "../lib/logging.js";

/**
 * Register project management tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerProjectTools(server, db) {
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
      const projects = db.prepare("SELECT * FROM projects ORDER BY name").all();
      return {
        content: [{
          type: "text",
          text: projects.length > 0
            ? JSON.stringify(projects, null, 2)
            : "No projects found. Use create_project to add one.",
        }],
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
    async ({ path }) => {
      const projects = db.prepare("SELECT * FROM projects").all();
      const matchingProject = projects.find(
        (p) => path.startsWith(p.path) || p.path.startsWith(path)
      );

      if (matchingProject) {
        return {
          content: [{ type: "text", text: JSON.stringify(matchingProject, null, 2) }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `No project found for path: ${path}\n\nUse create_project to register this directory.`,
        }],
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
    async ({ name: projectName, path, color }) => {
      if (!existsSync(path)) {
        return {
          content: [{ type: "text", text: `Directory does not exist: ${path}` }],
          isError: true,
        };
      }

      const existing = db.prepare("SELECT * FROM projects WHERE path = ?").get(path);
      if (existing) {
        return {
          content: [{
            type: "text",
            text: `Project already exists at this path:\n\n${JSON.stringify(existing, null, 2)}`,
          }],
        };
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        "INSERT INTO projects (id, name, path, color, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, projectName.trim(), path, color || null, now);

      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
      log.info(`Created project: ${projectName} at ${path}`);

      return {
        content: [{
          type: "text",
          text: `Project created!\n\n${JSON.stringify(project, null, 2)}`,
        }],
      };
    }
  );
}
