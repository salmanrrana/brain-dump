#!/usr/bin/env node

/**
 * Brain Dumpy MCP Server
 *
 * Provides tools for managing tickets in Brain Dumpy from any project.
 * Follows MCP best practices: https://modelcontextprotocol.io/docs/develop/build-server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";

// =============================================================================
// LOGGING - All output MUST go to stderr for STDIO transport
// =============================================================================
const log = {
  info: (msg) => console.error(`[brain-dumpy] ${msg}`),
  error: (msg, err) => console.error(`[brain-dumpy] ERROR: ${msg}`, err?.message || ""),
  debug: (msg) => console.error(`[brain-dumpy] DEBUG: ${msg}`),
};

// =============================================================================
// DATABASE CONNECTION
// =============================================================================
const dbPath = join(homedir(), ".brain-dump", "brain-dump.db");
let db;

try {
  if (!existsSync(dbPath)) {
    log.error(`Database not found at ${dbPath}`);
    log.info("Run Brain Dumpy at least once to create the database: cd /path/to/brain-dumpy && pnpm dev");
    process.exit(1);
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  log.info(`Connected to database: ${dbPath}`);

  // Add linked_commits column if it doesn't exist (for link_commit_to_ticket tool)
  try {
    const columns = db.prepare("PRAGMA table_info(tickets)").all();
    const hasLinkedCommits = columns.some(col => col.name === "linked_commits");
    if (!hasLinkedCommits) {
      db.prepare("ALTER TABLE tickets ADD COLUMN linked_commits TEXT").run();
      log.info("Added linked_commits column to tickets table");
    }
  } catch (migrationError) {
    log.error("Failed to check/add linked_commits column", migrationError);
  }
} catch (error) {
  log.error(`Failed to open database at ${dbPath}`, error);
  process.exit(1);
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================
function validateRequired(args, fields) {
  const missing = fields.filter(f => !args[f] || (typeof args[f] === "string" && !args[f].trim()));
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
}

function validateEnum(value, allowed, fieldName) {
  if (value && !allowed.includes(value)) {
    return `Invalid ${fieldName}: "${value}". Must be one of: ${allowed.join(", ")}`;
  }
  return null;
}

// =============================================================================
// GIT HELPERS
// =============================================================================

/**
 * Generate a URL-safe slug from a string
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "")     // Trim leading/trailing hyphens
    .substring(0, 50);           // Limit length
}

/**
 * Get short ID from UUID (first 8 characters)
 */
function shortId(uuid) {
  return uuid.substring(0, 8);
}

/**
 * Generate branch name for a ticket
 * Format: feature/{short-id}-{slug}
 */
function generateBranchName(ticketId, ticketTitle) {
  const slug = slugify(ticketTitle);
  return `feature/${shortId(ticketId)}-${slug}`;
}

/**
 * Run a git command in a directory
 * Returns { success: boolean, output: string, error?: string }
 */
function runGitCommand(command, cwd) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error.stderr?.trim() || error.message,
    };
  }
}

