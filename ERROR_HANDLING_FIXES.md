# Error Handling Fixes - Implementation Guide

This document provides concrete, copy-paste fixes for the critical error handling issues identified in the audit.

---

## FIX #1: Export Compliance Logs - Silent Audit Failure

**File:** `mcp-server/tools/conversations.ts`
**Lines:** 666-683
**Severity:** CRITICAL

### Current Code (Broken)

```typescript
} catch (error) {
  // Log failed export attempt
  try {
    db.prepare(`
      INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(exportId, "system", "compliance_export", sessionId || projectId || "date_range", "export", `error: ${error.message}`, exportedAt);
  } catch {
    // Ignore audit logging errors
  }

  log.error("Failed to export compliance logs", error);
  return {
    content: [{ type: "text", text: `Failed to export compliance logs: ${error.message}` }],
    isError: true,
  };
}
```

### Fixed Code

```typescript
} catch (error) {
  // Log failed export attempt - if THIS fails too, we need to know
  let auditLoggingFailed = false;
  let auditError: Error | null = null;

  try {
    db.prepare(`
      INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      exportId,
      "system",
      "compliance_export",
      sessionId || projectId || "date_range",
      "export",
      `error: ${error.message}`,
      exportedAt
    );
  } catch (auditErr) {
    auditLoggingFailed = true;
    auditError = auditErr instanceof Error ? auditErr : new Error(String(auditErr));
    // Log this critical failure to both stderr and log file
    log.error(
      "CRITICAL: Failed to log compliance export failure to audit table",
      auditError
    );
  }

  // Always log the original error
  log.error("Failed to export compliance logs", error instanceof Error ? error : new Error(String(error)));

  // Return response indicating both issues if audit logging also failed
  const errorMessage = auditLoggingFailed
    ? `Failed to export compliance logs: ${error instanceof Error ? error.message : String(error)}\n\nCRITICAL: Also failed to record this failure in audit trail: ${auditError?.message}`
    : `Failed to export compliance logs: ${error instanceof Error ? error.message : String(error)}`;

  return {
    content: [{ type: "text", text: errorMessage }],
    isError: true,
  };
}
```

---

## FIX #2: Archive Old Sessions - Silent Audit Failure

**File:** `mcp-server/tools/conversations.ts`
**Lines:** 876-892
**Severity:** CRITICAL

### Current Code (Broken)

```typescript
} catch (error) {
  // Log failed archive attempt
  try {
    db.prepare(`
      INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(archiveId, "system", "retention_cleanup", "error", confirm ? "delete" : "dry_run", `error: ${error.message}`, archivedAt);
  } catch {
    // Ignore audit logging errors
  }

  log.error("Failed to archive old sessions", error);
  return {
    content: [{ type: "text", text: `Failed to archive sessions: ${error.message}` }],
    isError: true,
  };
}
```

### Fixed Code

```typescript
} catch (error) {
  // Log failed archive attempt - with explicit error handling
  let auditFailed = false;
  let auditError: Error | null = null;

  try {
    db.prepare(`
      INSERT INTO audit_log_access (id, accessor_id, target_type, target_id, action, result, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      archiveId,
      "system",
      "retention_cleanup",
      "error",
      confirm ? "delete" : "dry_run",
      `error: ${error instanceof Error ? error.message : String(error)}`,
      archivedAt
    );
  } catch (auditErr) {
    auditFailed = true;
    auditError = auditErr instanceof Error ? auditErr : new Error(String(auditErr));
    log.error(
      "CRITICAL: Failed to record retention cleanup failure in audit trail",
      auditError
    );
  }

  const errorMsg = error instanceof Error ? error.message : String(error);
  log.error("Failed to archive old sessions", error instanceof Error ? error : new Error(errorMsg));

  const userMessage = auditFailed
    ? `Failed to archive sessions: ${errorMsg}\n\nCRITICAL: Also failed to record this failure: ${auditError?.message}`
    : `Failed to archive sessions: ${errorMsg}`;

  return {
    content: [{ type: "text", text: userMessage }],
    isError: true,
  };
}
```

---

## FIX #3: Lock File Cleanup at Exit

**File:** `mcp-server/index.ts`
**Lines:** 99-110
**Severity:** CRITICAL

### Current Code (Broken)

```typescript
process.on("exit", () => {
  const lockInfo = readLockFile();
  if (lockInfo && lockInfo.pid === process.pid) {
    try {
      unlinkSync(getLockFilePath());
    } catch (err) {
      console.error(
        `[brain-dump] Failed to clean lock file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
});
```

### Fixed Code

```typescript
process.on("exit", () => {
  const lockInfo = readLockFile();
  if (lockInfo && lockInfo.pid === process.pid) {
    try {
      unlinkSync(getLockFilePath());
      log.info("Lock file cleaned up successfully at exit");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as any)?.code || "UNKNOWN";

      // Log with appropriate level based on error type
      if (code === "ENOENT") {
        log.debug("Lock file already removed");
      } else if (code === "EACCES") {
        log.error(
          `Failed to clean lock file: Permission denied. This may cause 'database locked' errors on next run.`,
          err
        );
      } else if (code === "EBUSY") {
        log.warn(
          `Lock file in use during cleanup. May cause 'database locked' errors on next run.`
        );
      } else {
        log.error(
          `Failed to clean lock file: ${message}. This may cause 'database locked' errors on next run.`,
          err
        );
      }
    }
  }
});
```

---

## FIX #4: Backup Maintenance at Startup

**File:** `mcp-server/index.ts`
**Lines:** 58-68
**Severity:** CRITICAL

### Current Code (Broken)

```typescript
// Perform daily backup maintenance
try {
  const backupResult = performDailyBackupSync(actualDbPath);
  if (backupResult.backup.created) log.info(backupResult.backup.message);
  if (backupResult.cleanup.deleted > 0) log.info(backupResult.cleanup.message);
} catch (backupError) {
  log.error(
    "Backup maintenance failed",
    backupError instanceof Error ? backupError : new Error(String(backupError))
  );
}
```

### Fixed Code

```typescript
// Perform daily backup maintenance
// This is critical for GDPR compliance - consider failing hard if backups are broken
let backupStatusOk = true;
try {
  const backupResult = performDailyBackupSync(actualDbPath);
  if (backupResult.backup.created) {
    log.info(backupResult.backup.message);
  } else {
    log.warn("Daily backup was not created (may be disabled or already exists)");
  }
  if (backupResult.cleanup.deleted > 0) {
    log.info(backupResult.cleanup.message);
  }
} catch (backupError) {
  backupStatusOk = false;
  const message = backupError instanceof Error ? backupError.message : String(backupError);
  log.error(
    "CRITICAL: Backup maintenance failed during startup. Data may not be protected.",
    backupError instanceof Error ? backupError : new Error(message)
  );

  // In production, consider failing hard:
  // process.exit(1);

  // Or at minimum, log a warning that will be visible on startup
  console.error(
    "[brain-dump] WARNING: Backup maintenance failed. Your data may not be backed up."
  );
}

