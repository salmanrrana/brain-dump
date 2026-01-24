# Error Handling Audit: Claude Tasks Integration Branch

## Executive Summary

This audit identified **8 critical and high-severity error handling issues** across the Claude Tasks feature implementation. The most severe problem is a **silent failure pattern in the bash hook that discards errors without notification**, making debugging impossible when tasks fail to save. Additionally, there are **missing error validations and inadequate error context** in multiple places.

---

## Critical Issues

### CRITICAL-1: Silent Background Process Failures in Bash Hook

**Location:** `/Users/salman.rana/code/brain-dump/.claude/hooks/capture-claude-tasks.sh` (lines 83-87)

**Severity:** CRITICAL

**Issue:**

```bash
# Run in background to not block Claude
(
  cd "$PROJECT_DIR"
  PROJECT_DIR="$PROJECT_DIR" node "$HELPER_SCRIPT" "$TICKET_ID" "$TRANSFORMED_TASKS" >> "$LOG_FILE" 2>&1
) &

exit 0
```

This pattern runs the database save operation in a background process and immediately exits with success (line 89). If the Node.js process fails, Claude never knows. Users will think their tasks were saved when they weren't.

**Hidden Errors:**

- Task insertion fails (database locked, schema mismatch, corrupted data)
- Node.js process crashes before completing
- Helper script doesn't exist or has permission issues
- Working directory change fails
- Database is in use by another process

**User Impact:**
Users see no error message. They think their tasks are saved but discover later that tasks silently disappeared. Debugging this is nightmarish because there's no indication that anything went wrong.

**Why This Is Dangerous:**
The brain-dump philosophy (per CLAUDE.md) explicitly states: **"Never silently fail in production code."** This violates that core principle. Users cannot distinguish between:

1. Tasks were saved successfully
2. Tasks failed to save but we're hiding it

**Recommendation:**
The background process pattern should be replaced with a synchronous operation that waits for completion and communicates success/failure to Claude. Alternatively, if background execution is necessary, implement a mechanism to communicate errors back to Claude:

```bash
# Option 1: Wait for background job and check exit code
(
  cd "$PROJECT_DIR"
  PROJECT_DIR="$PROJECT_DIR" node "$HELPER_SCRIPT" "$TICKET_ID" "$TRANSFORMED_TASKS" >> "$LOG_FILE" 2>&1
  if [ $? -ne 0 ]; then
    echo "[$(date -Iseconds)] ERROR: Task save failed, check log at $LOG_FILE" >> "$LOG_FILE"
    # Could emit an event or write to a status file that Claude can check
  fi
) &

# Option 2: Use a temporary status file to communicate result
TEMP_STATUS="/tmp/claude-tasks-save-${TICKET_ID}.status"
rm -f "$TEMP_STATUS"
(
  cd "$PROJECT_DIR"
  PROJECT_DIR="$PROJECT_DIR" node "$HELPER_SCRIPT" "$TICKET_ID" "$TRANSFORMED_TASKS" >> "$LOG_FILE" 2>&1
  echo $? > "$TEMP_STATUS"
) &

# Poll briefly for completion
for i in {1..30}; do
  if [ -f "$TEMP_STATUS" ]; then
    STATUS=$(cat "$TEMP_STATUS")
    rm "$TEMP_STATUS"
    if [ "$STATUS" != "0" ]; then
      # Could write to stdin or use another mechanism to inform Claude
      exit 1
    fi
    break
  fi
  sleep 0.1
done
```

---

### CRITICAL-2: Swallowed Errors in Ralph State JSON Parsing

**Location:** `/Users/salman.rana/code/brain-dump/.claude/hooks/save-tasks-to-db.cjs` (lines 68-74)

**Severity:** CRITICAL

**Issue:**

```javascript
let sessionId = null;
try {
  const stateFile = join(projectDir, ".claude/ralph-state.json");
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    sessionId = state.sessionId || null;
  }
} catch {} // ← EMPTY CATCH BLOCK!
```

An empty catch block silently discards ALL errors. The code doesn't know if:

- The file couldn't be read (permissions issue)
- JSON is malformed (corrupted state file)
- State file has unexpected structure

**Hidden Errors:**

