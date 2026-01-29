# Error Handling Audit Report: Context Detection System

**Auditor**: Silent Failure Hunter
**Files Reviewed**:
- mcp-server/lib/context-detection.js
- mcp-server/tools/context.js
- mcp-server/__tests__/context-detection.test.js

**Severity Summary**:
- CRITICAL: 3 issues
- HIGH: 6 issues
- MEDIUM: 5 issues

---

## CRITICAL Issues

### 1. Silent Database Failures in detectContext()

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/lib/context-detection.js, lines 38-53, 56-69, 73-81

**Severity**: CRITICAL

**Issue Description**:

Three database operations are wrapped in broad try-catch blocks that silently swallow failures with only debug-level logging. This is the textbook definition of a silent failure - the code continues as if nothing happened while critical data lookups fail.

```javascript
// Lines 38-53: Session lookup
if (sessionId) {
  try {
    activeSession = db.prepare(...)
      .get(sessionId);
    if (activeSession) {
      activeTicketId = activeSession.ticket_id;
    }
  } catch (err) {
    log.debug(`Session lookup failed (expected if table doesn't exist): ${err.message}`);
    // ← Function continues silently, activeSession remains null
  }
}

// Lines 56-69: Ticket lookup
if (activeTicketId) {
  try {
    activeTicket = db.prepare(...)
      .get(activeTicketId);
  } catch (err) {
    log.debug(`Ticket lookup failed: ${err.message}`);
    // ← Function continues silently, activeTicket remains null
  }
}

