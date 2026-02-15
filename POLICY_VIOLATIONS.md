# Project Policy Violations

## CLAUDE.md Requirements vs. Audit Findings

### Policy: "Never silently fail in production code"

**Violations Found**:

1. **Issue #6**: detectTechStack() silently fails
   - Catches error, logs to server, returns empty result
   - User sees empty tech stack with no indication of failure
   - Direct violation: Silent failure in production code

2. **Issue #7**: detectDevCommands() silently fails
   - Catches error, logs to server, returns empty array
   - User sees no dev commands with no indication of failure
   - Direct violation: Silent failure in production code

3. **Issue #10**: formatDate() silent fallback
   - Bare catch block silently returns original date
   - No indication that parsing failed
   - Direct violation: Silent failure without user awareness

4. **Issue #1, #2**: Fire-and-forget exec() calls
   - User sees "success: true" but command never executes
   - Error logged server-side but user never sees it
   - Direct violation: Silent failure with misleading success message

### Policy: "Always log errors using appropriate logging functions"

**Violations Found**:

1. **Issue #4**: Vim/Neovim exec() with no logging
   - `exec(termCmd)` called with NO callback at all
   - No logging of any errors
   - Direct violation: No error logging

2. **Issue #5**: buildTerminalCommand() throws without logging
   - Function can throw but error is never logged
   - Exception crashes handler with no context
   - Partial violation: Error not logged appropriately

3. **Issue #10**: formatDate() bare catch with no logging
   - Catch block is empty (no logging or error handling)
   - Silent fallback without any diagnostic information
   - Direct violation: Error not logged

### Policy: "Include relevant context in error messages"

**Violations Found**:

1. **Issue #9**: getGitProjectInfo() generic error message
   - Error message: "getGitProjectInfo error"
   - No indication which git command failed
   - No project context
   - Direct violation: Error message lacks relevant context

2. **Issue #6, #7**: detectTechStack/detectDevCommands
   - Error logged to server only
   - User sees generic empty result with no context
   - Direct violation: No user-facing error with context

### Policy: "Propagate errors to appropriate handlers"

**Violations Found**:

1. **Issue #3**: Promise.all() swallows one failure for all projects
   - Error from one project fetch causes entire query to fail
   - All projects become inaccessible
   - Error not propagated appropriately
   - Direct violation: One failure prevents all success

2. **Issue #1, #2**: Error callback exists but error not propagated to user
   - Error logged in callback but not returned to user
   - Success response already sent
   - Error cannot be propagated after response sent
   - Direct violation: Error callback but no propagation to user

3. **Issue #8**: Mutation hooks don't propagate errors to components
   - Mutations have no onError handler
   - Errors logged but never reach components
   - Direct violation: Errors not propagated to appropriate handlers

### Policy: "Never use empty catch blocks"

**Violations Found**:

1. **Issue #10**: formatDate() has bare catch block
   - `catch { return dateStr; }`
   - No logging, no error handling, just silent fallback
   - Direct violation: Empty catch block

---

## Additional Policy Violations

### From Testing Philosophy

**Policy**: "Test user behavior, not implementation details"

**Violations Found**:

