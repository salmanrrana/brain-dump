# Context Detection: Error Handling Remediation Guide

This document provides specific code changes to fix the 11 critical, high, and medium error handling issues identified in the audit.

---

## CRITICAL FIX #1: Replace Silent Catch Blocks in detectContext()

**File**: `mcp-server/lib/context-detection.js`

**Current Problem**: Database failures are logged at debug level and silently ignored, causing context detection to return wrong results.

**Fix**: Implement proper error handling with error context objects.

### Before (Lines 28-184)

```javascript
export function detectContext(db, options = {}) {
  const { ticketId, projectId, sessionId } = options;

  let activeTicketId = ticketId;
  let activeTicket = null;
  let activeProject = null;
  let activeSession = null;

  // Step 1: Check for active session
  if (sessionId) {
    try {
      activeSession = db
        .prepare(`SELECT * FROM conversation_sessions WHERE id = ? AND ended_at IS NULL LIMIT 1`)
        .get(sessionId);

      if (activeSession) {
        activeTicketId = activeSession.ticket_id;
      }
    } catch (err) {
      log.debug(`Session lookup failed (expected if table doesn't exist): ${err.message}`);
    }
  }

  // Step 2: Look up ticket and its status
  if (activeTicketId) {
    try {
      activeTicket = db
        .prepare(`SELECT t.*, p.id as project_id FROM tickets t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ? LIMIT 1`)
        .get(activeTicketId);
    } catch (err) {
      log.debug(`Ticket lookup failed: ${err.message}`);
    }
  }

  // Step 3: Look up project if we have a project ID
  const effectiveProjectId = activeTicket?.project_id || projectId;
  if (effectiveProjectId) {
    try {
      activeProject = db
        .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
        .get(effectiveProjectId);
    } catch (err) {
      log.debug(`Project lookup failed: ${err.message}`);
    }
  }

  // Step 4: Determine context based on ticket status
  if (activeTicket) {
    // ... status matching
  }

  // Step 5: Default to admin context
  return { type: "admin", ... };
}
```

### After (Recommended Fix)

```javascript
import { z } from "zod";