// Lines 73-81: Project lookup
if (effectiveProjectId) {
  try {
    activeProject = db.prepare(...)
      .get(effectiveProjectId);
  } catch (err) {
    log.debug(`Project lookup failed: ${err.message}`);
    // ← Function continues silently, activeProject remains null
  }
}
```

**Why This Is Problematic**:

1. **Users receive incorrect context**: If a ticket lookup fails, `activeTicket` remains null, and the function returns an `admin` context instead of the correct context type. The user has no way to know the lookup failed.

2. **Silent downgrade of functionality**: A user in the middle of implementing a ticket (`in_progress` status) might be told they're in `admin` context because the ticket lookup silently failed. This breaks all workflow enforcement that depends on accurate context detection.

3. **Debug-level logging is invisible**: Debug logs are only written if `LOG_LEVEL=DEBUG` is set. In production, these failures are completely invisible - no error is logged at all.

4. **Comment is misleading**: Line 51 says "expected if table doesn't exist" - but this is NOT the normal case. The `conversation_sessions` table should exist after application initialization. If it doesn't, that's a critical initialization failure that should be surfaced, not hidden.

5. **Impossible to debug later**: A user reports "my context detection is wrong" but the actual error (database query failure) is nowhere in the logs. Developers have no trace of what went wrong.

**Hidden Errors Being Swallowed**:

- Database corruption (query syntax error, schema mismatch)
- Connection failures (database locked by another process)
- Missing tables (initialization incomplete)
- Permission errors (read access denied)
- Memory errors (database object deleted mid-query)
- Any SQLite error that doesn't match expected patterns

**User Impact**:

- Users attempting to work on tickets get sent to `admin` context instead of `ticket_work`
- Ralph workflow breaks silently (can't detect ticket status)
- No error message, user left confused about why context is wrong
- 6 months later, when trying to debug, developers find nothing in logs

**Recommendation**:

Replace debug-level logging with proper error handling that:
1. Distinguishes between recoverable and fatal errors
2. Returns error context when data can't be retrieved
3. Logs errors at ERROR level with full context
4. Propagates meaningful errors to callers

**Example - What Should Happen**:

```javascript
export function detectContext(db, options = {}) {
  const { ticketId, projectId, sessionId } = options;

  let activeTicketId = ticketId;
  let activeTicket = null;
  let activeProject = null;
  let activeSession = null;
  let detectionErrors = [];

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
      // Log as ERROR, not debug - this is a real problem
      log.error(
        `Failed to lookup session ${sessionId}: ${err.message}. Context detection may be inaccurate.`,
        err
      );
      detectionErrors.push({
        operation: "session_lookup",
        sessionId,
        error: err.message,
      });
      // Continue, but track that we have an error
    }
  }

  // ... more lookups with similar error handling

  // If we have critical errors, return error context
  if (detectionErrors.length > 0) {
    return {
      type: "error",
      errors: detectionErrors,
      description: "Context detection failed - database operations unsuccessful",
      fallback: {
        type: "admin",
        reason: "Database errors occurred during context detection",
      },
    };
  }

  // Normal context detection continues...
}
```

---

### 2. No Input Validation in detectContext()

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/lib/context-detection.js, line 28

**Severity**: CRITICAL

**Issue Description**:

The `detectContext()` function accepts `options` parameter but never validates it. There's no check that the parameters are actual strings, not nulls, undefined, or malicious inputs. This is compounded by the database queries that use these values directly in prepared statements.

```javascript
export function detectContext(db, options = {}) {
  const { ticketId, projectId, sessionId } = options;
  // No validation of types or values

  if (sessionId) { // What if sessionId is an empty string? false? 0?
    try {
      activeSession = db
        .prepare(`SELECT * FROM conversation_sessions WHERE id = ? AND ended_at IS NULL LIMIT 1`)
        .get(sessionId); // sessionId passed directly to prepared statement
```

**Why This Is Problematic**:

1. **SQL injection vulnerability**: Although SQLite prepared statements provide some protection, validating at the application level provides defense-in-depth and catches bugs earlier.

2. **Falsy values break logic**: An empty string `ticketId = ""` would pass the `if (activeTicketId)` check if it's truthy initially, but later comparisons might behave unexpectedly.

3. **Type confusion**: There's no guarantee that these are strings. They could be objects, arrays, or numbers, causing unexpected behavior in SQL queries.

4. **No error messages**: If invalid data reaches the database layer, the error is caught and logged at debug level (see Issue #1), so invalid input is silently ignored.

**Hidden Errors Being Swallowed**:

- Type errors (passing objects instead of strings)
- Invalid ID formats (very long strings, special characters)
- Null/undefined handling inconsistencies

**User Impact**:

- Invalid inputs silently produce wrong results
- Difficult to debug when context detection receives malformed data from callers

**Recommendation**:

Add input validation using Zod (already used in context.js for tool parameters):

```javascript
import { z } from "zod";

const DetectContextOptionsSchema = z.object({
  ticketId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
});

export function detectContext(db, options = {}) {
  // Validate and normalize inputs
  let validated;
  try {
    validated = DetectContextOptionsSchema.parse(options);
  } catch (err) {
    log.error(
      `Invalid context detection options: ${err.message}`,
      err
    );
    return {
      type: "error",
      description: "Context detection failed - invalid options provided",
      fallback: { type: "admin", reason: "Invalid input parameters" },
      errors: [{ field: "options", reason: err.message }],
    };
  }

  const { ticketId, projectId, sessionId } = validated;
  // ... rest of function
}
```

---

### 3. Database Query Errors Not Distinguished from Expected Cases

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/lib/context-detection.js, lines 50-51

**Severity**: CRITICAL

**Issue Description**:

The catch block for session lookup includes a comment "expected if table doesn't exist" that conflates two completely different scenarios:

```javascript
} catch (err) {
  log.debug(`Session lookup failed (expected if table doesn't exist): ${err.message}`);
}
```

This comment suggests missing tables are expected, which is only true during initialization. Once the application is running normally, this error should never happen. By treating it as expected and logging at debug level, real problems are hidden.

**Why This Is Problematic**:

1. **Hides initialization bugs**: If a migration fails to run, tables won't exist, but this error would be invisible in production logs.

2. **Assumes bugs are features**: The comment normalizes a failure case that shouldn't happen in normal operation.

3. **No guidance for debugging**: When someone reports issues, there's no way to know if it's a table-missing problem or something else.

4. **Enables latent bugs**: Code can ship with missing migrations and only fail in production when context detection breaks silently.

**Recommendation**:

Check for specific error conditions and handle them differently:

```javascript
if (sessionId) {
  try {
    activeSession = db
      .prepare(`SELECT * FROM conversation_sessions WHERE id = ? AND ended_at IS NULL LIMIT 1`)
      .get(sessionId);
    if (activeSession) {
      activeTicketId = activeSession.ticket_id;
    }
  } catch (err) {
    // Check if this is a "table doesn't exist" error
    if (err.message.includes("no such table") || err.code === "SQLITE_ERROR") {
      // This indicates a real initialization problem
      log.error(
        `FATAL: conversation_sessions table does not exist. Database initialization incomplete.`,
        err
      );
      return {
        type: "error",
        errors: [{
          operation: "database_initialization",
          reason: "conversation_sessions table missing",
          recovery: "Run database migrations with: pnpm db:migrate"
        }],
      };
    }

    // Any other error is unexpected and should be logged at ERROR level
    log.error(
      `Unexpected error looking up session ${sessionId}: ${err.message}`,
      err
    );
    detectionErrors.push({
      operation: "session_lookup",
      sessionId,
      error: err.message,
    });
  }
}
```

---

## HIGH Issues

### 4. MCP Tool Error Responses Lack Actionability

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/tools/context.js, lines 66-77

**Severity**: HIGH

**Issue Description**:

When the `detect_context` tool encounters an error, it returns a generic error message that doesn't tell users what went wrong or how to fix it:

```javascript
} catch (err) {
  log.error("Failed to detect context", err);
  return {
    content: [
      {
        type: "text",
        text: `Failed to detect context: ${err.message}`, // ← Too generic
        isError: true,
      },
    ],
  };
}
```

**Why This Is Problematic**:

1. **Users don't know what failed**: The error message just says "detect context" failed. Was it a database issue? Invalid input? Missing tables?

2. **No recovery guidance**: Users are left without any suggestion for how to recover (check database status, verify arguments, run migrations, etc.)

3. **Inconsistent with tool descriptions**: The tool's description explains what each parameter does, but error responses don't help users fix parameter problems.

4. **Logs error twice without context**: `log.error()` is called with minimal info, and then the error message is passed to the user with even less info.

**Example Error Messages Users Might See**:

- `Failed to detect context: SQLITE_CANTOPEN` (what does this mean?)
- `Failed to detect context: no such table: conversation_sessions` (you need to... run migrations? But the user doesn't know that)
- `Failed to detect context: Cannot read properties of undefined` (where is undefined? in which option?)

**Recommendation**:

Enhance error handling to provide actionable messages:

```javascript
async ({ ticketId, projectId, sessionId }) => {
  try {
    const context = detectContext(db, { ticketId, projectId, sessionId });

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
  } catch (err) {
    log.error("Unexpected error detecting context", err);

    // Provide specific guidance based on error type
    let guidance = "An unexpected error occurred during context detection. ";
    if (err.message.includes("no such table")) {
      guidance += "The database may not be initialized. Run: pnpm db:migrate";
    } else if (err.message.includes("database is locked")) {
      guidance += "The database is currently locked by another process. Try again in a moment.";
    } else if (err.message.includes("SQLITE_CANTOPEN")) {
      guidance += "Cannot open the database file. Check file permissions and disk space.";
    } else {
      guidance += `Check the logs for details: ${err.message}`;
    }

    return {
      content: [
        {
          type: "text",
          text: guidance,
          isError: true,
        },
      ],
    };
  }
}
```

---

### 5. detectAllActiveContexts() Silently Returns Empty Array on Database Error

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/lib/context-detection.js, lines 194-220

**Severity**: HIGH

**Issue Description**:

When `detectAllActiveContexts()` encounters a database error, it catches the exception and silently returns an empty array:

```javascript
export function detectAllActiveContexts(db) {
  const activeContexts = [];

  try {
    // Find all active sessions
    const activeSessions = db
      .prepare(`SELECT DISTINCT session_id, ticket_id, project_id FROM conversation_sessions WHERE ended_at IS NULL`)
      .all();

    for (const session of activeSessions) {
      // ... process sessions
    }
  } catch (err) {
    log.debug(`Failed to detect all active contexts: ${err.message}`);
  }

  return activeContexts; // Returns [] even if error occurred
}
```

**Why This Is Problematic**:

1. **Undetectable failure**: Caller has no way to distinguish between "no active contexts" and "database error prevented checking for active contexts". These are completely different situations.

2. **Silent data loss**: If there ARE active contexts but the query fails, the caller gets an empty list and thinks everything is fine.

3. **System state confusion**: Multi-window workflows depend on detecting ALL active contexts. Returning an empty array when the check fails could cause race conditions if the caller makes decisions based on "no active contexts".

4. **Debug-level logging only**: The error is logged at debug level, so in production this failure is invisible.

5. **Test doesn't cover this**: The test suite (line 353-356) only tests the happy path when no sessions exist, not the error case.

**User Impact**:

- Multi-window workflow could have conflicts because one window doesn't know about others' active contexts
- Cleanup operations might fail to find contexts that need cleanup
- Users attempting parallel work get confused when Ralph doesn't recognize that another ticket is already being worked on

**Recommendation**:

Return structured error information so callers can distinguish failure from "no contexts":

```javascript
/**
 * Get all currently active contexts across all sessions.
 * @param {import("better-sqlite3").Database} db
 * @returns {Object} Result object with contexts array and error status
 */
export function detectAllActiveContexts(db) {
  const activeContexts = [];

  try {
    const activeSessions = db
      .prepare(`SELECT DISTINCT session_id, ticket_id, project_id FROM conversation_sessions WHERE ended_at IS NULL`)
      .all();

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
      reason: "Could not query database for active sessions",
    };
  }
}
```

Then update the MCP tool to handle this:

```javascript
server.tool("detect_all_contexts", ..., async () => {
  try {
    const result = detectAllActiveContexts(db);

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: `Failed to detect contexts: ${result.reason}\n\nError: ${result.error}`,
          isError: true,
        }],
      };
    }

    if (result.count === 0) {
      return {
        content: [{
          type: "text",
          text: "No active contexts found. No conversation sessions are currently active.",
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result.contexts, null, 2),
      }],
    };
  } catch (err) {
    log.error("Unexpected error detecting all contexts", err);
    return {
      content: [{
        type: "text",
        text: `Unexpected error: ${err.message}`,
        isError: true,
      }],
    };
  }
});
```

---

### 6. isContextRelevant() and getContextSummary() Don't Handle Missing Context Properties

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/lib/context-detection.js, lines 230-269

**Severity**: HIGH

**Issue Description**:

These utility functions check for null context but don't validate that the context object has the expected properties:

```javascript
export function isContextRelevant(context, toolCategory) {
  if (!context || !toolCategory) return false;

  const contextType = context.type || "idle"; // Falls back silently
  // ... uses contextType
}

