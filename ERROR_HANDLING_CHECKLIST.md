# Context Detection Error Handling: Fix Checklist

Use this checklist to track progress on fixing the 11 identified issues.

---

## CRITICAL Issues - Fix First

### Issue #1: Silent Database Failures in detectContext()
- **File**: `mcp-server/lib/context-detection.js`
- **Lines**: 38-53, 56-69, 73-81
- **What to do**: Replace three silent catch blocks with proper error handling
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Session lookup: Replace `log.debug()` with ERROR level + error context
- [ ] Ticket lookup: Replace `log.debug()` with ERROR level + error context
- [ ] Project lookup: Replace `log.debug()` with ERROR level + error context
- [ ] Add `detectionErrors` array to track failures
- [ ] Return error context when errors occur
- [ ] Test that invalid session ID returns error, not admin context

**Code Changes**:
```
Lines to replace: 39-52, 57-68, 74-80
Additions: detectionErrors array, error handling logic
Expected result: Errors logged at ERROR level, returned to caller
```

---

### Issue #2: No Input Validation in detectContext()
- **File**: `mcp-server/lib/context-detection.js`
- **Line**: 28
- **What to do**: Add Zod schema validation to function start
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Import Zod at top of file: `import { z } from "zod";`
- [ ] Create `DetectContextOptionsSchema` with string validation
- [ ] Validate options before using them
- [ ] Return error context if validation fails
- [ ] Test with invalid inputs (null, objects, numbers)

**Code Changes**:
```
Add before line 28:
- Zod schema definition
- Validation try-catch block
Lines to replace: 29-30 (destructuring)
Expected result: Invalid inputs produce error responses
```

---

### Issue #3: Unspecific Database Error Handling
- **File**: `mcp-server/lib/context-detection.js`
- **Line**: 50-51
- **What to do**: Distinguish "table doesn't exist" errors from other failures
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Check if error message includes "no such table"
- [ ] If initialization error: Return FATAL error with recovery step
- [ ] If other error: Log at ERROR level and add to detectionErrors
- [ ] Test with missing conversation_sessions table
- [ ] Test with database connection failure

**Code Changes**:
```
Lines to replace: 50-52
Add: Conditional error handling based on error type
Expected result: Initialization errors distinguished from runtime errors
```

---

## HIGH Issues - Fix Before Merging

### Issue #4: Generic MCP Tool Error Messages
- **File**: `mcp-server/tools/context.js`
- **Lines**: 54-78, 94-129, 152-177, 207-234
- **What to do**: Add actionable error messages to all four tools
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Create `formatContextDetectionError()` helper function
- [ ] Create `withErrorHandling()` wrapper function
- [ ] Update `detect_context` tool to use wrapper
- [ ] Update `detect_all_contexts` tool to use wrapper
- [ ] Update `get_context_summary` tool to use wrapper
- [ ] Update `is_context_relevant` tool to use wrapper
- [ ] Test error messages are helpful (not generic)
- [ ] Test that parameters are included in logs

**Code Changes**:
```
Add: Helper functions (formatContextDetectionError, withErrorHandling)
Replace: All four tool catch blocks
Lines affected: ~180 lines of code
Expected result: Consistent error handling across all tools
```

---

### Issue #5: detectAllActiveContexts() Returns Empty on Error
- **File**: `mcp-server/lib/context-detection.js`
- **Lines**: 194-220
- **What to do**: Return structured result object with success flag
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Change return type to object with `{success, contexts, count, error, reason}`
- [ ] Return `{success: false}` when query fails
- [ ] Return `{success: true, count: 0}` when no active sessions
- [ ] Return `{success: true, count: N}` when contexts found
- [ ] Update MCP tool to check `result.success` flag
- [ ] Test that empty list and error are distinguishable

**Code Changes**:
```
Lines to replace: 195-220
Add: Result object structure
Expected result: Callers can distinguish "no contexts" from "error"
```

---

### Issue #6: Missing Validation in Utility Functions
- **File**: `mcp-server/lib/context-detection.js`
- **Lines**: 230-246, 255-269
- **What to do**: Add property validation to isContextRelevant and getContextSummary
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Update `isContextRelevant()` to validate context.type exists
- [ ] Don't silently default type to "idle"
- [ ] Log warning if context is malformed
- [ ] Update `getContextSummary()` to validate properties exist
- [ ] Handle undefined properties gracefully
- [ ] Test with malformed context objects