// Define the schema for context detection options
const DetectContextOptionsSchema = z.object({
  ticketId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

/**
 * Detect the active context based on current session and ticket state.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {Object} options
 * @param {string} [options.ticketId] - Current ticket ID if any
 * @param {string} [options.projectId] - Current project ID if any
 * @param {string} [options.sessionId] - Current session ID if any
 * @returns {Object} Context object with type and metadata, or error context
 */
export function detectContext(db, options = {}) {
  // Validate and normalize inputs
  let validated;
  try {
    validated = DetectContextOptionsSchema.parse(options);
  } catch (err) {
    log.warn(`Invalid context detection options: ${err.message}`, err);
    return {
      type: "error",
      description: "Context detection failed - invalid options provided",
      fallback: {
        type: "admin",
        reason: "Invalid input parameters",
      },
      errors: [
        {
          field: "options",
          reason: err.message,
        },
      ],
    };
  }

  const { ticketId, projectId, sessionId } = validated;

  let activeTicketId = ticketId;
  let activeTicket = null;
  let activeProject = null;
  let activeSession = null;
  const detectionErrors = [];

  // Step 1: Check for active session
  if (sessionId) {
    try {
      activeSession = db
        .prepare(
          `SELECT * FROM conversation_sessions
           WHERE id = ? AND ended_at IS NULL LIMIT 1`
        )
        .get(sessionId);

      if (activeSession) {
        activeTicketId = activeSession.ticket_id;
      }
    } catch (err) {
      // Check if this is a "table doesn't exist" error (initialization issue)
      const isInitializationError =
        err.message.includes("no such table") ||
        err.code === "SQLITE_ERROR";

      if (isInitializationError) {
        log.error(
          `FATAL: conversation_sessions table does not exist. Database initialization incomplete.`,
          err
        );
        return {
          type: "error",
          description: "Database initialization incomplete",
          errors: [
            {
              operation: "database_initialization",
              reason: "conversation_sessions table missing",
              recovery:
                "Run database migrations with: pnpm db:migrate",
            },
          ],
        };
      }

      // Any other error is unexpected and should be logged at ERROR level
      log.error(
        `Failed to lookup session ${sessionId}: ${err.message}`,
        err
      );
      detectionErrors.push({
        operation: "session_lookup",
        sessionId,
        error: err.message,
      });
    }
  }

  // Step 2: Look up ticket and its status
  if (activeTicketId) {
    try {
      activeTicket = db
        .prepare(
          `SELECT t.*, p.id as project_id
           FROM tickets t
           LEFT JOIN projects p ON t.project_id = p.id
           WHERE t.id = ? LIMIT 1`
        )
        .get(activeTicketId);
    } catch (err) {
      log.error(
        `Failed to lookup ticket ${activeTicketId}: ${err.message}`,
        err
      );
      detectionErrors.push({
        operation: "ticket_lookup",
        ticketId: activeTicketId,
        error: err.message,
      });
    }
  }

  // Step 3: Look up project if we have a project ID
  const effectiveProjectId = activeTicket?.project_id || projectId;
  if (effectiveProjectId) {
    try {
      activeProject = db
        .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
        .get(effectiveProjectId);
    } catch (err) {
      log.error(
        `Failed to lookup project ${effectiveProjectId}: ${err.message}`,
        err
      );
      detectionErrors.push({
        operation: "project_lookup",
        projectId: effectiveProjectId,
        error: err.message,
      });
    }
  }

  // If we had critical errors, return error context
  if (detectionErrors.length > 0) {
    return {
      type: "error",
      ticketId: activeTicketId,
      projectId: effectiveProjectId,
      description: "Context detection failed - database operations unsuccessful",
      fallback: {
        type: "admin",
        reason: "Database errors occurred during context detection",
      },
      errors: detectionErrors,
    };
  }

  // Step 4: Determine context based on ticket status
  if (activeTicket) {
    const { status, id: ticketId } = activeTicket;

    // Validate that status is a known value
    const validStatuses = [
      "in_progress",
      "ai_review",
      "human_review",
      "backlog",
      "ready",
      "done",
    ];
    if (!validStatuses.includes(status)) {
      log.warn(
        `Ticket ${ticketId} has invalid status: '${status}'. Expected one of: ${validStatuses.join(", ")}`,
        new Error("Invalid ticket status")
      );
      return {
        type: "error",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Ticket has invalid status",
        errors: [
          {
            field: "status",
            value: status,
            expected: validStatuses,
          },
        ],
      };
    }

    if (status === "in_progress") {
      return {
        type: "ticket_work",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Active ticket implementation",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          stateFile: {
            sessionId,
            ticketId,
            currentState: "implementing",
          },
        },
      };
    }

    if (status === "ai_review" || status === "human_review") {
      return {
        type: "review",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Code review phase",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          reviewPhase: status === "ai_review" ? "automated" : "manual",
          stateFile: {
            sessionId,
            ticketId,
            currentState: "reviewing",
          },
        },
      };
    }

    if (status === "backlog" || status === "ready") {
      return {
        type: "planning",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Ticket planning/readiness",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          readinessLevel: status === "ready" ? "ready_to_work" : "needs_planning",
          stateFile: {
            sessionId,
            ticketId,
            currentState: "planning",
          },
        },
      };
    }

    if (status === "done") {
      return {
        type: "admin",
        ticketId,
        projectId: effectiveProjectId,
        status,
        description: "Ticket completed - administrative context",
        metadata: {
          ticket: activeTicket,
          project: activeProject,
          session: activeSession,
          stateFile: {
            sessionId,
            ticketId,
            currentState: "complete",
          },
        },
      };
    }
  }

  // Step 5: Default to admin context if no active ticket
  return {
    type: "admin",
    projectId: effectiveProjectId,
    description: "Administrative/setup context",
    metadata: {
      project: activeProject,
      session: activeSession,
      reason: "no_active_ticket",
      stateFile: {
        sessionId,
        currentState: "admin",
      },
    },
  };
}
```

---

## CRITICAL FIX #2: Add Validation to detectAllActiveContexts()

**File**: `mcp-server/lib/context-detection.js`

**Current Problem**: Returns empty array on database error, making it impossible to distinguish from "no active contexts".

### Before (Lines 194-220)

```javascript
export function detectAllActiveContexts(db) {
  const activeContexts = [];

  try {
    const activeSessions = db
      .prepare(`SELECT DISTINCT session_id, ticket_id, project_id FROM conversation_sessions WHERE ended_at IS NULL`)
      .all();

    for (const session of activeSessions) {
      const context = detectContext(db, {
        sessionId: session.session_id,
        ticketId: session.ticket_id,
        projectId: session.project_id,
      });
      activeContexts.push(context);
    }
  } catch (err) {
    log.debug(`Failed to detect all active contexts: ${err.message}`);
  }

  return activeContexts;
}
```

### After (Recommended Fix)

```javascript
/**
 * Get all currently active contexts across all sessions.
 * Useful for understanding system state and multi-window workflows.
 *
 * @param {import("better-sqlite3").Database} db
 * @returns {Object} Result object with contexts array, success flag, and error info
 */