- File permission denied (corrupted installation)
- Out of memory reading file
- Corrupted JSON from crash during write
- File system errors
- Any other unexpected error

**User Impact:**
Silent failure. The sessionId becomes null, which could cause the task to be linked to no session at all. Users get no indication that the Ralph state couldn't be read.

**Recommendation:**
Replace the empty catch block with proper error handling:

```javascript
let sessionId = null;
try {
  const stateFile = join(projectDir, ".claude/ralph-state.json");
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    sessionId = state.sessionId || null;
  }
} catch (err) {
  // Log the error but don't crash - sessionId will be null
  console.warn(`Warning: Failed to read Ralph state: ${err.message}`);
  // Users should still be able to save tasks without session link
}
```

---

### CRITICAL-3: Unvalidated JSON.parse in Snapshots Endpoint

**Location:** `/Users/salman.rana/code/brain-dump/mcp-server/tools/claude-tasks.js` (lines 484-485)

**Severity:** CRITICAL

**Issue:**

```javascript
const formattedSnapshots = snapshots.map((s) => ({
  id: s.id,
  sessionId: s.session_id,
  reason: s.reason,
  createdAt: s.created_at,
  tasks: JSON.parse(s.tasks), // ← No error handling!
  taskCount: JSON.parse(s.tasks).length,
}));
```

If `s.tasks` contains invalid JSON (due to database corruption, failed previous write, or character encoding issues), `JSON.parse()` throws an unhandled error that crashes the MCP server tool.

**Hidden Errors:**

- Corrupted task JSON in database (from previous failed insert)
- Character encoding issues
- Incomplete writes from previous operation
- Database schema mismatch

**User Impact:**
Claude gets a hard error when trying to retrieve snapshots. The entire tool fails, potentially blocking work.

**Recommendation:**
Wrap JSON parsing with try-catch and handle gracefully:

```javascript
const formattedSnapshots = snapshots.map((s) => {
  let tasks = [];
  try {
    tasks = JSON.parse(s.tasks);
  } catch (err) {
    log.error(`Failed to parse tasks for snapshot ${s.id}: ${err.message}`);
    // Return snapshot with empty tasks array to avoid crashing
    tasks = [];
  }

  return {
    id: s.id,
    sessionId: s.session_id,
    reason: s.reason,
    createdAt: s.created_at,
    tasks,
    taskCount: tasks.length,
  };
});
```

---

## High Severity Issues

### HIGH-1: Missing Validation in save_claude_tasks Transaction

**Location:** `/Users/salman.rana/code/brain-dump/mcp-server/tools/claude-tasks.js` (lines 162-175)

**Severity:** HIGH

**Issue:**

```javascript
insertStmt.run(
  taskId,
  resolvedTicketId,
  task.subject,
  task.description || null,
  task.status,
  task.activeForm || null,
  position,
  JSON.stringify(statusHistory),
  resolvedSessionId,
  existing ? existing.created_at : now,
  now,
  completedAt
);
```

If `existing` is undefined when trying to access `existing.created_at`, this silently uses `now` instead. While this might work, the error is hidden. What if `existing` is not an object? The code assumes structure without validation.

**Hidden Errors:**

- `existing` is not an object (unexpected database result)
- `existing.created_at` is null (corrupted database)
- Type mismatches causing silent coercion

**User Impact:**
Subtle bugs where task timestamps are wrong or metadata gets lost.

**Recommendation:**
Add explicit validation:

```javascript
const createdAtValue = existing?.created_at ?? now;
if (!createdAtValue) {
  throw new Error(`Invalid created_at for existing task ${taskId}: ${createdAtValue}`);
}

insertStmt.run(
  taskId,
  resolvedTicketId,
  task.subject,
  task.description || null,
  task.status,
  task.activeForm || null,
  position,
  JSON.stringify(statusHistory),
  resolvedSessionId,
  createdAtValue,
  now,
  completedAt
);
```

---

### HIGH-2: Unreachable Error Path in getClaudeTasks Server Function

**Location:** `/Users/salman.rana/code/brain-dump/src/api/claude-tasks.ts` (lines 42-47)

**Severity:** HIGH

**Issue:**

