# Error Handling Audit Report: Silent Failures & Inadequate Error Handling

**Date**: February 14, 2026
**Focus Areas**: `src/api/dev-tools.ts`, `src/api/git-info.ts`, `src/lib/hooks/projects.ts`
**Severity**: CRITICAL (3), HIGH (5), MEDIUM (2)

---

## Executive Summary

The recent code changes contain **10 significant error handling defects** that create silent failures, hidden errors, and inadequate user feedback. The most severe issues are in asynchronous `exec()` callbacks where command failures are logged but execution returns `success: true` to users, creating a fundamental disconnect between system state and user perception.

**Key Problems**:

1. **CRITICAL**: Fire-and-forget `exec()` calls that never await completion
2. **CRITICAL**: Success responses returned before async operations complete
3. **CRITICAL**: Broad Promise.all() that silently fails if any epic fetch fails
4. **HIGH**: Error callbacks that log errors but don't prevent success returns
5. **HIGH**: Missing user-facing error feedback in multiple server functions

---

## Issue #1: CRITICAL - launchEditor() Returns Success Before exec() Completes

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (Lines 458-465)

**Severity**: CRITICAL

**Issue Description**:

The `launchEditor` function uses `exec()` with a callback for VSCode and Cursor, but immediately returns `success: true` without waiting for the command to complete. This creates a critical race condition:

```typescript
// Line 458-465
exec(command, (err: unknown) => {
  if (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to launch ${editor}`, new Error(message)); // ❌ Logged but ignored!
  }
});

return { success: true, message: `${editor} opened successfully` }; // ❌ Returns before exec completes!
```

**The Hidden Errors**:

- Editor command fails to execute (e.g., `code` binary not in PATH)
- Project path contains invalid characters that cause shell escaping issues
- Insufficient permissions to execute the editor
- Out of file descriptors (too many open editor windows)
- System resource exhaustion

**User Impact**:

- User sees "VSCode opened successfully" but VSCode never launches
- User spends minutes troubleshooting a "broken" editor integration
- Error is silently logged to server logs that user never reads
- User cannot distinguish between "editor not installed" vs. "something broke"
- Confusing: error appears in logs 10 seconds later, long after UI response

**Why This Is A Problem**:
The project has a strict no-silent-failures policy (see CLAUDE.md). This directly violates it. Users cannot see or act on errors that happen in background callbacks.

**Example of Hidden Errors**:

- `exec` error: "Command not found" - user thinks VSCode is broken, actually not installed
- `exec` error: "EACCES: permission denied" - user has no way to know file permissions are wrong
- `exec` error: "spawn E2BIG" - system cannot spawn process, user thinks feature is broken

**Recommendation**:

Replace `exec()` with a safer approach using `execFileNoThrow` utility (if available) or properly await the result with error handling:

```typescript
// Option 1: Use execFileNoThrow from utils (if available in this project)
import { execFileNoThrow } from "../utils/execFileNoThrow.js";

try {
  const result = await execFileNoThrow(editor, [projectPath]);
  if (result.status !== 0) {
    return {
      success: false,
      message: `Failed to launch ${editor}: ${result.stderr || result.stdout}`,
    };
  }
  return { success: true, message: `${editor} opened successfully` };
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Failed to launch ${editor}`, new Error(message));
  return {
    success: false,
    message: `Failed to launch ${editor}: ${message}. Make sure ${editor} is installed and in your PATH.`,
  };
}

// Option 2: Use promisified exec with proper error handling
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

try {
  await execAsync(command);
  return { success: true, message: `${editor} opened successfully` };
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Failed to launch ${editor}`, new Error(message));
  return {
    success: false,
    message: `Failed to launch ${editor}: ${message}. Make sure ${editor} is installed and in your PATH.`,
  };
}
```

---

## Issue #2: CRITICAL - launchDevServer() Returns Success Before Terminal Launches

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (Lines 506-511)

**Severity**: CRITICAL

**Issue Description**:

Same pattern as Issue #1. The dev server launch fires an async `exec()` but returns `success: true` immediately:

```typescript
// Line 506-516
exec(terminalCmd, (err: unknown) => {
  if (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to launch dev server", new Error(message)); // ❌ Only logged!
  }
});