// =============================================================================
// MCP SERVER SETUP
// =============================================================================
const server = new Server(
  {
    name: "brain-dumpy",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: `List all projects registered in Brain Dumpy.

Returns an array of projects with their IDs, names, and paths.
Use this to find the projectId needed for creating tickets.

Example response:
[
  { "id": "abc-123", "name": "My App", "path": "/home/user/my-app" }
]`,
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "find_project_by_path",
        description: `Find a project by filesystem path.

Searches for a project whose path matches or contains the given path.
Useful for auto-detecting which project you're working in.

Args:
  path: The directory path to search for (e.g., current working directory)

Returns the matching project or a message if no project found.`,
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute filesystem path to search for",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "create_project",
        description: `Create a new project in Brain Dumpy.

Use this when working in a directory that isn't yet registered.
The path must be an absolute filesystem path that exists.

Args:
  name: Display name for the project (e.g., "My App", "Backend API")
  path: Absolute path to project root (e.g., "/home/user/projects/my-app")
  color: Optional hex color (e.g., "#3b82f6" for blue)

Returns the created project with its generated ID.`,
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Project display name",
            },
            path: {
              type: "string",
              description: "Absolute filesystem path to project root",
            },
            color: {
              type: "string",
              description: "Optional hex color (e.g., '#3b82f6')",
            },
          },
          required: ["name", "path"],
        },
      },
      {
        name: "create_ticket",
        description: `Create a new ticket in Brain Dumpy.

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
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID (from list_projects or find_project_by_path)",
            },
            title: {
              type: "string",
              description: "Ticket title - short, descriptive summary",
            },
            description: {
              type: "string",
              description: "Detailed description (markdown supported)",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Priority level",
            },
            epicId: {
              type: "string",
              description: "Epic ID to associate with",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags for categorization",
            },
          },
          required: ["projectId", "title"],
        },
      },
      {
        name: "list_tickets",
        description: `List tickets with optional filters.

Args:
  projectId: Optional - filter by project
  status: Optional - filter by status (backlog, ready, in_progress, review, done)
  limit: Optional - max tickets to return (default: 20)

Returns array of tickets sorted by creation date (newest first).`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Filter by project ID",
            },
            status: {
              type: "string",
              enum: ["backlog", "ready", "in_progress", "review", "done"],
              description: "Filter by status",
            },
            limit: {
              type: "number",
              description: "Max tickets to return (default: 20)",
            },
          },
          required: [],
        },
      },
      {
        name: "update_ticket_status",
        description: `Update a ticket's status.

Status flow: backlog -> ready -> in_progress -> review -> done

Args:
  ticketId: The ticket ID to update
  status: New status value

Returns the updated ticket.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to update",
            },
            status: {
              type: "string",
              enum: ["backlog", "ready", "in_progress", "review", "done"],
              description: "New status",
            },
          },
          required: ["ticketId", "status"],
        },
      },
      {
        name: "list_epics",
        description: `List epics for a project.

Epics are used to group related tickets together.

Args:
  projectId: The project ID to list epics for

Returns array of epics with their IDs and titles.`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID",
            },
          },
          required: ["projectId"],
        },
      },
      {
        name: "create_epic",
        description: `Create a new epic to group related tickets.

Args:
  projectId: Project ID to create the epic in
  title: Epic title
  description: Optional description
  color: Optional hex color

Returns the created epic.`,
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: "Project ID",
            },
            title: {
              type: "string",
              description: "Epic title",
            },
            description: {
              type: "string",
              description: "Optional description",
            },
            color: {
              type: "string",
              description: "Optional hex color",
            },
          },
          required: ["projectId", "title"],
        },
      },
      {
        name: "add_ticket_comment",
        description: `Add a comment or work summary to a ticket.

Use this to document work completed, test results, or any notes about the ticket.
This creates an audit trail of changes made by Claude or Ralph.

Args:
  ticketId: The ticket ID to add comment to
  content: The comment text (markdown supported)
  author: Who is adding the comment (claude, ralph, or user)
  type: Type of comment (comment, work_summary, test_report)

Returns the created comment.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to add comment to",
            },
            content: {
              type: "string",
              description: "Comment content (markdown supported). For work summaries, include: what was done, files changed, tests run.",
            },
            author: {
              type: "string",
              enum: ["claude", "ralph", "user"],
              description: "Who is adding the comment",
            },
            type: {
              type: "string",
              enum: ["comment", "work_summary", "test_report"],
              description: "Type of comment (default: comment)",
            },
          },
          required: ["ticketId", "content", "author"],
        },
      },
      {
        name: "get_ticket_comments",
        description: `Get all comments for a ticket.

Returns array of comments sorted by creation date (newest first).

Args:
  ticketId: The ticket ID to get comments for`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "start_ticket_work",
        description: `Start working on a ticket.

This tool:
1. Creates a git branch: feature/{ticket-short-id}-{slug}
2. Sets the ticket status to in_progress
3. Returns the branch name and ticket context

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details, and project path for context.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to start working on",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "complete_ticket_work",
        description: `Complete work on a ticket and move it to review.

This tool:
1. Sets the ticket status to review
2. Gets git commits on the current branch (for PR description)
3. Returns a summary of work done

Use this when you've finished implementing a ticket.
Call this before creating a pull request.

Args:
  ticketId: The ticket ID to complete
  summary: Optional work summary to include

Returns:
  Updated ticket, git commits summary, and suggested PR description.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to complete",
            },
            summary: {
              type: "string",
              description: "Optional work summary describing what was done",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "link_commit_to_ticket",
        description: `Link a git commit to a ticket.

Stores the commit reference in the ticket's metadata.
Multiple commits can be linked to a single ticket.

Use this to track which commits are related to a ticket.
The commit can be queried later to see all work done.

Args:
  ticketId: The ticket ID to link the commit to
  commitHash: The git commit hash (full or short)
  message: Optional commit message (auto-fetched if not provided)

Returns:
  Updated list of linked commits for the ticket.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to link the commit to",
            },
            commitHash: {
              type: "string",
              description: "Git commit hash (full or abbreviated)",
            },
            message: {
              type: "string",
              description: "Optional commit message (auto-fetched if in git repo)",
            },
          },
          required: ["ticketId", "commitHash"],
        },
      },
      {
        name: "link_files_to_ticket",
        description: `Link files to a ticket.

Associates file paths with a ticket for context tracking.
Multiple files can be linked to a single ticket.

Use this to track which files are related to a ticket.
Helpful for providing context when working on related issues.

Args:
  ticketId: The ticket ID to link files to
  files: Array of file paths (relative or absolute)

Returns:
  Updated list of linked files for the ticket.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID to link files to",
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "Array of file paths to link",
            },
          },
          required: ["ticketId", "files"],
        },
      },
      {
        name: "get_tickets_for_file",
        description: `Find tickets related to a file.

Searches for tickets that have this file linked.
Useful for getting context when working on a file.

Supports partial path matching - will find tickets where
the linked file path contains the search path.

Args:
  filePath: The file path to search for
  projectId: Optional - limit search to a specific project

Returns:
  Array of tickets that have this file linked.`,
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "File path to search for (supports partial matching)",
            },
            projectId: {
              type: "string",
              description: "Optional project ID to limit search",
            },
          },
          required: ["filePath"],
        },
      },
    ],
  };
});

// =============================================================================
// TOOL HANDLERS
// =============================================================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log.debug(`Tool called: ${name}`);

  try {
    switch (name) {
      // -----------------------------------------------------------------------
      // LIST PROJECTS
      // -----------------------------------------------------------------------
      case "list_projects": {
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

      // -----------------------------------------------------------------------
      // FIND PROJECT BY PATH
      // -----------------------------------------------------------------------
      case "find_project_by_path": {
        const error = validateRequired(args, ["path"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { path } = args;
        const projects = db.prepare("SELECT * FROM projects").all();

        // Find project where paths match (either direction for subdirectories)
        const matchingProject = projects.find(
          (p) => path.startsWith(p.path) || p.path.startsWith(path)
        );

        if (matchingProject) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(matchingProject, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: `No project found for path: ${path}\n\nUse create_project to register this directory.`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // CREATE PROJECT
      // -----------------------------------------------------------------------
      case "create_project": {
        const error = validateRequired(args, ["name", "path"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { name: projectName, path, color } = args;

        // Check if path exists on filesystem
        if (!existsSync(path)) {
          return {
            content: [{ type: "text", text: `Directory does not exist: ${path}` }],
            isError: true,
          };
        }

        // Check if project with this path already exists
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

      // -----------------------------------------------------------------------
      // CREATE TICKET
      // -----------------------------------------------------------------------
      case "create_ticket": {
        const error = validateRequired(args, ["projectId", "title"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId, title, description, priority, epicId, tags } = args;

        // Validate priority if provided
        if (priority) {
          const priorityError = validateEnum(priority, ["low", "medium", "high"], "priority");
          if (priorityError) {
            return { content: [{ type: "text", text: priorityError }], isError: true };
          }
        }

        // Verify project exists
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) {
          return {
            content: [{ type: "text", text: `Project not found: ${projectId}\n\nUse list_projects to see available projects.` }],
            isError: true,
          };
        }

        // Verify epic exists if provided
        if (epicId) {
          const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId);
          if (!epic) {
            return {
              content: [{ type: "text", text: `Epic not found: ${epicId}\n\nUse list_epics to see available epics.` }],
              isError: true,
            };
          }
        }

        // Get max position in backlog
        const maxPos = db.prepare(
          "SELECT MAX(position) as maxPos FROM tickets WHERE project_id = ? AND status = 'backlog'"
        ).get(projectId);
        const position = (maxPos?.maxPos ?? 0) + 1;

        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id, tags, created_at, updated_at)
           VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          title.trim(),
          description?.trim() || null,
          priority || null,
          position,
          projectId,
          epicId || null,
          tags ? JSON.stringify(tags) : null,
          now,
          now
        );

        const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
        log.info(`Created ticket: ${title} in project ${project.name}`);

        return {
          content: [{
            type: "text",
            text: `Ticket created in "${project.name}"!\n\n${JSON.stringify(ticket, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LIST TICKETS
      // -----------------------------------------------------------------------
      case "list_tickets": {
        const { projectId, status, limit = 20 } = args;

        // Validate status if provided
        if (status) {
          const statusError = validateEnum(status, ["backlog", "ready", "in_progress", "review", "done"], "status");
          if (statusError) {
            return { content: [{ type: "text", text: statusError }], isError: true };
          }
        }

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
        params.push(Math.min(limit, 100)); // Cap at 100

        const tickets = db.prepare(query).all(...params);

        return {
          content: [{
            type: "text",
            text: tickets.length > 0
              ? JSON.stringify(tickets, null, 2)
              : "No tickets found matching the criteria.",
          }],
        };
      }

      // -----------------------------------------------------------------------
      // UPDATE TICKET STATUS
      // -----------------------------------------------------------------------
      case "update_ticket_status": {
        const error = validateRequired(args, ["ticketId", "status"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, status } = args;

        // Validate status
        const statusError = validateEnum(status, ["backlog", "ready", "in_progress", "review", "done"], "status");
        if (statusError) {
          return { content: [{ type: "text", text: statusError }], isError: true };
        }

        const existing = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        if (!existing) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        const now = new Date().toISOString();
        const completedAt = status === "done" ? now : null;

        db.prepare(
          "UPDATE tickets SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?"
        ).run(status, now, completedAt, ticketId);

        const updated = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        log.info(`Updated ticket ${ticketId} status: ${existing.status} -> ${status}`);

        return {
          content: [{
            type: "text",
            text: `Ticket status updated: ${existing.status} -> ${status}\n\n${JSON.stringify(updated, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LIST EPICS
      // -----------------------------------------------------------------------
      case "list_epics": {
        const error = validateRequired(args, ["projectId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId } = args;

        // Verify project exists
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

      // -----------------------------------------------------------------------
      // CREATE EPIC
      // -----------------------------------------------------------------------
      case "create_epic": {
        const error = validateRequired(args, ["projectId", "title"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { projectId, title, description, color } = args;

        // Verify project exists
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
          content: [{
            type: "text",
            text: `Epic created in "${project.name}"!\n\n${JSON.stringify(epic, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // ADD TICKET COMMENT
      // -----------------------------------------------------------------------
      case "add_ticket_comment": {
        const error = validateRequired(args, ["ticketId", "content", "author"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, content, author, type = "comment" } = args;

        // Validate author
        const authorError = validateEnum(author, ["claude", "ralph", "user"], "author");
        if (authorError) {
          return { content: [{ type: "text", text: authorError }], isError: true };
        }

        // Validate type
        const typeError = validateEnum(type, ["comment", "work_summary", "test_report"], "type");
        if (typeError) {
          return { content: [{ type: "text", text: typeError }], isError: true };
        }

        // Verify ticket exists
        const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        const id = randomUUID();
        const now = new Date().toISOString();

        db.prepare(
          "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, ticketId, content.trim(), author, type, now);

        const comment = db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get(id);
        log.info(`Added ${type} to ticket ${ticketId} by ${author}`);

        return {
          content: [{
            type: "text",
            text: `Comment added to ticket "${ticket.title}"!\n\n${JSON.stringify(comment, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET TICKET COMMENTS
      // -----------------------------------------------------------------------
      case "get_ticket_comments": {
        const error = validateRequired(args, ["ticketId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId } = args;

        // Verify ticket exists
        const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        const comments = db.prepare(
          "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at DESC"
        ).all(ticketId);

        return {
          content: [{
            type: "text",
            text: comments.length > 0
              ? JSON.stringify(comments, null, 2)
              : `No comments found for ticket "${ticket.title}".`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // START TICKET WORK
      // -----------------------------------------------------------------------
      case "start_ticket_work": {
        const error = validateRequired(args, ["ticketId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId } = args;

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Check if ticket is already in progress
        if (ticket.status === "in_progress") {
          return {
            content: [{
              type: "text",
              text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}`,
            }],
          };
        }

        // Check if project path exists
        if (!existsSync(ticket.project_path)) {
          return {
            content: [{
              type: "text",
              text: `Project path does not exist: ${ticket.project_path}`,
            }],
            isError: true,
          };
        }

        // Check if it's a git repository
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (!gitCheck.success) {
          return {
            content: [{
              type: "text",
              text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init`,
            }],
            isError: true,
          };
        }

        // Generate branch name
        const branchName = generateBranchName(ticketId, ticket.title);

        // Check if branch already exists
        const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, ticket.project_path);

        let branchCreated = false;
        if (!branchExists.success) {
          // Branch doesn't exist, create it
          const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
          if (!createBranch.success) {
            return {
              content: [{
                type: "text",
                text: `Failed to create branch ${branchName}: ${createBranch.error}`,
              }],
              isError: true,
            };
          }
          branchCreated = true;
        } else {
          // Branch exists, check it out
          const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
          if (!checkoutBranch.success) {
            return {
              content: [{
                type: "text",
                text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}`,
              }],
              isError: true,
            };
          }
        }

        // Update ticket status to in_progress
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET status = 'in_progress', updated_at = ? WHERE id = ?"
        ).run(now, ticketId);

        // Get updated ticket
        const updatedTicket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        log.info(`Started work on ticket ${ticketId}: branch ${branchName}`);

        return {
          content: [{
            type: "text",
            text: `Started work on ticket!

Branch: ${branchName}
${branchCreated ? "Created new branch" : "Checked out existing branch"}

Project: ${updatedTicket.project_name}
Path: ${updatedTicket.project_path}

Ticket:
${JSON.stringify(updatedTicket, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // COMPLETE TICKET WORK
      // -----------------------------------------------------------------------
      case "complete_ticket_work": {
        const error = validateRequired(args, ["ticketId"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, summary } = args;

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Check if ticket is in a valid state to complete
        if (ticket.status === "done") {
          return {
            content: [{
              type: "text",
              text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}`,
            }],
          };
        }

        if (ticket.status === "review") {
          return {
            content: [{
              type: "text",
              text: `Ticket is already in review.\n\n${JSON.stringify(ticket, null, 2)}`,
            }],
          };
        }

        // Try to get git commits for this ticket's branch
        let commitsInfo = "";
        let prDescription = "";

        if (existsSync(ticket.project_path)) {
          const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);

          if (gitCheck.success) {
            // Get current branch
            const branchResult = runGitCommand("git branch --show-current", ticket.project_path);
            const currentBranch = branchResult.success ? branchResult.output : "unknown";

            // Get commits on this branch (compared to main/master)
            // Try main first, then master
            let baseBranch = "main";
            const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", ticket.project_path);
            if (!mainExists.success) {
              const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", ticket.project_path);
              if (masterExists.success) {
                baseBranch = "master";
              }
            }

            // Get commit log
            const commitsResult = runGitCommand(
              `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
              ticket.project_path
            );

            if (commitsResult.success && commitsResult.output) {
              commitsInfo = commitsResult.output;

              // Generate PR description
              const commitLines = commitsInfo.split("\n").filter(l => l.trim());
              prDescription = `## Summary
${summary || ticket.title}

## Changes
${commitLines.map(c => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}

## Ticket
- ID: ${shortId(ticketId)}
- Title: ${ticket.title}
`;
            }
          }
        }

        // Update ticket status to review
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET status = 'review', updated_at = ? WHERE id = ?"
        ).run(now, ticketId);

        // Get updated ticket
        const updatedTicket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        log.info(`Completed work on ticket ${ticketId}, moved to review`);

        return {
          content: [{
            type: "text",
            text: `Ticket moved to review!

Project: ${updatedTicket.project_name}
Status: ${updatedTicket.status}

${commitsInfo ? `Commits:\n${commitsInfo}\n` : ""}
${prDescription ? `Suggested PR Description:\n\`\`\`\n${prDescription}\`\`\`\n` : ""}
Ticket:
${JSON.stringify(updatedTicket, null, 2)}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LINK COMMIT TO TICKET
      // -----------------------------------------------------------------------
      case "link_commit_to_ticket": {
        const error = validateRequired(args, ["ticketId", "commitHash"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, commitHash, message } = args;

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Try to get commit message if not provided
        let commitMessage = message || "";
        if (!commitMessage && existsSync(ticket.project_path)) {
          const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
          if (gitCheck.success) {
            const msgResult = runGitCommand(
              `git log -1 --format=%s ${commitHash} 2>/dev/null`,
              ticket.project_path
            );
            if (msgResult.success && msgResult.output) {
              commitMessage = msgResult.output;
            }
          }
        }

        // Parse existing linked commits
        let linkedCommits = [];
        if (ticket.linked_commits) {
          try {
            linkedCommits = JSON.parse(ticket.linked_commits);
          } catch {
            linkedCommits = [];
          }
        }

        // Check if commit already linked
        const alreadyLinked = linkedCommits.some(c => c.hash === commitHash || c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash));
        if (alreadyLinked) {
          return {
            content: [{
              type: "text",
              text: `Commit ${commitHash} is already linked to this ticket.\n\nLinked commits:\n${JSON.stringify(linkedCommits, null, 2)}`,
            }],
          };
        }

        // Add new commit
        const newCommit = {
          hash: commitHash,
          message: commitMessage,
          linkedAt: new Date().toISOString(),
        };
        linkedCommits.push(newCommit);

        // Update ticket
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET linked_commits = ?, updated_at = ? WHERE id = ?"
        ).run(JSON.stringify(linkedCommits), now, ticketId);

        log.info(`Linked commit ${commitHash} to ticket ${ticketId}`);

        return {
          content: [{
            type: "text",
            text: `Commit linked to ticket "${ticket.title}"!

Commit: ${commitHash}
Message: ${commitMessage || "(no message)"}

All linked commits (${linkedCommits.length}):
${linkedCommits.map(c => `- ${c.hash.substring(0, 8)}: ${c.message || "(no message)"}`).join("\n")}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // LINK FILES TO TICKET
      // -----------------------------------------------------------------------
      case "link_files_to_ticket": {
        const error = validateRequired(args, ["ticketId", "files"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { ticketId, files } = args;

        // Validate files is an array
        if (!Array.isArray(files)) {
          return {
            content: [{ type: "text", text: "files must be an array of file paths" }],
            isError: true,
          };
        }

        if (files.length === 0) {
          return {
            content: [{ type: "text", text: "files array cannot be empty" }],
            isError: true,
          };
        }

        // Get ticket with project info
        const ticket = db.prepare(`
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) {
          return {
            content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
            isError: true,
          };
        }

        // Parse existing linked files
        let linkedFiles = [];
        if (ticket.linked_files) {
          try {
            linkedFiles = JSON.parse(ticket.linked_files);
          } catch {
            linkedFiles = [];
          }
        }

        // Normalize and add new files (avoid duplicates)
        const newFiles = [];
        for (const file of files) {
          // Normalize the path - convert to relative if it starts with project path
          let normalizedPath = file;
          if (file.startsWith(ticket.project_path)) {
            normalizedPath = file.substring(ticket.project_path.length).replace(/^\//, "");
          }

          // Check if already linked
          if (!linkedFiles.includes(normalizedPath)) {
            linkedFiles.push(normalizedPath);
            newFiles.push(normalizedPath);
          }
        }

        // Update ticket
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE tickets SET linked_files = ?, updated_at = ? WHERE id = ?"
        ).run(JSON.stringify(linkedFiles), now, ticketId);

        log.info(`Linked ${newFiles.length} files to ticket ${ticketId}`);

        return {
          content: [{
            type: "text",
            text: `Files linked to ticket "${ticket.title}"!

New files added: ${newFiles.length}
${newFiles.length > 0 ? newFiles.map(f => `  + ${f}`).join("\n") : "  (all files were already linked)"}

All linked files (${linkedFiles.length}):
${linkedFiles.map(f => `  - ${f}`).join("\n")}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // GET TICKETS FOR FILE
      // -----------------------------------------------------------------------
      case "get_tickets_for_file": {
        const error = validateRequired(args, ["filePath"]);
        if (error) {
          return { content: [{ type: "text", text: error }], isError: true };
        }

        const { filePath, projectId } = args;

        // Normalize the search path (remove leading slash if present)
        const searchPath = filePath.replace(/^\//, "");

        // Build query
        let query = `
          SELECT t.*, p.name as project_name, p.path as project_path
          FROM tickets t
          JOIN projects p ON t.project_id = p.id
          WHERE t.linked_files IS NOT NULL
        `;
        const params = [];

        if (projectId) {
          query += " AND t.project_id = ?";
          params.push(projectId);
        }

        const allTickets = db.prepare(query).all(...params);

        // Filter tickets that have the file linked (partial matching)
        const matchingTickets = allTickets.filter(ticket => {
          try {
            const linkedFiles = JSON.parse(ticket.linked_files);
            return linkedFiles.some(f =>
              f.includes(searchPath) || searchPath.includes(f)
            );
          } catch {
            return false;
          }
        });

        if (matchingTickets.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No tickets found with file: ${filePath}\n\nTip: Use link_files_to_ticket to associate files with tickets.`,
            }],
          };
        }

        // Format results
        const results = matchingTickets.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          project: t.project_name,
          linkedFiles: JSON.parse(t.linked_files),
        }));

        log.info(`Found ${matchingTickets.length} tickets for file ${filePath}`);

        return {
          content: [{
            type: "text",
            text: `Found ${matchingTickets.length} ticket(s) for file "${filePath}":

${results.map(t => `## ${t.title}
- ID: ${t.id}
- Status: ${t.status}
- Priority: ${t.priority || "none"}
- Project: ${t.project}
- Linked files: ${t.linkedFiles.join(", ")}`).join("\n\n")}`,
          }],
        };
      }

      // -----------------------------------------------------------------------
      // UNKNOWN TOOL
      // -----------------------------------------------------------------------
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    log.error(`Tool ${name} failed`, error);
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server started successfully");
}

main().catch((error) => {
  log.error("Fatal error starting server", error);
  process.exit(1);
});