if (!backupStatusOk) {
  log.warn(
    "Proceeding with startup despite backup failure. " +
    "Please check your disk space and backup configuration."
  );
}
```

---

## FIX #5: Broad Exception Catching in Conversation Tools

**File:** `mcp-server/tools/conversations.ts`
**Examples:** Lines 122-128, 239-245, 328-334, 456-462

### Current Code (Broken)

```typescript
try {
  db.prepare(`...`).run(...);
  // more operations
} catch (error) {
  log.error("Failed to log conversation message", error);
  return {
    content: [{ type: "text", text: `Failed to log message: ${error.message}` }],
    isError: true,
  };
}
```

### Fixed Code - Create a Helper Function

Add this to a shared file (e.g., `mcp-server/lib/error-handling.ts`):

```typescript
/**
 * Classify and handle database errors with specific logging and user messaging.
 */
export function classifyDatabaseError(
  error: unknown,
  context: string
): { isRetryable: boolean; userMessage: string; logLevel: "warn" | "error" } {
  if (!(error instanceof Error)) {
    return {
      isRetryable: false,
      userMessage: `${context}: ${String(error)}`,
      logLevel: "error",
    };
  }

  const message = error.message;

  // Check for specific error types
  if (message.includes("FOREIGN KEY constraint")) {
    return {
      isRetryable: false,
      userMessage: `${context}: Data integrity error (missing reference). Contact support.`,
      logLevel: "error",
    };
  }

  if (message.includes("disk I/O error")) {
    return {
      isRetryable: true,
      userMessage: `${context}: Disk error. Check storage and retry.`,
      logLevel: "error",
    };
  }

  if (message.includes("database is locked")) {
    return {
      isRetryable: true,
      userMessage: `${context}: Database busy. Try again in a moment.`,
      logLevel: "warn",
    };
  }

  if (message.includes("READONLY")) {
    return {
      isRetryable: false,
      userMessage: `${context}: Database is read-only. Check file permissions.`,
      logLevel: "error",
    };
  }

  if (message.includes("not a valid")) {
    return {
      isRetryable: false,
      userMessage: `${context}: Invalid data format.`,
      logLevel: "error",
    };
  }

  return {
    isRetryable: false,
    userMessage: `${context}: ${message}`,
    logLevel: "error",
  };
}
```

### Using the Helper

```typescript
try {
  db.prepare(`...`).run(...);
  log.info("Message logged successfully");
} catch (error) {
  const { isRetryable, userMessage, logLevel } = classifyDatabaseError(
    error,
    "Failed to log conversation message"
  );

  if (logLevel === "error") {
    log.error(userMessage, error instanceof Error ? error : new Error(String(error)));
  } else {
    log.warn(userMessage, error instanceof Error ? error : new Error(String(error)));
  }

  return {
    content: [{
      type: "text",
      text: userMessage + (isRetryable ? " Please try again." : ""),
    }],
    isError: true,
  };
}
```

---

## FIX #6: Missing Error Context in Telemetry

**File:** `mcp-server/tools/telemetry.ts`
**Lines:** 218-229
**Severity:** HIGH

### Current Code (Broken)

```typescript
} catch (err) {
  log.error(`Failed to start telemetry session: ${err.message}`);
  return {
    content: [
      {
        type: "text",
        text: `Failed to start telemetry session: ${err.message}`,
      },
    ],
    isError: true,
  };
}
```

### Fixed Code

```typescript
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err);
  let userMessage = "Failed to start telemetry session";

  // Provide context based on error type
  if (errorMsg.includes("CANTOPEN") || errorMsg.includes("unable to open")) {
    userMessage +=
      ": Database file not found or inaccessible. Check file permissions and disk space.";
  } else if (
    errorMsg.includes("CORRUPT") ||
    errorMsg.includes("database disk image malformed")
  ) {
    userMessage +=
      ": Database appears corrupted. Run 'pnpm brain-dump check --full' to diagnose.";
  } else if (errorMsg.includes("READONLY") || errorMsg.includes("attempt to write a readonly database")) {
    userMessage +=
      ": Database is read-only. Check file permissions for the data directory.";
  } else if (errorMsg.includes("NOLCK")) {
    userMessage += ": File system does not support locking. Check your storage.";
  } else {
    userMessage += `: ${errorMsg}`;
  }

  log.error(
    `Failed to start telemetry session: ${errorMsg}`,
    err instanceof Error ? err : new Error(errorMsg)
  );

  return {
    content: [{ type: "text", text: userMessage }],
    isError: true,
  };
}
```

---

## FIX #7: Database Migration Failure Propagation

**File:** `mcp-server/lib/database.ts`
**Lines:** 119-122 (in migrateFromLegacySync) and call site in initDatabase
**Severity:** HIGH

### Current Code (Broken) - migrateFromLegacySync

```typescript
} catch (error) {
  log.error("Migration failed", error);
  return { success: false, migrated: false, message: `Migration failed: ${error.message}` };
}
```

### Fixed Code - Update Return Type

```typescript
export interface MigrationResult {
  success: boolean;
  migrated: boolean;
  message: string;
  shouldBlockStartup?: boolean;  // New field
}