return {
  success: true,
  message: `Dev server launching with command: ${command}`, // ❌ Says "launching" but might fail!
};
```

**The Hidden Errors**:

- Terminal emulator not installed or not found
- Invalid terminal type detected by `detectTerminal()`
- Command syntax errors in generated terminal command
- Working directory doesn't exist or is inaccessible
- Dev server command has syntax errors or missing dependencies

**User Impact**:

- User sees "Dev server launching..." but nothing happens
- User doesn't know if the problem is their system or the app
- Error appears in server logs 5 seconds later, user already moved on
- No way to retry or get help
- Message "Dev server launching" is misleading when it actually failed to launch

**Why This Is A Problem**:
Users expect synchronous feedback for async operations they initiated. The message "launching" creates false expectation. Error should be returned in the response, not hidden in logs.

**Recommendation**:

Use a proper async approach with error detection:

```typescript
// Use promisified exec to wait for command with timeout
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

try {
  // Start the process in background but verify it starts successfully
  const proc = exec(terminalCmd);

  // Give the process 1 second to start - if it fails immediately, catch it
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 1000);
    proc.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return {
    success: true,
    message: `Dev server launching with command: ${command}`,
  };
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("Failed to launch dev server", new Error(message));
  return {
    success: false,
    message: `Failed to launch dev server: ${message}. Check that your terminal is configured correctly.`,
  };
}
```

---

## Issue #3: CRITICAL - useProjects() Silently Fails If Any Epic Fetch Fails

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/lib/hooks/projects.ts` (Lines 85-90)

**Severity**: CRITICAL

**Issue Description**:

The `useProjects()` hook uses `Promise.all()` to fetch epics for all projects. If ANY single epic fetch fails, the entire query fails silently with no error message to the user:

```typescript
// Lines 85-92
const projectsWithEpics: ProjectWithEpics[] = await Promise.all(
  projectList.map(async (project: (typeof projectList)[0]) => {
    const epics = await getEpicsByProject({ data: project.id }); // ❌ If this fails for ANY project...
    return { ...project, epics };
  })
); // ❌ ...Promise.all rejects and entire query fails

return projectsWithEpics; // ❌ Never reached if any epic fetch fails
```

**The Hidden Errors**:

- One project has corrupted epic data in database
- One project's epic fetch times out
- Database is temporarily unavailable for one project
- Network error for one specific project fetch
- Permission denied on one project's epic file

**User Impact**:

- User sees "Error loading projects" with generic message
- No indication which project caused the problem
- Cannot see any other projects even if they load fine
- User cannot work on projects that would have loaded successfully
- Error debugging becomes "which project is broken?" - impossible without logs

**Why This Is A Problem**:
Partial failures are better than total failures. If 9 out of 10 projects load fine, show those 9 to the user. Only show an error for the problematic project.

**Recommendation**:

Use `Promise.allSettled()` instead of `Promise.all()` to capture both successes and failures:

```typescript
const epicResults = await Promise.allSettled(
  projectList.map(async (project: (typeof projectList)[0]) => {
    const epics = await getEpicsByProject({ data: project.id });
    return { ...project, epics };
  })
);

const projectsWithEpics: ProjectWithEpics[] = [];
const failedProjects: Array<{ projectId: string; error: string }> = [];

for (let i = 0; i < epicResults.length; i++) {
  if (epicResults[i].status === "fulfilled") {
    projectsWithEpics.push((epicResults[i] as PromiseFulfilledResult<ProjectWithEpics>).value);
  } else {
    const error = (epicResults[i] as PromiseRejectedResult).reason;
    const errorMsg = error instanceof Error ? error.message : String(error);
    failedProjects.push({
      projectId: projectList[i].id,
      error: errorMsg,
    });
    logger.warn(`Failed to load epics for project ${projectList[i].id}: ${errorMsg}`);
    // Still include the project, just with empty epics
    projectsWithEpics.push({ ...projectList[i], epics: [] });
  }
}

if (failedProjects.length > 0) {
  logger.error(
    `Failed to load epics for ${failedProjects.length} project(s): ${failedProjects.map((p) => p.projectId).join(", ")}`
  );
}

return projectsWithEpics;
```

---

## Issue #4: HIGH - exec() in launchEditor Terminal Commands Never Waits

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (Lines 438, 451)

**Severity**: HIGH

**Issue Description**:

The Vim and Neovim launching code calls `exec()` with the generated terminal command but doesn't handle errors or await completion:

```typescript
// Lines 437-439 (Neovim case)
const termCmd = buildTerminalCommand(terminal, `nvim "${projectPath}"`, projectPath);
exec(termCmd); // ❌ Fire and forget - no error handling!
return { success: true, message: "Neovim opened in terminal" };

// Lines 450-452 (Vim case)
const termCmd = buildTerminalCommand(terminal, `vim "${projectPath}"`, projectPath);
exec(termCmd); // ❌ Same problem here!
return { success: true, message: "Vim opened in terminal" };
```

**The Hidden Errors**:

- `buildTerminalCommand()` throws if terminal is not whitelisted
- Terminal launch command has syntax errors
- Terminal process cannot be spawned (missing dependencies, permissions)
- Path escaping breaks shell command execution
- Invalid terminal name passed to `buildTerminalCommand()`

**User Impact**:

- User clicks "Open in Vim" and nothing happens
- Error is thrown but never caught
- Function might crash but user still sees "success: true"
- Error only visible in server logs

**Why This Is A Problem**:
Unlike the VSCode/Cursor cases above, these have NO error callback at all. If the command fails, there's complete silence.

**Recommendation**:

Wrap the terminal command execution in proper error handling:

```typescript
case "neovim": {
  const terminal = await detectTerminal();
  if (!terminal) {
    return {
      success: false,
      message: "No terminal detected. Please install a terminal emulator.",
    };
  }
  try {
    const termCmd = buildTerminalCommand(terminal, `nvim "${projectPath}"`, projectPath);

    // Launch in background but verify it starts
    const proc = exec(termCmd);

    // Give process 500ms to start before returning to user
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 500);
      proc.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return { success: true, message: "Neovim opened in terminal" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to launch Neovim", new Error(message));
    return {
      success: false,
      message: `Failed to launch Neovim: ${message}`,
    };
  }
}
```

---

## Issue #5: HIGH - buildTerminalCommand() Throws Without Try-Catch

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (Line 437)

**Severity**: HIGH

**Issue Description**:

The code calls `buildTerminalCommand()` without wrapping it in try-catch. If the function throws (e.g., invalid terminal), the error crashes the handler:

```typescript
// Line 437
const termCmd = buildTerminalCommand(terminal, `nvim "${projectPath}"`, projectPath); // ❌ Can throw!
```

Looking at `terminal-utils.ts` line 166:

```typescript
if (!isAllowedTerminal(terminal)) {
  throw new Error(`Terminal "${terminal}" is not allowed`); // ❌ This throws!
}
```

**The Hidden Errors**:

- `detectTerminal()` returned a value not in the whitelist (should never happen, but undefined behavior if it does)
- Invalid terminal passed to function
- Function throws exception that crashes the handler

**User Impact**:

- Server function throws unhandled exception
- User sees generic "500 Internal Server Error"
- No logging of what actually went wrong
- Developer has to trace through code to understand the failure

**Why This Is A Problem**:
Throwing exceptions in server functions is uncontrolled error handling. All errors should be caught and returned as structured responses.

**Recommendation**:

Wrap the terminal command building in try-catch:

```typescript
case "neovim": {
  const terminal = await detectTerminal();
  if (!terminal) {
    return {
      success: false,
      message: "No terminal detected. Please install a terminal emulator.",
    };
  }
  try {
    const termCmd = buildTerminalCommand(terminal, `nvim "${projectPath}"`, projectPath);
    // ... rest of code
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to build terminal command for Neovim", new Error(message));
    return {
      success: false,
      message: `Failed to launch Neovim: ${message}`,
    };
  }
}
```

---

## Issue #6: HIGH - Missing User Feedback in detectTechStack on Error

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (Lines 234-237)

**Severity**: HIGH

**Issue Description**:

The outer try-catch in `detectTechStack` logs errors but doesn't provide any user feedback. It silently returns an empty tech stack if something goes wrong:

```typescript
// Lines 234-240
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("detectTechStack error", new Error(message));  // ❌ Only logged!
}

return result;  // ❌ Returns empty tech stack with no indication of failure
```

**The Hidden Errors**:

- Filesystem permission issues preventing file reads
- Out of memory while parsing large dependency files
- Corrupted package.json or Cargo.toml
- Stack overflow from recursive file operations