export function getContextSummary(context) {
  if (!context) return "Unknown context";

  const { type, ticketId, projectId, status, description } = context;
  // No check that these properties exist

  if (ticketId) { // What if ticketId is undefined?
    return `${type} context: Ticket ${ticketId} (${status}) in project ${projectId || "unknown"}`;
    // status could be undefined, description could be undefined
  }
}
```

**Why This Is Problematic**:

1. **Implicit undefined behavior**: If context doesn't have `type` property, it defaults to `"idle"`. But what if type is supposed to be `"ticket_work"` and the property is missing due to a bug? The fallback silently masks the error.

2. **Incomplete summaries**: `getContextSummary()` might return incomplete text if properties are missing (e.g., status could be undefined).

3. **Defensive coding missing**: These functions should validate their inputs and fail loudly if inputs don't match expected shape.

4. **Tests don't cover malformed context**: The test suite creates well-formed context objects but never tests what happens when properties are missing (which could happen if detectContext bugs are introduced).

**Example Failures**:

```javascript
// Caller has a bug and passes context with wrong shape
const brokenContext = { ticketId: "ticket-1" }; // missing type, status
getContextSummary(brokenContext);
// Returns: "undefined context: Ticket ticket-1 (undefined) in project unknown"
// User sees garbage, no error logged