export function detectAllActiveContexts(db) {
  const activeContexts = [];

  try {
    // Find all active sessions
    const activeSessions = db
      .prepare(
        `SELECT DISTINCT session_id, ticket_id, project_id
         FROM conversation_sessions
         WHERE ended_at IS NULL`
      )
      .all();

    // If query succeeded but returned no results, that's different from an error
    if (activeSessions.length === 0) {
      return {
        success: true,
        contexts: [],
        count: 0,
        reason: "no_active_sessions",
      };
    }

    // Process each session and collect contexts
    for (const session of activeSessions) {
      try {
        const context = detectContext(db, {
          sessionId: session.session_id,
          ticketId: session.ticket_id,
          projectId: session.project_id,
        });
        activeContexts.push(context);
      } catch (err) {
        log.error(
          `Failed to detect context for session ${session.session_id}`,
          err
        );
        // Track that detection failed for this session
        activeContexts.push({
          type: "error",
          sessionId: session.session_id,
          reason: `Failed to detect context: ${err.message}`,
        });
      }
    }

    return {
      success: true,
      contexts: activeContexts,
      count: activeContexts.length,
    };
  } catch (err) {
    log.error(`Failed to retrieve active sessions: ${err.message}`, err);

    return {
      success: false,
      contexts: [],
      count: 0,
      error: err.message,
      reason: "database_query_failed",
      recovery:
        "Check database connection and ensure conversation_sessions table exists",
    };
  }
}
```

---

## HIGH FIX #1: Enhance MCP Tool Error Handling

**File**: `mcp-server/tools/context.js`

**Current Problem**: Generic error messages don't tell users what went wrong or how to fix it.

### Create a Helper Function (add to tools/context.js)

```javascript
/**
 * Format a context detection error with actionable guidance
 * @param {Object} context - Context object (potentially with error type)
 * @returns {string} User-friendly error message with guidance
 */
function formatContextDetectionError(context) {
  if (context.type === "error") {
    if (
      context.errors &&
      context.errors.some((e) => e.operation === "database_initialization")
    ) {
      return (
        "Database is not initialized.\n\n" +
        "To fix: Run database migrations with:\n" +
        "  pnpm db:migrate\n\n" +
        "This will create the necessary tables and schema."
      );
    }

    if (
      context.errors &&
      context.errors.some((e) => e.field === "status")
    ) {
      return (
        `Ticket has invalid status: '${context.status}'.\n\n` +
        `Valid statuses are: backlog, ready, in_progress, ai_review, human_review, done\n\n` +
        "This indicates database corruption. Check the database directly or contact support."
      );
    }

    if (context.errors && context.errors.length > 0) {
      const errorDetails = context.errors
        .map((e) => `  - ${e.operation || e.field}: ${e.error || e.reason}`)
        .join("\n");
      return (
        `Context detection encountered errors:\n\n${errorDetails}\n\n` +
        `Fallback context: ${context.fallback?.type || "none"}`
      );
    }

    return context.description || "Context detection failed";
  }

  return "Unexpected error during context detection";
}