**Code Changes**:
```
Lines to replace: 230-246, 255-269
Add: Type checking and property validation
Expected result: No silent defaults, logs warn on malformed input
```

---

### Issue #7: Error Handling Code Duplication in Tools
- **File**: `mcp-server/tools/context.js`
- **All tool functions**: Lines 54-78, 94-129, 152-177, 207-234
- **What to do**: Extract reusable error handling helper
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Create `withErrorHandling(toolName, params, operation)` helper
- [ ] Create `formatContextDetectionError(context)` helper
- [ ] Replace all four tool catch blocks with helper calls
- [ ] Ensure consistent error message format
- [ ] Test that all tools use helper correctly

**Code Changes**:
```
Add: Two helper functions
Lines to replace: catch blocks in all 4 tools
Expected result: Single source of truth for error handling
```

---

## MEDIUM Issues - Fix in Follow-up

### Issue #8: Missing Test Database Table
- **File**: `mcp-server/__tests__/context-detection.test.js`
- **Lines**: 31-96
- **What to do**: Add ticket_comments table to test database
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Add `CREATE TABLE ticket_comments` statement
- [ ] Include all required columns: id, ticket_id, type, content, created_at
- [ ] Add FOREIGN KEY reference to tickets table
- [ ] Test database creation succeeds

**Code Changes**:
```
Add after line 77 (after tickets table):
CREATE TABLE ticket_comments (...)
Expected result: Index on ticket_comments creates successfully
```

---

### Issue #9: Test Helpers Don't Validate Success
- **File**: `mcp-server/__tests__/context-detection.test.js`
- **Lines**: 103-140
- **What to do**: Add error checking to insertTestProject/Ticket/Session
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Update `insertTestProject()` to check `result.changes === 1`
- [ ] Update `insertTestTicket()` to check `result.changes === 1`
- [ ] Update `insertTestSession()` to check `result.changes === 1`
- [ ] Throw descriptive error if insert fails
- [ ] Test helpers now catch setup failures

**Code Changes**:
```
Lines to replace: 105-108, 119-123, 134-138
Add: Error checking on result object
Expected result: Tests fail fast if data setup fails
```

---

### Issue #10: Missing Error Context in Logs
- **File**: `mcp-server/tools/context.js`
- **All tool functions**: Lines 67, 118, 166, 223
- **What to do**: Include input parameters in error log messages
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Update detect_context error log to include ticketId, projectId, sessionId
- [ ] Update detect_all_contexts error log with context
- [ ] Update get_context_summary error log with parameters
- [ ] Update is_context_relevant error log with toolCategory and ticket info
- [ ] Test logs include parameter values

**Code Changes**:
```
Lines to replace: 67, 118, 166, 223
Add: Parameter context to log message strings
Expected result: Error logs show WHICH ticket/project/session failed
```

---

### Issue #11: Invalid Status Not Detected
- **File**: `mcp-server/lib/context-detection.js`
- **Lines**: 84-168
- **What to do**: Validate ticket status is one of known values
- **Status**: [ ] Not Started [ ] In Progress [ ] Completed [ ] Tested

**Details**:
- [ ] Define array of validStatuses at start of status matching
- [ ] Check `validStatuses.includes(status)` before matching
- [ ] Return error context if status is invalid
- [ ] Log warning about invalid status
- [ ] Test with corrupted status value in database

**Code Changes**:
```
Add before line 84:
const validStatuses = [...]
Then add validation check

Expected result: Invalid statuses are caught and reported
```

---

## Testing Checklist

After implementing fixes, run these tests:

### Unit Tests
- [ ] `pnpm test context-detection.test.js` - All tests pass
- [ ] Add test for invalid input validation
- [ ] Add test for database error handling
- [ ] Add test for malformed context objects
- [ ] Add test for empty session list vs database error

### Type Checking
- [ ] `pnpm type-check` - No TypeScript errors
- [ ] All function signatures have proper types
- [ ] Error context object types are defined

### Linting
- [ ] `pnpm lint` - No ESLint errors
- [ ] Error handling follows project patterns
- [ ] No unused variables or imports

### Manual Testing
- [ ] Test detect_context with valid ticket
- [ ] Test detect_context with invalid ticket ID
- [ ] Test detect_context with null parameters
- [ ] Test detect_all_contexts with no sessions
- [ ] Test detect_all_contexts with database error
- [ ] Verify error messages are helpful in MCP tools
- [ ] Check logs include parameter context