isContextRelevant(brokenContext, "ticket_work");
// Returns: false (because context.type is undefined, falls back to "idle")
// But if context WAS ticket_work, this is wrong!
```

**Recommendation**:

Add property validation and fail loudly on malformed context:

```javascript
import { z } from "zod";

// Define expected context shape
const ContextSchema = z.object({
  type: z.enum(["ticket_work", "planning", "review", "admin", "error", "idle"]),
  ticketId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export function isContextRelevant(context, toolCategory) {
  if (!context || !toolCategory) return false;

  try {
    const validated = ContextSchema.partial().parse(context);
    const contextType = validated.type || "idle";

    // ... rest of function
  } catch (err) {
    log.warn(`Malformed context object passed to isContextRelevant: ${err.message}`, err);
    // Return false to be safe when context is malformed
    return false;
  }
}

export function getContextSummary(context) {
  if (!context) return "Unknown context";

  try {
    const validated = ContextSchema.partial().parse(context);
    const { type, ticketId, projectId, status, description } = validated;

    if (ticketId) {
      return `${type || "unknown"} context: Ticket ${ticketId} (${status || "unknown status"}) in project ${projectId || "unknown"}`;
    }

    if (projectId) {
      return `${type || "unknown"} context: Project ${projectId}`;
    }

    return `${type || "unknown"} context: ${description || "No active work"}`;
  } catch (err) {
    log.warn(`Invalid context object: ${err.message}`, err);
    return "Invalid context (malformed object)";
  }
}
```

---

### 7. All MCP Tools Use Identical Error Handling Pattern (Code Duplication)

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/tools/context.js, lines 54-78, 94-129, 152-177, 207-234

**Severity**: HIGH

**Issue Description**:

All four MCP tools in this file have identical try-catch-return error handling, making it hard to maintain consistent error messages:

```javascript
// Tool 1: detect_context
async ({ ticketId, projectId, sessionId }) => {
  try {
    const context = detectContext(db, { ticketId, projectId, sessionId });
    return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
  } catch (err) {
    log.error("Failed to detect context", err);
    return {
      content: [{ type: "text", text: `Failed to detect context: ${err.message}`, isError: true }],
    };
  }
}

// Tool 2: detect_all_contexts (almost identical)
async () => {
  try {
    const contexts = detectAllActiveContexts(db);
    // ... slightly different logic
  } catch (err) {
    log.error("Failed to detect all active contexts", err);
    return {
      content: [{ type: "text", text: `Failed to detect active contexts: ${err.message}`, isError: true }],
    };
  }
}

// Tool 3: get_context_summary (more of the same)
// Tool 4: is_context_relevant (more of the same)
```

**Why This Is Problematic**:

1. **Inconsistent error messages**: Each tool uses different error message text ("Failed to detect context" vs "Failed to detect active contexts"), making it hard to provide consistent guidance.

2. **Maintenance nightmare**: If you need to improve error handling, you have to change it in 4 places.

3. **Duplicated log calls**: Every tool calls `log.error()` with similar parameters but slightly different messages.

4. **Hard to add global error policies**: If you want to add a "max retries" or "error rate limiting" feature, you'd have to modify all 4 tools.

**Recommendation**:

Extract error handling into a reusable helper:

```javascript
/**
 * Wrap tool execution with consistent error handling and logging
 * @param {string} toolName - Name of the tool for logging
 * @param {Function} operation - Async function that performs the tool operation
 * @returns {Object} MCP tool response
 */
async function withErrorHandling(toolName, operation) {
  try {
    const result = await operation();
    return result;
  } catch (err) {
    log.error(`Tool '${toolName}' failed`, err);

    // Determine error type and provide actionable message
    let message = `Tool failed: ${err.message}`;
    if (err.message.includes("no such table")) {
      message = `Database not initialized. Run: pnpm db:migrate`;
    } else if (err.message.includes("SQLITE_CANTOPEN")) {
      message = `Cannot access database. Check file permissions and disk space.`;
    } else if (err.message.includes("database is locked")) {
      message = `Database is locked. Another process is accessing it. Try again.`;
    }

    return {
      content: [{
        type: "text",
        text: message,
        isError: true,
      }],
    };
  }
}

// Then use it in all tools:
export function registerContextTools(server, db) {
  server.tool("detect_context", ...,
    async ({ ticketId, projectId, sessionId }) => {
      return withErrorHandling("detect_context", async () => {
        const context = detectContext(db, { ticketId, projectId, sessionId });
        return {
          content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
        };
      });
    }
  );

  server.tool("detect_all_contexts", ...,
    async () => {
      return withErrorHandling("detect_all_contexts", async () => {
        const contexts = detectAllActiveContexts(db);
        // ... logic
      });
    }
  );

  // ... other tools with same pattern
}
```

---

## MEDIUM Issues

### 8. Test Database Schema Missing ticket_comments Table

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/__tests__/context-detection.test.js, lines 31-96

**Severity**: MEDIUM

**Issue Description**:

The test database initialization doesn't create the `ticket_comments` table, even though it's referenced in the schema:

```javascript
// Line 91-92 creates index on non-existent table
CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
```

This would cause an error if any code tries to insert comments during tests, but the tests don't exercise that code path so the error is hidden.

**Why This Is Problematic**:

1. **Test database doesn't match production**: If production code tries to work with comments, tests won't catch problems.

2. **Silent index creation failure**: SQLite would fail to create the index on a non-existent table, but this error isn't checked.

3. **Future bugs**: Future developers might add context detection that includes comment data, but tests would fail mysteriously.

**Recommendation**:

Add the missing table to the test database schema:

```javascript
CREATE TABLE ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT,
  content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

### 9. Test Helper insertTestSession() Doesn't Validate Success

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/__tests__/context-detection.test.js, lines 127-140

**Severity**: MEDIUM

**Issue Description**:

The test helper functions don't check if the insert succeeded:

```javascript
function insertTestSession(db, sessionId = "session-1", ticketId = null, projectId = null) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO conversation_sessions ...`)
    .run(sessionId, projectId, ticketId, "test", "internal", now, now);
  // Never checks if run() succeeded, never checks for errors
  return sessionId;
}
```

**Why This Is Problematic**:

1. **Silent test data failures**: If a test helper fails to insert data, the test proceeds with incomplete data.

2. **Tests pass with wrong data**: A test might pass even though the data setup failed, masking bugs.

3. **Example**:
   ```javascript
   insertTestSession(db, "session-1", "ticket-8", "proj-1"); // If this fails...
   const context = detectContext(db, { sessionId: "session-1" }); // ...no session exists
   expect(context.type).toBe("ticket_work"); // Test might still pass if detectContext defaults to admin
   ```

**Recommendation**:

Add error checking to test helpers:

```javascript
function insertTestSession(db, sessionId = "session-1", ticketId = null, projectId = null) {
  const now = new Date().toISOString();
  const result = db.prepare(`INSERT INTO conversation_sessions ...`)
    .run(sessionId, projectId, ticketId, "test", "internal", now, now);

  if (result.changes !== 1) {
    throw new Error(`Failed to insert test session ${sessionId}`);
  }
  return sessionId;
}
```

---

### 10. Missing Error Context in Log Messages

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/tools/context.js, lines 67, 118, 166, 223

**Severity**: MEDIUM

**Issue Description**:

When logging errors, the code doesn't include the input parameters that caused the error:

```javascript
async ({ ticketId, projectId, sessionId }) => {
  try {
    const context = detectContext(db, { ticketId, projectId, sessionId });
    // ...
  } catch (err) {
    log.error("Failed to detect context", err);
    // ↑ Error log doesn't include ticketId, projectId, or sessionId
    // So later, when debugging, there's no way to know WHICH ticket/project failed
  }
}
```

**Why This Is Problematic**:

1. **Insufficient debugging info**: When investigating logs, developers don't know which specific ticket/project/session caused the error.

2. **Hard to reproduce**: An error happens with "ticket-123" but the log just says "Failed to detect context". Developers can't easily reproduce.

3. **Incomplete audit trail**: For compliance/debugging, you need to know what inputs caused failures.

**Recommendation**:

Include input parameters in error logs:

```javascript
async ({ ticketId, projectId, sessionId }) => {
  try {
    const context = detectContext(db, { ticketId, projectId, sessionId });
    return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
  } catch (err) {
    log.error(
      `Failed to detect context for: ticketId=${ticketId}, projectId=${projectId}, sessionId=${sessionId}`,
      err
    );
    return {
      content: [{
        type: "text",
        text: `Failed to detect context: ${err.message}`,
        isError: true,
      }],
    };
  }
}
```

---

### 11. Invalid Ticket Status Not Handled

**Location**: /Users/salman.rana/code/brain-dump-epic-8bacfe2b-mcp-tool-consolidation-and-con/mcp-server/lib/context-detection.js, lines 84-168

**Severity**: MEDIUM

**Issue Description**:

The status matching in `detectContext()` only handles specific status values (in_progress, ai_review, human_review, backlog, ready, done) but falls through to `admin` context if an unknown status is found:

```javascript
if (status === "in_progress") {
  return { type: "ticket_work", ... };
}
if (status === "ai_review" || status === "human_review") {
  return { type: "review", ... };
}
if (status === "backlog" || status === "ready") {
  return { type: "planning", ... };
}
if (status === "done") {
  return { type: "admin", ... };
}