export function migrateFromLegacySync(): MigrationResult {
  // ... existing code ...

  try {
    // ... migration code ...
    return { success: true, migrated: true, message: "Migration complete" };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error("Migration failed - database may be in partial migration state", error);

    return {
      success: false,
      migrated: false,
      message: `Migration failed: ${errorMsg}. Your data in ~/.brain-dump has been preserved.`,
      shouldBlockStartup: true,  // Critical - don't proceed
    };
  }
}
```

### Fixed Code - Call Site in initDatabase

```typescript
export function initDatabase(dbPath?: string) {
  ensureDirectoriesSync();

  // Run legacy migration if needed
  const migrationResult = migrateFromLegacySync();
  if (!migrationResult.success && migrationResult.shouldBlockStartup) {
    throw new Error(
      `Cannot start MCP server: ${migrationResult.message}`
    );
  }
  if (migrationResult.migrated) {
    log.info(migrationResult.message);
  }

  // ... rest of initDatabase ...
}
```

---

## FIX #8: JSON Parsing Without Error Handling

**File:** `mcp-server/tools/conversations.ts`
**Lines:** 581, 600
**Severity:** HIGH

### Current Code (Broken)

```typescript
// Line 581
toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null,

// Line 600
sessionMetadata: session.session_metadata ? JSON.parse(session.session_metadata) : null,
```

### Fixed Code

```typescript
// Create a safe JSON parser function
function safeJsonParse<T = unknown>(
  jsonString: string | null | undefined,
  fieldName: string,
  sessionId: string,
  defaultValue: T
): T {
  if (!jsonString) return defaultValue;

  try {
    return JSON.parse(jsonString);
  } catch (parseErr) {
    const errorMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    log.warn(
      `Failed to parse ${fieldName} for session ${sessionId}: ${errorMsg}. Using default value.`,
      parseErr
    );
    // Return marked as corrupted so auditors know
    return {
      __corrupted: true,
      __field: fieldName,
      __error: errorMsg,
      __originalLength: jsonString.length,
    } as unknown as T;
  }
}