```typescript
.handler(async ({ data: ticketId }): Promise<ClaudeTask[]> => {
  const tasks = db
    .select()
    .from(claudeTasks)
    .where(eq(claudeTasks.ticketId, ticketId))
    .orderBy(asc(claudeTasks.position))
    .all();  // ← No error handling around this call

  return tasks.map((task) => ({
    // ...
  }));
});
```

If `db.all()` throws an error (database connection lost, corrupted data, schema mismatch), the error is unhandled and crashes the server function. The TanStack Start framework will handle it, but:

1. No logging of the error
2. No context about what failed
3. Client will get a generic error

**Hidden Errors:**

- Database connection dropped
- SQLite locked error
- Invalid SQL query
- Type casting errors

**User Impact:**
Unclear errors reach the client. The useClaudeTasks hook receives an error message without context about whether it's a database issue or network issue.

**Recommendation:**
Add try-catch with logging:

```typescript
.handler(async ({ data: ticketId }): Promise<ClaudeTask[]> => {
  try {
    const tasks = db
      .select()
      .from(claudeTasks)
      .where(eq(claudeTasks.ticketId, ticketId))
      .orderBy(asc(claudeTasks.position))
      .all();

    return tasks.map((task) => ({
      id: task.id,
      ticketId: task.ticketId,
      subject: task.subject,
      description: task.description,
      status: task.status as ClaudeTaskStatus,
      activeForm: task.activeForm,
      position: task.position,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    }));
  } catch (err) {
    logError("Failed to fetch Claude tasks", {
      ticketId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err; // Let framework handle with proper error response
  }
});
```

---

### HIGH-3: Silent Catch in MCP Tool with Only Logging

**Location:** `/Users/salman.rana/code/brain-dump/mcp-server/tools/claude-tasks.js` (lines 223-229)

**Severity:** HIGH

**Issue:**