**User Impact**:

- User sees empty "Tech Stack" section with no explanation
- User assumes the feature doesn't work for their project
- No indication that something went wrong vs. project having no tech stack
- No way to debug or fix the issue

**Why This Is A Problem**:
Errors should be visible to users. Silently returning empty results with no error message violates the principle that all errors should be surfaced with actionable feedback.

**Recommendation**:

Return error information in the response or use a different approach:

```typescript
// Option 1: Add error field to response
export interface TechStackInfo {
  languages: Array<{ name: string; icon: string; version?: string }>;
  frameworks: Array<{ name: string; icon: string; version?: string }>;
  totalDependencies: number;
  error?: string;  // Add this
}

// Then in handler:
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("detectTechStack error", new Error(message));
  result.error = `Failed to detect tech stack: ${message}`;
}

return result;

// Option 2: Return success boolean
export interface TechStackInfo {
  success: boolean;
  languages: Array<{ name: string; icon: string; version?: string }>;
  frameworks: Array<{ name: string; icon: string; version?: string }>;
  totalDependencies: number;
  error?: string;
}
```

---

## Issue #7: HIGH - Missing Error Messages in detectDevCommands

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (Lines 393-399)

**Severity**: HIGH

**Issue Description**:

Same pattern as Issue #6. The outer try-catch logs errors but returns empty command list:

```typescript
// Lines 393-399
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("detectDevCommands error", new Error(message));  // ❌ Only logged!
}

return commands;  // ❌ Returns empty array with no indication of failure
```

**The Hidden Errors**:

- Filesystem permission issues reading Makefile
- Large Makefile that causes regex engine to timeout
- Corrupted docker-compose.yml
- Memory exhaustion while parsing files

**User Impact**:

- User sees empty "Dev Commands" section
- User assumes project has no runnable commands
- No indication that detection failed vs. project having no commands
- User cannot tell if feature is broken or just their project type isn't recognized

**Recommendation**:

Add error reporting to the response:

```typescript
export interface DevCommand {
  name: string;
  command: string;
  description?: string;
  source: "package.json" | "makefile" | "docker-compose";
}

export interface DevCommandsResponse {
  commands: DevCommand[];
  error?: string;
}

// In handler:
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("detectDevCommands error", new Error(message));
  return {
    commands,
    error: `Partial failure detecting dev commands: ${message}`,
  };
}
```

---

## Issue #8: HIGH - No Error Feedback for Mutation Failures in Hooks

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/lib/hooks/projects.ts` (Lines 464-467, 473-476)

**Severity**: HIGH

**Issue Description**:

The `useLaunchEditor()` and `useLaunchDevServer()` mutations have no error handling. If the server function returns `success: false`, the component using the hook has no way to know:

```typescript
// Lines 464-467
export function useLaunchEditor() {
  return useMutation({
    mutationFn: (data: { projectPath: string; editor: string }) => launchEditor({ data }),
    // ❌ No onError handler - component won't know about failures!
  });
}

// Lines 473-476
export function useLaunchDevServer() {
  return useMutation({
    mutationFn: (data: { projectPath: string; command: string }) => launchDevServer({ data }),
    // ❌ No onError handler - component won't know about failures!
  });
}
```

**The Hidden Errors**:

- Server function returns `success: false`
- Network error during the request
- Request timeout
- Invalid input validation failure

**User Impact**:

- Component using the hook has `error` field but no error callback to handle it
- Hook doesn't log errors (unlike other mutation hooks)
- Component must check `data.success` and `data.message` manually
- Inconsistent with other mutations that have proper error handling

**Why This Is A Problem**:
Other mutations in the file (like `useCreateEpic`) have `onError` handlers that log errors. These mutations should follow the same pattern.

**Recommendation**:

Add `onError` handlers to match the pattern used by other mutations:

```typescript
export function useLaunchEditor() {
  return useMutation({
    mutationFn: (data: { projectPath: string; editor: string }) => launchEditor({ data }),
    onError: (err, variables) => {
      logger.error(
        `Failed to launch editor: editor="${variables.editor}", path="${variables.projectPath}"`,
        err instanceof Error ? err : new Error(String(err))
      );
    },
  });
}