- No tests exist for error scenarios in:
  - exec() failures (Issues #1, #2, #4)
  - Promise failures (Issue #3)
  - Network failures
  - Invalid input

**Impact**: Cannot verify error behavior works as expected

---

## Severity Assessment

### CRITICAL Violations

These violate the core safety principle:

1. **Fire-and-forget exec() returning success** (Issue #1, #2)
   - Fundamental violation of "never silently fail"
   - Users cannot see command failures
   - Debugging is impossible

2. **Promise.all() one-failure-blocks-all** (Issue #3)
   - Violates error propagation policy
   - Prevents partial success (best practice)
   - User loses access to working projects

3. **No error handling for Vim exec** (Issue #4)
   - No logging at all
   - Fire-and-forget with zero feedback
   - Complete silent failure

### HIGH Violations

These violate multiple policies:

1. **Silent error returns** (Issue #6, #7)
   - Never silently fail (violated)
   - Include relevant context (violated)
   - User sees no indication of problem

2. **buildTerminalCommand() throws** (Issue #5)
   - Never silently fail (violated if unhandled)
   - Uncontrolled error propagation

3. **Missing error handlers** (Issue #8)
   - Propagate errors to handlers (violated)
   - Inconsistent with other mutations

### MEDIUM Violations

1. **Missing error context** (Issue #9)
   - Include relevant context (violated)
   - Makes debugging harder

2. **Bare catch fallback** (Issue #10)
   - Never use empty catch (violated)
   - Masks problems instead of exposing them

---

## Direct Policy Quotes

From `/home/xtra/code/personal_projects/brain-dump/CLAUDE.md`:

### "Never silently fail in production code"

How issues violate:

- Issue #1: Returns success while command fails silently
- Issue #2: Returns success while terminal launch fails silently
- Issue #4: Command fails with zero feedback
- Issue #6, #7: Returns empty results with no error indication
- Issue #10: Returns original date with no indication of parsing failure

### "Always log errors using appropriate logging functions"

How issues violate:

- Issue #4: No logging at all
- Issue #5: No logging if buildTerminalCommand() throws
- Issue #10: No logging in catch block

### "Include relevant context in error messages"

How issues violate:

- Issue #6, #7: No user-facing error message
- Issue #9: Generic error message "getGitProjectInfo error"
- All issues: Server-side logs only, user sees nothing

### "Never use empty catch blocks"

How issues violate:

- Issue #10: `catch { return dateStr; }` is bare catch

---

## Comparison: What Should Happen vs. What Happens

### Issue #1: launchEditor()

**Should happen**:

1. User clicks "Open in VSCode"
2. App sends request to launch editor
3. Handler waits for exec() to complete (or at least start successfully)
4. If exec fails, error is caught and returned to user
5. User sees error message like "Failed to launch VSCode: command not found"

**Actually happens**:

1. User clicks "Open in VSCode"
2. App sends request to launch editor
3. Handler calls exec() and immediately returns "success: true"
4. User sees "VSCode opened successfully"
5. 2 seconds later, exec() fails with ENOENT
6. Error logged to server: "Failed to launch vscode"
7. User never sees the error
8. User waits 5 minutes for VSCode to appear
9. User concludes the feature is broken

### Issue #3: useProjects()

**Should happen**:

1. App fetches all projects
2. App fetches epics for each project
3. If one epic fetch fails, user sees that project with:
   - Project name and path
   - Empty epics section
   - Error message: "Failed to load epics for this project"
4. Other projects load normally

**Actually happens**:

1. App fetches all projects
2. App tries to fetch epics for all projects with Promise.all()
3. If one epic fetch fails, entire query fails
4. User sees: "Error loading projects"
5. User cannot access ANY projects
6. Error log says which epic failed, but user can't see that
7. User cannot work at all
8. User tries reloading - same error
9. User gives up

### Issue #6: detectTechStack()

**Should happen**:

1. App tries to detect tech stack
2. If detection fails, user sees error like:
   - "Failed to detect tech stack: permission denied on package.json"
   - "Unable to read project files - check filesystem permissions"
3. User can see what went wrong and fix it

**Actually happens**:

1. App tries to detect tech stack
2. If detection fails, error is logged server-side
3. User sees empty "Tech Stack" section
4. No indication that anything went wrong
5. User thinks: "I guess this project type isn't supported"
6. User assumes the feature doesn't work for their project type
7. User doesn't try troubleshooting because they think it's "not supported"
8. Actual error sits in server logs unread

---

## Why These Violations Matter

### For Users:

- Cannot see or act on errors
- Debugging becomes impossible ("it just doesn't work")
- Confusing: false success messages
- Cannot distinguish between different failure modes
- Cannot fix problems without help from developers

### For Developers:

- Errors hidden in server logs
- No way to debug user-reported issues ("I see an error in logs")
- Cannot add telemetry/monitoring for errors users experience
- Silent failures multiply - what one user experiences, others will too
- Technical debt grows as each issue creates downstream problems

### For System Reliability:

- Errors not surfaced means they persist
- Users work around broken features instead of reporting them
- System appears to work when it's actually failing
- Cascading failures (e.g., Promise.all() failure blocks entire app)
- No defensive programming (no partial success, no degraded modes)

---

## Remediation Priority

### Must Fix Before Merge (CRITICAL)

1. Issue #1: launchEditor() fire-and-forget
2. Issue #2: launchDevServer() fire-and-forget
3. Issue #3: Promise.all() one-failure-blocks-all
4. Issue #4: Vim/Neovim exec() with no error handling

**Reason**: Direct policy violations that create dangerous silent failures

### Should Fix Before Release (HIGH)

5. Issue #5: buildTerminalCommand() can throw unhandled
6. Issue #6: detectTechStack() errors hidden
7. Issue #7: detectDevCommands() errors hidden
8. Issue #8: Mutation hooks missing error handlers

**Reason**: Policy violations affecting user experience

### Prefer to Fix (MEDIUM)

9. Issue #9: Missing error context in git-info
10. Issue #10: Bare catch in formatDate()

**Reason**: Policy violations but lower user impact

---

## Testing Requirement

To verify fixes don't regress, add tests for:

1. exec() failure scenarios
   - Command not found
   - Permission denied
   - Process spawn failure

2. Promise failure scenarios
   - One epic fetch fails, others succeed
   - Multiple epics fail

3. Invalid input scenarios
   - Invalid terminal name
   - Invalid project path

4. Network failure scenarios
   - Server timeouts
   - Connection refused

All error paths must be tested to prevent regression.