// Usage in export
const processedMessages = messages.map((msg) => {
  totalMessages++;

  // ... other code ...

  return {
    id: msg.id,
    role: msg.role,
    content: includeContent ? msg.content : "[REDACTED]",
    contentHash: msg.content_hash,
    integrityValid,
    toolCalls: safeJsonParse(msg.tool_calls, "tool_calls", session.id, null),
    tokenCount: msg.token_count,
    modelId: msg.model_id,
    sequenceNumber: msg.sequence_number,
    containsPotentialSecrets: !!msg.contains_potential_secrets,
    createdAt: msg.created_at,
  };
});

// And for session metadata
const exportedSessions = sessions.map((session) => {
  return {
    id: session.id,
    projectId: session.project_id,
    projectName: session.project_name,
    ticketId: session.ticket_id,
    ticketTitle: session.ticket_title,
    userId: session.user_id,
    environment: session.environment,
    dataClassification: session.data_classification,
    legalHold: !!session.legal_hold,
    sessionMetadata: safeJsonParse(
      session.session_metadata,
      "session_metadata",
      session.id,
      null
    ),
    startedAt: session.started_at,
    endedAt: session.ended_at,
    messages: processedMessages,
  };
});
```

---

## FIX #9: Data Truncation Without Logging

**File:** `mcp-server/tools/telemetry.ts`
**Line:** 389
**Severity:** HIGH

### Current Code (Broken)

```typescript
...(result && { resultSummary: result.substring(0, 500) }),
```

### Fixed Code

```typescript
// Build event data with truncation tracking
const MAX_RESULT_LENGTH = 500;
let resultSummary = null;
let resultWasTruncated = false;

if (result) {
  if (result.length > MAX_RESULT_LENGTH) {
    resultSummary = result.substring(0, MAX_RESULT_LENGTH);
    resultWasTruncated = true;
    log.debug(
      `Tool result truncated from ${result.length} to ${MAX_RESULT_LENGTH} chars for session ${sessionId}`
    );
  } else {
    resultSummary = result;
  }
}