### Integration Testing
- [ ] Start Ralph with context detection working
- [ ] Verify context detection in multi-window scenario
- [ ] Check that tool visibility changes based on context

---

## Code Review Points

When reviewing fixes, check for:

- [ ] No silent catch blocks (all errors logged at ERROR level)
- [ ] All user-facing errors have actionable messages
- [ ] Input validation uses Zod schemas
- [ ] Error responses follow MCP standard format
- [ ] No generic error text ("failed", "error occurred")
- [ ] Specific error types are distinguished
- [ ] Database initialization errors handled separately
- [ ] Test coverage includes error cases
- [ ] Helper functions reduce code duplication
- [ ] Logs include context for debugging

---

## Files to Modify

1. **mcp-server/lib/context-detection.js** (Main fixes)
   - [ ] detectContext() - Input validation
   - [ ] detectContext() - Silent catch blocks
   - [ ] detectContext() - Unspecific error handling
   - [ ] detectContext() - Invalid status detection
   - [ ] detectAllActiveContexts() - Return result object
   - [ ] isContextRelevant() - Add validation
   - [ ] getContextSummary() - Add validation

2. **mcp-server/tools/context.js** (Tool updates)
   - [ ] Add formatContextDetectionError() helper
   - [ ] Add withErrorHandling() helper
   - [ ] Update detect_context tool
   - [ ] Update detect_all_contexts tool
   - [ ] Update get_context_summary tool
   - [ ] Update is_context_relevant tool

3. **mcp-server/__tests__/context-detection.test.js** (Tests)
   - [ ] Add ticket_comments table
   - [ ] Add error checking to insertTestProject()
   - [ ] Add error checking to insertTestTicket()
   - [ ] Add error checking to insertTestSession()
   - [ ] Add tests for error cases

---

## Commit Strategy

Recommended commit structure:

**Commit 1**: Core error handling fixes
```
feat(context-detection): Implement proper error handling

- Replace silent catch blocks with ERROR level logging
- Add input validation with Zod schema
- Distinguish initialization errors from runtime errors
- Return error context objects instead of silently continuing
```

**Commit 2**: MCP tool improvements
```
feat(context-tools): Add actionable error messages

- Extract error handling into reusable helper
- Add contextual error messages with recovery guidance
- Include input parameters in error logs
- Update detectAllActiveContexts() return format
```

**Commit 3**: Validation and testing
```
test(context-detection): Improve validation and test coverage

- Add validation to utility functions
- Add error checking to test helpers
- Add test coverage for error cases
- Update test database schema
```

---

## Success Criteria

All of these should be true after fixes:

- [ ] No database errors are logged at DEBUG level
- [ ] All catch blocks log at ERROR level or have specific handling
- [ ] No silent failures - all errors have user-facing messages
- [ ] Error messages tell users what went wrong and how to fix it
- [ ] All public functions validate inputs
- [ ] Test suite includes error case coverage
- [ ] Error logs include sufficient context for debugging
- [ ] Code duplication in error handling is eliminated
- [ ] Invalid data (e.g., bad status values) is detected and reported
- [ ] Multi-window conflict scenarios work correctly

---

## Time Estimate

| Phase | Issues | Estimated Time | Actual Time |
| --- | --- | --- | --- |
| CRITICAL | 1-3 | 2-3 hours | [ ] |
| HIGH | 4-7 | 3-4 hours | [ ] |
| MEDIUM | 8-11 | 1-2 hours | [ ] |
| Testing | All | 1-2 hours | [ ] |
| **Total** | **All** | **7-11 hours** | [ ] |

---

## Questions During Implementation

Keep track of decisions made:

- [ ] **Zod for all functions?** Decision: ____________
- [ ] **Error response format?** Decision: ____________
- [ ] **Log level for all DB errors?** Decision: ____________
- [ ] **Add tests for all error cases?** Decision: ____________
- [ ] **Breaking changes acceptable?** Decision: ____________
- [ ] **Backwards compatibility needed?** Decision: ____________

---

## Sign-Off

- [ ] All CRITICAL issues fixed
- [ ] All HIGH issues fixed
- [ ] All MEDIUM issues fixed
- [ ] Tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Code reviewed
- [ ] Ready to merge

**Fixed by**: ________________________
**Date**: ________________________
**PR**: ________________________
