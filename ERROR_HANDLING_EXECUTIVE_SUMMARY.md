# Context Detection Error Handling: Executive Summary

## Overview

A comprehensive error handling audit of the context detection system (mcp-server/lib/context-detection.js and mcp-server/tools/context.js) identified **11 critical issues** across three severity levels.

**Audit Scope**: 3 files, ~500 lines of code
**Issues Found**: 3 CRITICAL, 6 HIGH, 2 MEDIUM
**Common Pattern**: Silent failures where database errors are logged at debug level and execution continues with incorrect results

---

## The Core Problem

The context detection system has a systematic pattern of catching database errors and silently ignoring them:

```javascript
try {
  activeSession = db.prepare(...).get(sessionId);
} catch (err) {
  log.debug(`Session lookup failed: ${err.message}`); // ← Only logs at debug level!
  // Function continues as if nothing happened
  // activeSession remains null, context detection is wrong
}
```

This creates a class of bugs that are nearly impossible to debug:
- User reports "context is wrong"
- Developers check logs and find nothing (debug logs aren't written in production)
- Database failure is completely invisible
- User is left confused, developer has no trace

---

## Impact Assessment

### User Impact
- Users attempting to work on tickets receive wrong context type (admin instead of ticket_work)
- Ralph workflow breaks silently when context detection fails
- Multi-window workflows conflict when context detection for one window fails
- No error message to explain what's wrong

### Developer Impact
- Silent failures are invisible in production logs
- Impossible to debug when issues occur weeks later
- Test suite doesn't cover error cases
- No audit trail of database failures

### System Impact
- Context-dependent tool visibility becomes unreliable
- State enforcement hooks can't enforce state based on wrong context
- Session management becomes confused about active work

---

## Critical Issues (Fix Immediately)

### 1. Silent Database Failures in detectContext()
**Lines**: 38-81 in context-detection.js

Three database queries (session, ticket, project) catch errors and log at debug level only. When these fail:
- Function returns wrong context type
- User is given admin context instead of ticket_work context
- No error is logged in production (debug logs disabled)

**Example Scenario**:
```
Database connection fails temporarily
User is in middle of implementing ticket-1
detectContext() catches error, logs at debug level
Returns admin context instead of ticket_work context
User is confused why they're in admin context
Developers find no error in logs 6 months later
```

**Fix**: Replace with ERROR level logging and return error context objects.

### 2. No Input Validation
**Line**: 28 in context-detection.js

Function accepts any object for `options` without validation. No checks that parameters are strings, not nulls/objects/malicious values.

**Example**:
```javascript
detectContext(db, { ticketId: null }) // Silently produces wrong results
detectContext(db, { ticketId: { exploit: "payload" } }) // Type confusion
detectContext(db, { ticketId: "" }) // Empty string edge cases
```

**Fix**: Add Zod schema validation with clear error messages.

### 3. Unspecific Error Handling
**Line**: 51 in context-detection.js

Catch block includes comment "expected if table doesn't exist" which normalizes a failure that should never happen in normal operation. Conflates initialization problems with runtime errors.

**Problem**:
- Treats initialization failures as expected/normal
- Missing migrations would be completely invisible
- Code could ship with broken initialization
- Can't distinguish between "table missing" and "connection failed"

**Fix**: Check specific error conditions and handle them differently.

---

## High Severity Issues (Fix Before Merging)

### 4. Generic Error Messages in MCP Tools
All four MCP tools return generic error text like "Failed to detect context: [error message]" without telling users how to fix it.

**User sees**:
```
Failed to detect context: SQLITE_CANTOPEN
```

**User thinks**: ??? What does this mean? What do I do?

**Developer sees**: Nothing in logs (debug level logging only)

**Fix**: Add actionable error messages with recovery steps.

### 5. detectAllActiveContexts() Returns Empty Array on Error
Returns `[]` whether there are genuinely no contexts or whether a database error prevented checking. Impossible for caller to distinguish.

**Problem**: Multi-window workflows don't know if they're alone or if other windows failed to report.

**Fix**: Return structured result object with `success` flag.

### 6. Missing Validation in Utility Functions
`isContextRelevant()` and `getContextSummary()` don't validate that context objects have expected properties. Missing properties silently produce wrong results.

**Fix**: Add property validation with Zod.

### 7. Error Handling Code Duplication
All four MCP tools have identical try-catch patterns. Hard to maintain consistent error handling.

**Fix**: Extract reusable `withErrorHandling()` helper.

---

## Medium Severity Issues (Fix in Follow-up)

### 8. Test Database Missing Table
Test setup doesn't create `ticket_comments` table, but test index references it. Tests don't catch this problem.

### 9. Test Helpers Don't Validate Success
Helper functions like `insertTestSession()` never check if the insert succeeded. Tests could pass with incomplete data setup.

### 10. Missing Error Context in Logs
Error logs don't include the input parameters that caused the failure. Makes debugging harder.

### 11. Invalid Status Not Detected
Function doesn't validate that ticket status is one of known values. Returns admin context silently if status is corrupted.

---

## Error Handling Anti-Patterns Found

| Pattern | Example | Problem |
| --- | --- | --- |
| **Silent catch** | `catch (err) { log.debug(...) }` | Errors invisible in production |
| **Debug-level logging** | `log.debug()` called in error path | Disabled in production by default |
| **Generic error text** | `Failed to detect context` | No guidance for users |
| **Continue on error** | Function returns wrong result | User gets incorrect behavior |
| **No input validation** | Accepts any object | Type confusion and injection risks |
| **Unspecific exceptions** | Catches all errors identically | Can't distinguish types of failures |
| **Misleading comments** | "expected if table doesn't exist" | Normalizes failures that shouldn't happen |
| **Distinguish by absence** | Empty array = no contexts or error | Caller can't tell which |

---

## Recommended Fix Priority

### Phase 1: CRITICAL (Do Now)
1. Replace silent catch blocks in `detectContext()`
2. Add input validation with Zod
3. Distinguish database initialization from runtime errors

**Effort**: ~2-3 hours
**Impact**: Prevents user-facing silent failures

### Phase 2: HIGH (Before Merge)
4. Enhance MCP tool error messages
5. Update `detectAllActiveContexts()` to return result objects
6. Add validation to utility functions
7. Extract error handling helper

**Effort**: ~3-4 hours
**Impact**: Users get actionable error messages

### Phase 3: MEDIUM (Follow-up PR)
8. Add missing test table
9. Add error checking to test helpers
10. Include parameters in error logs
11. Validate ticket status values

**Effort**: ~1-2 hours
**Impact**: Test reliability and debuggability

---

## Files Created

### 1. ERROR_HANDLING_AUDIT_REPORT.md
Full detailed audit with:
- All 11 issues explained in depth
- Code snippets showing problems
- Example scenarios demonstrating impact
- Specific recommendations for each issue
- Summary of patterns across codebase

### 2. REMEDIATION_GUIDE.md
Step-by-step fix instructions with:
- Before/after code comparison
- Complete replacement code ready to use
- How to update each affected function
- Testing guidance
- Priority summary table

### 3. ERROR_HANDLING_EXECUTIVE_SUMMARY.md
This document - high-level overview for quick reference

---

## Key Metrics

| Metric | Value |
| --- | --- |
| Files reviewed | 3 |
| Lines of code audited | ~500 |
| Issues found | 11 |
| CRITICAL issues | 3 |
| HIGH issues | 6 |
| MEDIUM issues | 2 |
| Silent failure instances | 4+ locations |
| Unvalidated inputs | 2 functions |
| Error handling duplication | 4 tools |
| Test coverage gaps | 3+ scenarios |

---

## Success Criteria After Fixes

- [ ] All database errors are logged at ERROR level, not DEBUG
- [ ] No silent failures - all errors are surfaced to users
- [ ] Error messages include actionable recovery steps
- [ ] All public functions validate their inputs
- [ ] Test coverage includes error cases
- [ ] Input parameters included in error logs
- [ ] No catch-all exception handlers
- [ ] Code duplication in error handling eliminated

---

## Questions to Ask Before Starting Fixes

1. **Input Validation**: Should we use Zod for all public functions or just entry points?
2. **Error Context**: Should error contexts be returned as-is or always wrapped in standard response format?
3. **Logging Level**: Should we log all database errors at ERROR or WARN level?
4. **Tests**: Should we add tests for all error cases identified in this audit?
5. **Breaking Changes**: Can we change the return type of `detectAllActiveContexts()`?

---

## Related Issues

Check for similar patterns in:
- All other MCP tools (tickets, projects, etc.)
- Server functions in src/api/
- Any code using better-sqlite3
- Any try-catch blocks that log at debug level only

---

## References

- **Full Audit**: See ERROR_HANDLING_AUDIT_REPORT.md for detailed findings
- **Implementation**: See REMEDIATION_GUIDE.md for specific code fixes
- **Project Standards**: See CLAUDE.md for project error handling conventions