```javascript
try {
  const savedTasks = transaction();
  // ... success path
  return {
    content: [{ type: "text", text: `## Claude Tasks Saved...` }],
  };
} catch (err) {
  log.error(`Failed to save Claude tasks: ${err.message}`);
  return {
    content: [{ type: "text", text: `Failed to save tasks: ${err.message}` }],
    isError: true,
  };
}
```

While this includes error messaging (which is good), the error message includes only `err.message` - losing the stack trace and context. If a database corruption or constraint violation occurs, Claude only sees a generic message without knowing:

- Which task failed
- Which database field caused the issue
- Whether it's a schema mismatch or data issue

**Hidden Errors:**

- Database constraint violations (no indication which constraint)
- Type casting errors in transaction
- Data validation failures (no indication which field)
- Concurrent modification issues

**User Impact:**
Claude gets a vague error message like "Failed to save tasks: Error" without context about what went wrong or how to fix it.

**Recommendation:**
Include more context in error response:

```javascript
catch (err) {
  const errorContext = {
    message: err.message,
    code: err.code,
    taskCount: tasks.length,
    ticketId: resolvedTicketId,
  };

  log.error(`Failed to save Claude tasks`, errorContext);

  return {
    content: [{
      type: "text",
      text: err.code === "SQLITE_CONSTRAINT"
        ? `Failed to save tasks: A constraint was violated (possibly duplicate task IDs or invalid ticket). Check that ticket ${resolvedTicketId} exists and task IDs are unique.`
        : `Failed to save ${tasks.length} tasks to ticket ${resolvedTicketId}: ${err.message}`,
    }],
    isError: true,
  };
}
```

---

### HIGH-4: Inadequate Error Message in Ralph State Auto-Detection

**Location:** `/Users/salman.rana/code/brain-dump/mcp-server/tools/claude-tasks.js` (lines 87-98)

**Severity:** HIGH

**Issue:**

```javascript
if (!resolvedTicketId) {
  const ralphState = readRalphState();
  if (ralphState.ticketId) {
    resolvedTicketId = ralphState.ticketId;
    resolvedSessionId = ralphState.sessionId;
    log.info(`Auto-detected ticket ${resolvedTicketId} from Ralph state`);
  } else {
    return {
      content: [
        {
          type: "text",
          text: "No ticketId provided and no active Ralph session found. Provide a ticketId or start ticket work first.",
        },
      ],
      isError: true,
    };
  }
}
```

The error message is generic and doesn't help debug why Ralph state isn't available. If Claude is in a different directory or the state file is corrupted, they get the same message.

**Hidden Errors:**

- Ralph state file doesn't exist (expected if not in Ralph mode)
- Ralph state file is corrupted and can't be read (logs a warning but returns null)
- User ran this from wrong directory
- Ralph state was cleared unexpectedly

**User Impact:**
If Ralph state can't be read due to corruption or permission issues, Claude gets a generic "not found" message and doesn't realize there's a problem with the state file itself.

**Recommendation:**
Provide actionable diagnostics:

```javascript
if (!resolvedTicketId) {
  const ralphState = readRalphState();
  if (ralphState.ticketId) {
    resolvedTicketId = ralphState.ticketId;
    resolvedSessionId = ralphState.sessionId;
    log.info(`Auto-detected ticket ${resolvedTicketId} from Ralph state`);
  } else {
    const stateFileExists = existsSync(join(process.cwd(), ".claude/ralph-state.json"));
    const message = stateFileExists
      ? "Ralph state file exists but ticketId is missing or empty. The state file may be corrupted."
      : "No Ralph session is active. Use start_ticket_work to begin a new ticket.";

    return {
      content: [
        {
          type: "text",
          text: `Cannot auto-detect ticket: ${message}\n\nProvide ticketId explicitly: save_claude_tasks({ticketId: "...", tasks: [...]})`,
        },
      ],
      isError: true,
    };
  }
}
```

---

### HIGH-5: Incomplete Error Handling in React Hook

**Location:** `/Users/salman.rana/code/brain-dump/src/lib/hooks.ts` (lines 1481-1503)

**Severity:** HIGH

**Issue:**

```typescript
export function useClaudeTasks(ticketId: string, options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: ["claudeTasks", ticketId],
    queryFn: async () => {
      const tasks = await getClaudeTasks({ data: ticketId });
      return tasks as ClaudeTask[];
    },
    enabled: Boolean(ticketId),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  return {
    tasks: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null, // ← Only returns message, loses full error
    refetch: query.refetch,
  };
}
```

The error handling loses context by extracting only `.message`. If the error object contains useful details (like error code or metadata), they're discarded.

**Hidden Errors:**

- Full error context is lost
- No distinction between different types of errors
- Stack traces discarded

**User Impact:**
React components can't make intelligent decisions about errors because only the message is available.

**Recommendation:**
Return richer error context:

```typescript
return {
  tasks: query.data ?? [],
  loading: query.isLoading,
  error: query.error
    ? {
        message: query.error.message ?? "Unknown error",
        code: (query.error as any).code,
        isNetworkError: (query.error as any).status === undefined,
      }
    : null,
  refetch: query.refetch,
};
```

Or if keeping the simple interface, at least log the full error:

```typescript
useEffect(() => {
  if (query.error) {
    logError("Failed to fetch Claude tasks", {
      ticketId,
      error: query.error,
    });
  }
}, [query.error, ticketId]);
```

---

### HIGH-6: Missing Validation in ClaudeTasks Component

**Location:** `/Users/salman.rana/code/brain-dump/src/components/tickets/ClaudeTasks.tsx` (lines 48-68)

**Severity:** HIGH

**Issue:**

```typescript
const { tasks, loading, error } = useClaudeTasks(ticketId, { pollingInterval });

// Compute task counts by status
const statusCounts = useMemo(() => {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    { pending: 0, in_progress: 0, completed: 0 } as Record<ClaudeTaskStatus, number>
  );
}, [tasks]);