/**
 * Wrap tool execution with consistent error handling and logging
 * @param {string} toolName - Name of the tool for logging
 * @param {Object} params - Input parameters for logging context
 * @param {Function} operation - Async function that performs the tool operation
 * @returns {Object} MCP tool response
 */
async function withErrorHandling(toolName, params, operation) {
  try {
    const result = await operation();
    return result;
  } catch (err) {
    // Log with full context for debugging
    const paramString = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");

    log.error(
      `Tool '${toolName}' failed with params: ${paramString || "none"}`,
      err
    );

    // Provide specific guidance based on error type
    let message = `Tool failed: ${err.message}`;
    if (err.message.includes("no such table")) {
      message =
        "Database not initialized.\n\n" +
        "To fix: Run database migrations with:\n" +
        "  pnpm db:migrate";
    } else if (err.message.includes("SQLITE_CANTOPEN")) {
      message =
        "Cannot access database file.\n\n" +
        "Check that:\n" +
        "  - The file has read/write permissions\n" +
        "  - The disk has available space\n" +
        "  - The path is not on a locked filesystem";
    } else if (err.message.includes("database is locked")) {
      message =
        "Database is currently locked by another process.\n\n" +
        "This usually resolves itself in a few moments. Try again.";
    }

    return {
      content: [
        {
          type: "text",
          text: message,
          isError: true,
        },
      ],
    };
  }
}
```

### Update detect_context Tool

```javascript
server.tool(
  "detect_context",
  `Detect the active context based on current session and ticket state.

  [rest of description unchanged]`,
  {
    ticketId: z.string().optional().describe("Ticket ID"),
    projectId: z.string().optional().describe("Project ID"),
    sessionId: z.string().optional().describe("Conversation session ID"),
  },
  async ({ ticketId, projectId, sessionId }) => {
    return withErrorHandling(
      "detect_context",
      { ticketId, projectId, sessionId },
      async () => {
        const context = detectContext(db, {
          ticketId,
          projectId,
          sessionId,
        });

        // Handle detection errors (from enhanced detectContext)
        if (context.type === "error") {
          return {
            content: [
              {
                type: "text",
                text: formatContextDetectionError(context),
                isError: true,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(context, null, 2),
            },
          ],
        };
      }
    );
  }
);
```

### Update detect_all_contexts Tool

```javascript
server.tool(
  "detect_all_contexts",
  `Detect all currently active contexts across all sessions.

  [rest of description unchanged]`,
  {},
  async () => {
    return withErrorHandling("detect_all_contexts", {}, async () => {
      const result = detectAllActiveContexts(db);

      // Handle detection errors
      if (!result.success) {
        let message =
          `Failed to detect contexts: ${result.reason}\n\n` +
          `Error: ${result.error}\n\n` +
          `Recovery: ${result.recovery || "Check the logs for more details"}`;

        return {
          content: [
            {
              type: "text",
              text: message,
              isError: true,
            },
          ],
        };
      }

      if (result.count === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No active contexts found. No conversation sessions are currently active.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.contexts, null, 2),
          },
        ],
      };
    });
  }
);
```

### Update get_context_summary and is_context_relevant Tools

Apply the same `withErrorHandling` pattern to these tools:

```javascript
server.tool(
  "get_context_summary",
  `Get a human-readable summary of the current context.

  [rest of description unchanged]`,
  {
    ticketId: z.string().optional().describe("Ticket ID"),
    projectId: z.string().optional().describe("Project ID"),
    sessionId: z.string().optional().describe("Conversation session ID"),
  },
  async ({ ticketId, projectId, sessionId }) => {
    return withErrorHandling(
      "get_context_summary",
      { ticketId, projectId, sessionId },
      async () => {
        const context = detectContext(db, { ticketId, projectId, sessionId });

        if (context.type === "error") {
          return {
            content: [
              {
                type: "text",
                text: formatContextDetectionError(context),
                isError: true,
              },
            ],
          };
        }

        const summary = getContextSummary(context);

        return {
          content: [
            {
              type: "text",
              text: summary,
            },
          ],
        };
      }
    );
  }
);