// Falls through to here if status is unrecognized
return { type: "admin", ... };
```

**Why This Is Problematic**:

1. **Silent data corruption**: If a ticket somehow gets an invalid status value, the function silently returns `admin` context instead of flagging the problem.

2. **Database corruption not detected**: Status should be validated in the database schema. If an invalid value slips in, context detection masks it.

3. **No audit trail**: There's no log entry saying "found invalid ticket status", so you never know if data corruption occurred.

**Example Scenario**:

```
-- Database gets corrupted somehow
UPDATE tickets SET status = 'completed' WHERE id = 'ticket-1';

-- User tries to continue work
detectContext(db, { ticketId: 'ticket-1' });

-- Returns admin context silently, no warning
// User is confused why they're in admin context when they were working on ticket-1
// Developers have no log entry of the invalid status
```

**Recommendation**:

Add validation and logging for invalid statuses:

```javascript
if (activeTicket) {
  const { status, id: ticketId } = activeTicket;
  const validStatuses = ["in_progress", "ai_review", "human_review", "backlog", "ready", "done"];

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
      metadata: {
        ticket: activeTicket,
        project: activeProject,
        session: activeSession,
        validationError: {
          field: "status",
          value: status,
          expected: validStatuses,
        },
      },
    };
  }

  // ... rest of status matching with confidence that status is valid
}
```

---

## Summary of Patterns

### Silent Failures Pattern

The code has a consistent pattern of catching database errors and logging them only at debug level:

```
Line 50-51: Session lookup → log.debug()
Line 67: Ticket lookup → log.debug()
Line 79: Project lookup → log.debug()
Line 216: All active contexts → log.debug()
```

This pattern needs to be replaced with:
- ERROR level logging for true errors
- Returning error context objects instead of silently continuing
- Input validation to prevent errors
- Specific error types instead of generic "failed" messages

### Test Coverage Gaps

Tests cover the happy path but don't test:
- Database errors (connection failure, query failure)
- Invalid input parameters
- Malformed context objects
- Database corruption (invalid statuses)
- Missing tables
- Concurrent access patterns

### Lack of Input Validation

Neither `detectContext()` nor the MCP tools validate their inputs before using them in database queries.

---

## Recommended Priority for Fixes

1. **Critical** (do immediately):
   - Replace silent catch blocks in detectContext() with proper error handling
   - Add input validation to detectContext() using Zod
   - Distinguish between "table doesn't exist" and other errors in session lookup

2. **High** (do before merging):
   - Add error context to all MCP tool responses
   - Update detectAllActiveContexts() to return error information
   - Extract common error handling pattern into reusable helper

3. **Medium** (do in follow-up PR):
   - Add validation to isContextRelevant() and getContextSummary()
   - Add test coverage for error cases
   - Add context parameter logging to error messages
   - Validate ticket status values

---

## Files to Review for Similar Patterns

This error handling pattern (catch and log at debug level) might exist in other files. Check:

- mcp-server/tools/tickets.js
- mcp-server/tools/projects.js
- mcp-server/tools/*.js (all tools files)
- src/api/*.ts (all server functions)

The same review should be applied to all database query operations in the codebase.