// Don't render anything if there are no tasks and not loading
if (!loading && totalTasks === 0 && !error) {
  return null;
}
```

The error state is checked at the end (line 66) to decide whether to render an error message, but what if `tasks` contains malformed data? The code assumes `task.status` is always one of the enum values. If the API returns an unexpected status, it silently gets ignored by the reduce function (no error thrown).

**Hidden Errors:**

- Unexpected status value causes silent accumulation bug
- Status type mismatch (string vs enum)
- Task object missing status field (undefined access)

**User Impact:**
Task counts could be wrong if status values are unexpected. User sees incorrect task progress.

**Recommendation:**
Add validation when consuming task data:

```typescript
const statusCounts = useMemo(() => {
  const VALID_STATUSES: ClaudeTaskStatus[] = ["pending", "in_progress", "completed"];

  return tasks.reduce(
    (acc, task) => {
      if (!VALID_STATUSES.includes(task.status)) {
        logError("Invalid task status", {
          ticketId,
          taskId: task.id,
          status: task.status,
        });
        return acc; // Skip this task rather than silently corruption
      }

      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    { pending: 0, in_progress: 0, completed: 0 } as Record<ClaudeTaskStatus, number>
  );
}, [tasks, ticketId]);
```

---

### HIGH-7: Database Locking Not Handled in Node.js Helper

**Location:** `/Users/salman.rana/code/brain-dump/.claude/hooks/save-tasks-to-db.cjs` (lines 61-91)

**Severity:** HIGH

**Issue:**

```javascript
const db = new Database(dbPath);
const tasks = JSON.parse(tasksJson);
const now = new Date().toISOString();

// ... later ...

// Delete existing tasks
db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?").run(ticketId);

// Insert new tasks
const insertStmt = db.prepare(`
  INSERT INTO claude_tasks (...)
  VALUES (?, ?, ...)
`);
```

If the database is locked by another process (main app, another browser tab, concurrent Ralph run), the `run()` call will fail with a "database is locked" error. This error is not caught - it propagates and crashes the process.

**Hidden Errors:**

- Database locked by main app (SQLITE_BUSY)
- Database locked by concurrent Ralph instance
- WAL checkpoint in progress
- Another tool accessing database

**User Impact:**
Tasks fail to save with a cryptic "database is locked" error that crashes the background process silently.

**Recommendation:**
Add retry logic with timeout:

```javascript
function runWithRetry(stmt, params, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return stmt.run(...params);
    } catch (err) {
      if (err.code === "SQLITE_BUSY" && i < maxRetries - 1) {
        // Wait before retrying
        const delay = Math.min(100 * Math.pow(2, i), 1000);
        require("child_process").spawnSync("sleep", [String(delay / 1000)]);
        continue;
      }
      throw err; // Re-throw on final attempt or non-BUSY error
    }
  }
}

// Delete with retry
runWithRetry(db.prepare("DELETE FROM claude_tasks WHERE ticket_id = ?"), [ticketId]);

// Insert with retry
for (let i = 0; i < tasks.length; i++) {
  // ...
  runWithRetry(insertStmt, [taskId, resolvedTicketId, ...]);
}
```

---

## Medium Severity Issues

### MEDIUM-1: Missing Null Check for ticket in MCP Tools

**Location:** `/Users/salman.rana/code/brain-dump/mcp-server/tools/claude-tasks.js` (multiple locations: lines 102-108, 268-275, 384-390, 452-458)

**Severity:** MEDIUM

**Issue:**
Multiple places check if a ticket exists but don't handle all null/undefined cases:

```javascript
const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(resolvedTicketId);
if (!ticket) {
  return {
    content: [
      {
        type: "text",
        text: `Ticket not found: ${resolvedTicketId}. Use list_tickets to see available tickets.`,
      },
    ],
    isError: true,
  };
}