server.tool(
  "is_context_relevant",
  `Check if a tool category is relevant to the current context.

  [rest of description unchanged]`,
  {
    toolCategory: z
      .string()
      .describe(
        "Tool category to check (ticket_work, planning, review, admin, code, testing, git, general, settings, project_management)"
      ),
    ticketId: z.string().optional().describe("Ticket ID"),
    projectId: z.string().optional().describe("Project ID"),
    sessionId: z.string().optional().describe("Conversation session ID"),
  },
  async ({ toolCategory, ticketId, projectId, sessionId }) => {
    return withErrorHandling(
      "is_context_relevant",
      { toolCategory, ticketId, projectId, sessionId },
      async () => {
        const context = detectContext(db, { ticketId, projectId, sessionId });

        if (context.type === "error") {
          return {
            content: [
              {
                type: "text",
                text: formatContextDetectionError(context),
                isError: true,
              },
            ],
          };
        }

        const relevant = isContextRelevant(context, toolCategory);
        const contextSummary = getContextSummary(context);

        return {
          content: [
            {
              type: "text",
              text: `Tool category '${toolCategory}' is ${relevant ? "RELEVANT" : "NOT RELEVANT"} to current context.\n\nContext: ${contextSummary}`,
            },
          ],
        };
      }
    );
  }
);
```

---

## MEDIUM FIX #1: Add Validation to Utility Functions

**File**: `mcp-server/lib/context-detection.js`

### Update isContextRelevant() (Lines 230-246)

```javascript
/**
 * Determine if a given context is suitable for a particular tool category.
 * Used by tool filtering to determine visibility.
 *
 * @param {Object} context - Context object from detectContext()
 * @param {string} toolCategory - Tool category to check (e.g., 'ticket_work', 'planning', 'review', 'admin')
 * @returns {boolean} True if tool category is relevant to context
 */
export function isContextRelevant(context, toolCategory) {
  if (!context || !toolCategory) return false;

  // Validate that context has expected shape
  if (typeof context !== "object" || Array.isArray(context)) {
    log.warn(`Invalid context type passed to isContextRelevant: ${typeof context}`);
    return false;
  }

  const contextType = context.type;

  // Don't silently default to 'idle' if type is missing - that's a bug
  if (!contextType) {
    log.warn("Context object missing 'type' property");
    return false;
  }

  // Map context types to relevant tool categories
  const categoryMap = {
    ticket_work: ["ticket_work", "code", "testing", "git", "general"],
    planning: ["planning", "ticket_management", "general"],
    review: ["review", "code", "testing", "general"],
    admin: ["admin", "settings", "general", "project_management"],
    idle: ["general", "admin"],
    error: ["general"], // Error contexts allow general tools only
  };

  const relevantCategories = categoryMap[contextType];

  if (!relevantCategories) {
    log.warn(`Unknown context type: ${contextType}`);
    return false;
  }

  return relevantCategories.includes(toolCategory);
}
```

### Update getContextSummary() (Lines 255-269)

```javascript
/**
 * Get a human-readable summary of the current context.
 * Useful for logging and debugging context detection.
 *
 * @param {Object} context - Context object from detectContext()
 * @returns {string} Human-readable context summary
 */