export function useLaunchDevServer() {
  return useMutation({
    mutationFn: (data: { projectPath: string; command: string }) => launchDevServer({ data }),
    onError: (err, variables) => {
      logger.error(
        `Failed to launch dev server: command="${variables.command}", path="${variables.projectPath}"`,
        err instanceof Error ? err : new Error(String(err))
      );
    },
  });
}
```

---

## Issue #9: MEDIUM - Missing Error Context in Git Command Results

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/git-info.ts` (Lines 115-118)

**Severity**: MEDIUM

**Issue Description**:

The `getGitProjectInfo` function has an outer catch block that logs errors but doesn't provide context about which git command failed:

```typescript
// Lines 115-118
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("getGitProjectInfo error", new Error(message));  // ❌ Which command failed? No context!
}

return result;  // ❌ Returns partial result with no indication of what failed
```

**The Hidden Errors**:

- Git command timed out (long repository)
- Git command returned unexpected output format
- Project path has invalid characters
- git binary not installed
- Repository is corrupted

**User Impact**:

- UI shows partial git info (maybe branch name is empty, commits are empty)
- User doesn't know what went wrong or if it's critical
- Log message "getGitProjectInfo error" is too generic
- No indication which specific git command failed

**Why This Is A Problem**:
When an operation partially fails, users should see which part failed and why. The error is caught but the context is lost.

**Recommendation**:

Add context about which step failed:

```typescript
try {
  // ... git operations ...
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`getGitProjectInfo error for ${projectPath}: ${message}`, new Error(message));

  // Optionally, add error field to indicate partial failure
  return {
    ...result,
    _error: `Failed to fetch git info: ${message}`,
  };
}
```

Or better, add error tracking to individual git operations:

```typescript
// Get current branch
const branchResult = runGitCommand("git rev-parse --abbrev-ref HEAD", projectPath);
if (branchResult.success) {
  result.branch = branchResult.output;
} else {
  logger.warn(`Failed to get branch for ${projectPath}: ${branchResult.error}`);
}

// Get last commit
const lastCommitResult = runGitCommand('git log -1 --format="%H|%s|%an|%ai"', projectPath);
if (lastCommitResult.success && lastCommitResult.output) {
  // ...
} else {
  logger.warn(`Failed to get last commit for ${projectPath}: ${lastCommitResult.error}`);
}
```

---