// Later uses: ticket.title without checking if ticket.title is null
text: `## Claude Tasks Saved\n\n**Ticket:** ${ticket.title}...`;
```

While the ticket existence is checked, `ticket.title` could theoretically be null if the schema allows it.

**Hidden Errors:**

- Schema allows NULL title (unlikely but possible)
- Title field missing from query result
- Type mismatch

**User Impact:**
Could display "**Ticket:** null" in response if schema allowed it.

**Recommendation:**
Ensure title is never null:

```javascript
const ticket = db.prepare("SELECT id, title FROM tickets WHERE id = ?").get(resolvedTicketId);
if (!ticket || !ticket.title) {
  return {
    content: [
      {
        type: "text",
        text: `Ticket not found: ${resolvedTicketId}. Use list_tickets to see available tickets.`,
      },
    ],
    isError: true,
  };
}
```

---

### MEDIUM-2: No Validation of JSON in Position Calculations

**Location:** `/Users/salman.rana/code/brain-dump/mcp-server/tools/claude-tasks.js` (lines 138-175)

**Severity:** MEDIUM

**Issue:**

```javascript
for (let i = 0; i < tasks.length; i++) {
  const task = tasks[i];
  const taskId = task.id || randomUUID();
  const position = i + 1; // 1-based position

  // Preserve or initialize status history
  let statusHistory = [];
  const existing = existingTaskMap.get(taskId);
  if (existing?.status_history) {
    try {
      statusHistory = JSON.parse(existing.status_history);
    } catch {  // ← Empty catch block!
      statusHistory = [];
    }
  }
```

The empty catch block for JSON.parse silently discards errors. If status_history is corrupted, the code silently resets it rather than logging the problem.

**Hidden Errors:**

- Corrupted JSON in status_history
- Character encoding issues
- Incomplete writes from previous session

**User Impact:**
Lost task status history without any indication.

**Recommendation:**

```javascript
if (existing?.status_history) {
  try {
    statusHistory = JSON.parse(existing.status_history);
  } catch (err) {
    log.warn(
      `Failed to parse status history for task ${taskId}: ${err.message}. Resetting history.`
    );
    statusHistory = [];
  }
}
```

---

## Summary Table

| Location                        | Issue                                 | Severity | Type                   |
| ------------------------------- | ------------------------------------- | -------- | ---------------------- |
| `capture-claude-tasks.sh:83-89` | Silent background process failure     | CRITICAL | Silent failure         |
| `save-tasks-to-db.cjs:68-74`    | Empty catch block in JSON parse       | CRITICAL | Swallowed error        |
| `claude-tasks.js:484-485`       | Unhandled JSON.parse in snapshots     | CRITICAL | Unhandled exception    |
| `claude-tasks.js:162-175`       | Missing validation on existing object | HIGH     | Data corruption        |
| `claude-tasks.ts:42-47`         | No error handling on db.all()         | HIGH     | Unhandled exception    |
| `claude-tasks.js:223-229`       | Inadequate error context              | HIGH     | Poor messaging         |
| `claude-tasks.js:87-98`         | Generic error message                 | HIGH     | Poor UX                |
| `hooks.ts:1499`                 | Error context lost                    | HIGH     | Lost debugging info    |
| `ClaudeTasks.tsx:48-68`         | No validation of task data            | HIGH     | Silent data corruption |
| `save-tasks-to-db.cjs:88-91`    | No database lock handling             | HIGH     | Database contention    |
| `claude-tasks.js:102-108, etc`  | Potential null title                  | MEDIUM   | Edge case              |
| `claude-tasks.js:145-151`       | Silent JSON.parse error               | MEDIUM   | Lost context           |

---

## Key Principles Violated

1. **"Never silently fail in production code"** (CLAUDE.md) - violated in bash hook and empty catch blocks
2. **"Every error must be logged with context"** - violated in multiple places with lost error context
3. **"Users deserve actionable feedback"** - generic error messages don't help users fix issues
4. **"Catch blocks must be specific"** - empty catch blocks hide unrelated errors

---

## Recommendations for Testing

Before merging, ensure:

1. Test task save with database locked (start multiple concurrent saves)
2. Test with corrupted Ralph state file (invalid JSON)
3. Test with database constraint violations
4. Test when helper script is missing
5. Test with truncated task JSON in database
6. Verify all errors are logged to stderr/logs
7. Verify Claude receives error messages for all failure scenarios
8. Test with invalid ticket IDs
9. Test with very long task lists (position overflow?)
10. Test status history corruption recovery

---

## Files Requiring Changes

1. **`.claude/hooks/capture-claude-tasks.sh`** - Replace background process pattern
2. **`.claude/hooks/save-tasks-to-db.cjs`** - Add error handling, retry logic, validation
3. **`mcp-server/tools/claude-tasks.js`** - Add comprehensive error handling and logging
4. **`src/api/claude-tasks.ts`** - Add try-catch and logging
5. **`src/lib/hooks.ts`** - Return richer error context
6. **`src/components/tickets/ClaudeTasks.tsx`** - Add data validation