export function getContextSummary(context) {
  if (!context) return "Unknown context (null)";

  // Validate that context is an object
  if (typeof context !== "object" || Array.isArray(context)) {
    return `Invalid context type: ${typeof context}`;
  }

  const { type, ticketId, projectId, status, description } = context;

  // Handle error contexts specially
  if (type === "error") {
    const errors = context.errors || [];
    if (errors.length > 0) {
      return `${type} context: ${context.description || "Context detection failed"}`;
    }
  }

  // Build summary with safer null/undefined handling
  if (ticketId) {
    return `${type || "unknown"} context: Ticket ${ticketId} (${status || "unknown status"}) in project ${projectId || "unknown"}`;
  }

  if (projectId) {
    return `${type || "unknown"} context: Project ${projectId}`;
  }

  return `${type || "unknown"} context: ${description || "No active work"}`;
}
```

---

## MEDIUM FIX #2: Add Missing Table to Test Schema

**File**: `mcp-server/__tests__/context-detection.test.js`

### Update initializeTestDatabase() (Around line 31)

Add the missing `ticket_comments` table before the index creation:

```javascript
function initializeTestDatabase() {
  const db = new Database(":memory:");

  // Read and execute schema
  const schemaPath = path.join(__dirname, "../lib/schema.sql");
  try {
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);
  } catch {
    // If schema.sql doesn't exist, create tables manually
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        color TEXT,
        working_method TEXT DEFAULT 'auto',
        default_isolation_mode TEXT,
        worktree_location TEXT DEFAULT 'sibling',
        worktree_base_path TEXT,
        max_worktrees INTEGER DEFAULT 5,
        auto_cleanup_worktrees INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE epics (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        color TEXT,
        isolation_mode TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT,
        position REAL NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
        tags TEXT,
        subtasks TEXT,
        is_blocked INTEGER DEFAULT 0,
        blocked_reason TEXT,
        linked_files TEXT,
        attachments TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        branch_name TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        pr_status TEXT
      );

      CREATE TABLE ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        type TEXT,
        content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE conversation_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        ticket_id TEXT REFERENCES tickets(id),
        environment TEXT,
        data_classification TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_epics_project ON epics(project_id);
      CREATE INDEX idx_tickets_project ON tickets(project_id);
      CREATE INDEX idx_tickets_epic ON tickets(epic_id);
      CREATE INDEX idx_tickets_status ON tickets(status);
      CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
    `);
  }

  return db;
}
```

---

## MEDIUM FIX #3: Add Error Checking to Test Helpers

**File**: `mcp-server/__tests__/context-detection.test.js`

### Update insertTestProject() (Line 103)

```javascript
function insertTestProject(db, id = "proj-1", name = "Test Project") {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, name, `/tmp/${id}`, now);

  if (result.changes !== 1) {
    throw new Error(`Failed to insert test project ${id}`);
  }
  return id;
}
```

### Update insertTestTicket() (Line 111)

```javascript
function insertTestTicket(
  db,
  ticketId = "ticket-1",
  projectId = "proj-1",
  status = "backlog",
  title = "Test Ticket"
) {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO tickets
     (id, title, status, project_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(ticketId, title, status, projectId, 1.0, now, now);

  if (result.changes !== 1) {
    throw new Error(`Failed to insert test ticket ${ticketId}`);
  }
  return ticketId;
}
```

### Update insertTestSession() (Line 127)

```javascript
function insertTestSession(
  db,
  sessionId = "session-1",
  ticketId = null,
  projectId = null
) {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO conversation_sessions
     (id, project_id, ticket_id, environment, data_classification, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, projectId, ticketId, "test", "internal", now, now);

  if (result.changes !== 1) {
    throw new Error(`Failed to insert test session ${sessionId}`);
  }
  return sessionId;
}
```

---

## Summary of Changes

| Issue | Severity | File | Fix Type |
| --- | --- | --- | --- |
| Silent catch blocks | CRITICAL | context-detection.js | Replace with error context objects |
| No input validation | CRITICAL | context-detection.js | Add Zod schema validation |
| Unspecific database errors | CRITICAL | context-detection.js | Distinguish initialization vs runtime errors |
| Generic error messages | HIGH | context.js | Add detailed guidance in error responses |
| Empty array on error | HIGH | context-detection.js | Return result object with success flag |
| Missing context validation | HIGH | context-detection.js | Add property validation to utilities |
| Error handling duplication | HIGH | context.js | Extract reusable helper function |
| Missing test table | MEDIUM | context-detection.test.js | Add ticket_comments table |
| No test helper validation | MEDIUM | context-detection.test.js | Add error checking to test helpers |
| Missing error context in logs | MEDIUM | context.js | Include parameters in error logs |
| Invalid status not detected | MEDIUM | context-detection.js | Validate status values explicitly |

---

## Testing the Fixes

After applying these fixes, test with:

```bash
# Run the context detection tests
pnpm test context-detection.test.js

# Run all tests
pnpm test

# Run linting (type checking)
pnpm type-check

# Test the MCP tools directly
pnpm dev
# Then in Claude Code, try calling the detect_context tool with various inputs
```