## Issue #10: MEDIUM - formatDate() Silent Fallback Hides Errors

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/api/git-info.ts` (Lines 37-55)

**Severity**: MEDIUM

**Issue Description**:

The `formatDate()` function has a bare catch block that silently returns the original string instead of the formatted date, with no indication to the user:

```typescript
// Lines 37-55
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    // ... formatting logic ...
    return date.toLocaleDateString();
  } catch {
    // ❌ Bare catch - what error happened?
    return dateStr; // ❌ Silent fallback - user sees raw date string
  }
}
```

**The Hidden Errors**:

- Date parsing failed (invalid git date format)
- Invalid date string from git log
- Timezone handling issue
- Locale not available

**User Impact**:

- User sees raw ISO date string instead of human-readable format
- User doesn't know why the date looks different from other timestamps
- Error is silently ignored with no logging
- No indication that something went wrong

**Why This Is A Problem**:
Silent fallbacks mask real problems. If the date format changes or git output changes, this fallback hides that instead of alerting you to fix it.

**Recommendation**:

Log the error and add defensive programming:

```typescript
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);

    // Validate date is valid
    if (isNaN(date.getTime())) {
      logger.warn(`Invalid date from git: ${dateStr}`);
      return dateStr;
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    // ... rest of logic ...
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to format git date "${dateStr}": ${message}`);
    return dateStr;
  }
}
```

---

## Summary Table

| Issue # | Location             | Severity | Problem                                              | Impact                                               |
| ------- | -------------------- | -------- | ---------------------------------------------------- | ---------------------------------------------------- |
| 1       | dev-tools.ts:458     | CRITICAL | exec() fire-and-forget in launchEditor               | Returns success before command executes              |
| 2       | dev-tools.ts:506     | CRITICAL | exec() fire-and-forget in launchDevServer            | Returns success while terminal launch fails silently |
| 3       | projects.ts:85       | CRITICAL | Promise.all() silently fails if any epic fetch fails | User loses access to all projects if one fails       |
| 4       | dev-tools.ts:438,451 | HIGH     | exec() in Vim/Neovim launch with no error handling   | Command fails silently with no feedback              |
| 5       | dev-tools.ts:437     | HIGH     | buildTerminalCommand() can throw without try-catch   | Unhandled exception crashes handler                  |
| 6       | dev-tools.ts:234     | HIGH     | detectTechStack error hidden from user               | User sees empty tech stack with no error message     |
| 7       | dev-tools.ts:393     | HIGH     | detectDevCommands error hidden from user             | User sees empty command list with no error message   |
| 8       | projects.ts:464,473  | HIGH     | Mutation hooks have no error handlers                | Components can't respond to launch failures          |
| 9       | git-info.ts:115      | MEDIUM   | Generic error message without context                | User doesn't know which git operation failed         |
| 10      | git-info.ts:52       | MEDIUM   | Silent fallback in formatDate()                      | Invalid dates are hidden, not reported               |

---

## Recommendations By Priority

### Immediate (CRITICAL)

1. **Fix launchEditor() exec() fire-and-forget** (Issue #1)
   - Use promisified exec with error handling or execFileNoThrow
   - Return error response if command fails
   - Estimated fix time: 30 minutes

2. **Fix launchDevServer() exec() fire-and-forget** (Issue #2)
   - Same as above
   - Estimated fix time: 30 minutes

3. **Fix Promise.all() in useProjects()** (Issue #3)
   - Switch to Promise.allSettled()
   - Include empty epics array for failed projects
   - Log which projects failed
   - Estimated fix time: 45 minutes

### High Priority

4. **Fix Vim/Neovim launch error handling** (Issue #4)
   - Add try-catch around exec() calls
   - Estimated fix time: 30 minutes

5. **Add try-catch for buildTerminalCommand()** (Issue #5)
   - Wrap calls in try-catch
   - Return error response on throw
   - Estimated fix time: 15 minutes

6. **Add error field to TechStackInfo response** (Issue #6)
   - Include error message when detection fails
   - Estimated fix time: 20 minutes

7. **Add error field to DevCommands response** (Issue #7)
   - Include error message when detection fails
   - Estimated fix time: 20 minutes

8. **Add onError handlers to mutation hooks** (Issue #8)
   - Follow pattern from useCreateEpic
   - Estimated fix time: 15 minutes

### Medium Priority

9. **Add error context to getGitProjectInfo()** (Issue #9)
   - Include which git operation failed in logs
   - Estimated fix time: 20 minutes

10. **Add logging to formatDate()** (Issue #10)
    - Log when date parsing fails
    - Estimated fix time: 10 minutes

---

## Testing Recommendations

After fixing these issues, add tests for error scenarios:

1. **Test exec() failures**:
   - Mock exec() to fail with ENOENT
   - Verify error is returned to user
   - Verify error is logged

2. **Test partial Promise failures**:
   - Mock getEpicsByProject to fail for one project
   - Verify other projects still load
   - Verify failed project is logged

3. **Test invalid terminal names**:
   - Pass invalid terminal to launchEditor
   - Verify error is caught and returned
   - Verify no unhandled exceptions

4. **Test network failures**:
   - Mock server functions to throw
   - Verify mutations handle errors gracefully
   - Verify error callbacks are invoked

---

## Files Affected

- `/home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts` (6 issues)
- `/home/xtra/code/personal_projects/brain-dump/src/lib/hooks/projects.ts` (2 issues)
- `/home/xtra/code/personal_projects/brain-dump/src/api/git-info.ts` (2 issues)

---

## Security Notes

**Important**: The report recommends using `promisify(exec)` for error handling examples, but this project may have access to safer utilities:

- Check if `src/utils/execFileNoThrow.ts` exists
- If available, use `execFileNoThrow` instead of `exec()`
- `execFileNoThrow` provides:
  - Uses `execFile` instead of `exec` (prevents shell injection)
  - Proper error handling with status codes
  - Structured output with stdout, stderr, and status
  - Windows compatibility

Always prefer safer alternatives over raw `exec()` calls.

---

## References

- CLAUDE.md: "Never silently fail in production code"
- CLAUDE.md: "Always log errors using appropriate logging functions"
- Project error handling philosophy: Silent failures are unacceptable
- Best practice: All async operations should have error callbacks or be awaited