const eventData = {
  toolName,
  ...(result && {
    resultSummary,
    resultLength: result.length,
    resultWasTruncated,
  }),
  ...(params && { paramsSummary: summarizeParams(params) }),
  ...(success !== undefined && { success }),
  ...(error && { error }),
};
```

---

## FIX #10: Stale Lock Cleanup Failure

**File:** `mcp-server/lib/lock.ts`
**Lines:** 93-98
**Severity:** HIGH

### Current Code (Broken)

```typescript
// Clean up stale locks
if (check.isStale) {
  try {
    unlinkSync(lockPath);
    log.info("Cleaned up stale lock file");
  } catch (err) {
    log.warn("Failed to clean up stale lock file, continuing anyway", err);
  }
}
```

### Fixed Code

```typescript
// Clean up stale locks
if (check.isStale) {
  try {
    unlinkSync(lockPath);
    log.info(
      `Cleaned up stale lock file from ${check.lockInfo?.type} (PID ${check.lockInfo?.pid})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code || "UNKNOWN";

    // Different handling based on error type
    if (code === "ENOENT") {
      log.debug("Stale lock file already removed");
    } else if (code === "EACCES") {
      log.error(
        `Cannot remove stale lock file: Permission denied. ` +
        `You may see "database locked" errors. Run: rm ${lockPath}`,
        err
      );
      // Don't continue - this is a real problem
      return { acquired: false, message: "Cannot clean up stale lock (permission denied)", lockInfo: null };
    } else {
      log.error(
        `Failed to clean up stale lock file: ${message}. ` +
        `Continuing, but may see "database locked" errors.`,
        err
      );
      // Could optionally fail here instead of continuing
    }
  }
}
```

---

## FIX #11: Invalid Lock File Logging

**File:** `mcp-server/lib/lock.ts`
**Lines:** 42-45
**Severity:** HIGH

### Current Code (Broken)

```typescript
try {
  const content = readFileSync(lockPath, "utf-8");
  const lockInfo = JSON.parse(content);
  if (
    typeof lockInfo.pid !== "number" ||
    typeof lockInfo.startedAt !== "string" ||
    !["mcp-server", "cli", "vite"].includes(lockInfo.type)
  ) {
    return null;
  }
  return lockInfo;
} catch (err) {
  log.warn("Could not read lock file, treating as no lock", err);
  return null;
}
```

### Fixed Code

```typescript
try {
  const content = readFileSync(lockPath, "utf-8");
  let lockInfo: any;

  try {
    lockInfo = JSON.parse(content);
  } catch (parseErr) {
    log.warn(
      `Invalid JSON in lock file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. ` +
      "Treating as stale and will attempt cleanup.",
      parseErr
    );
    return null;
  }

  // Validate each field with specific logging
  if (typeof lockInfo.pid !== "number") {
    log.warn(
      `Invalid lock file: 'pid' field is ${typeof lockInfo.pid}, expected number. ` +
      `Lock file may be corrupted. Content: ${content.substring(0, 200)}`
    );
    return null;
  }

  if (typeof lockInfo.startedAt !== "string") {
    log.warn(
      `Invalid lock file: 'startedAt' field is ${typeof lockInfo.startedAt}, expected string. ` +
      `Lock file may be corrupted.`
    );
    return null;
  }

  if (!["mcp-server", "cli", "vite"].includes(lockInfo.type)) {
    log.warn(
      `Invalid lock file: 'type' field is "${lockInfo.type}", ` +
      `expected one of [mcp-server, cli, vite]. Lock file may be corrupted.`
    );
    return null;
  }

  return lockInfo;
} catch (err) {
  if (err instanceof Error) {
    if (err.code === "ENOENT") {
      // File doesn't exist - this is normal, not an error
      return null;
    } else if (err.code === "EACCES") {
      log.error(
        `No permission to read lock file: ${getLockFilePath()}. ` +
        `You may see 'database locked' errors.`,
        err
      );
    } else {
      log.warn(`Failed to read lock file: ${err.message}`, err);
    }
  } else {
    log.warn(`Failed to read lock file: ${String(err)}`);
  }
  return null;
}
```

---

## TESTING RECOMMENDATIONS

### Unit Tests to Add

1. **Test audit logging failures are NOT swallowed:**
```typescript
it("should report when audit logging fails during export", async () => {
  // Mock db.prepare to fail on audit insert
  const dbSpy = jest.spyOn(db, 'prepare').mockImplementation((sql) => {
    if (sql.includes('audit_log_access')) {
      throw new Error("Audit table write failed");
    }
    return originalPrepare(sql);
  });

  const result = await exportComplianceLogs(...);

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("CRITICAL");
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining("CRITICAL"),
    expect.any(Error)
  );
});
```

2. **Test lock file cleanup errors are logged:**
```typescript
it("should log lock file cleanup failures with context", () => {
  // Mock unlinkSync to fail
  jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
    throw new Error("EACCES: permission denied");
  });

  // Trigger exit handler
  process.emit('exit');

  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining("Permission denied"),
    expect.any(Error)
  );
});
```

3. **Test backup failure is reported:**
```typescript
it("should log backup failures at startup", async () => {
  jest.spyOn(backup, 'performDailyBackupSync').mockImplementation(() => {
    throw new Error("Disk full");
  });

  expect(() => initDatabase()).toThrow("Backup maintenance failed");
});
```

---

## Deployment Checklist

Before deploying fixes:

- [ ] All catch blocks have specific error type handling
- [ ] All database operations have retry logic where applicable
- [ ] All compliance logging is not in a catch block without error handling
- [ ] All startup failures block the server
- [ ] All error messages include actionable guidance
- [ ] Lock file cleanup is thoroughly tested
- [ ] Backup failures prevent startup
- [ ] Error logs include full error context for debugging

