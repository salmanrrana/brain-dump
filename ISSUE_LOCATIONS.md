# Error Handling Issues - Quick Reference by File

## /home/xtra/code/personal_projects/brain-dump/src/api/dev-tools.ts

### Issue #1: CRITICAL - Fire-and-forget exec() in launchEditor()

- **Lines**: 458-465
- **Problem**: `exec(command, callback)` returns success before async exec completes
- **Code**:

```typescript
exec(command, (err: unknown) => {
  if (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to launch ${editor}`, new Error(message));
  }
});

return { success: true, message: `${editor} opened successfully` };
```

- **Fix**: Await the exec completion or add error detection before returning

---

### Issue #2: CRITICAL - Fire-and-forget exec() in launchDevServer()

- **Lines**: 506-516
- **Problem**: Returns `success: true` before terminal launch is verified
- **Code**:

```typescript
exec(terminalCmd, (err: unknown) => {
  if (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to launch dev server", new Error(message));
  }
});

return {
  success: true,
  message: `Dev server launching with command: ${command}`,
};
```

- **Fix**: Wait for process to start successfully before returning

---

### Issue #4: HIGH - exec() with no error handling in Vim/Neovim

- **Lines**: 438, 451
- **Problem**: `exec(termCmd)` called with NO error callback
- **Code**:

```typescript
// Neovim case (line 438)
const termCmd = buildTerminalCommand(terminal, `nvim "${projectPath}"`, projectPath);
exec(termCmd); // No error handling!
return { success: true, message: "Neovim opened in terminal" };

// Vim case (line 451)
const termCmd = buildTerminalCommand(terminal, `vim "${projectPath}"`, projectPath);
exec(termCmd); // No error handling!
return { success: true, message: "Vim opened in terminal" };
```

- **Fix**: Add error callback to exec() or wrap in try-catch with proper error detection

---

### Issue #5: HIGH - buildTerminalCommand() can throw

- **Lines**: 437, 450
- **Problem**: Function call not wrapped in try-catch, can throw
- **Code**:

```typescript
const termCmd = buildTerminalCommand(terminal, `nvim "${projectPath}"`, projectPath);
// Function throws if terminal not whitelisted but no try-catch here
```

- **Fix**: Wrap in try-catch block

---

### Issue #6: HIGH - detectTechStack() hides errors from user

- **Lines**: 234-240
- **Problem**: Catches errors, logs them, returns empty result with no error indicator
- **Code**:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("detectTechStack error", new Error(message));  // Only logged!
}

return result;  // Returns empty tech stack with no error field
```

- **Fix**: Add error field to response or return error indicator

---

### Issue #7: HIGH - detectDevCommands() hides errors from user

- **Lines**: 393-399
- **Problem**: Same as #6 - catches errors, returns empty array
- **Code**:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("detectDevCommands error", new Error(message));  // Only logged!
}

return commands;  // Returns empty array with no error indication
```

- **Fix**: Add error field to response

---

## /home/xtra/code/personal_projects/brain-dump/src/lib/hooks/projects.ts

### Issue #3: CRITICAL - Promise.all() fails if any epic fetch fails

- **Lines**: 85-92
- **Problem**: `Promise.all()` rejects if any single epic fetch fails
- **Code**:

```typescript
const projectsWithEpics: ProjectWithEpics[] = await Promise.all(
  projectList.map(async (project: (typeof projectList)[0]) => {
    const epics = await getEpicsByProject({ data: project.id }); // If this fails...
    return { ...project, epics };
  })
); // ...entire query fails

return projectsWithEpics;
```

- **Fix**: Use `Promise.allSettled()` instead of `Promise.all()`

---

### Issue #8: HIGH - Mutation hooks missing error handlers

- **Lines**: 464-467, 473-476
- **Problem**: No `onError` handlers, inconsistent with other mutations
- **Code**:

```typescript
export function useLaunchEditor() {
  return useMutation({
    mutationFn: (data: { projectPath: string; editor: string }) => launchEditor({ data }),
    // Missing: onError handler
  });
}

export function useLaunchDevServer() {
  return useMutation({
    mutationFn: (data: { projectPath: string; command: string }) => launchDevServer({ data }),
    // Missing: onError handler
  });
}
```

- **Fix**: Add onError handlers like in useCreateEpic/useUpdateEpic

---

## /home/xtra/code/personal_projects/brain-dump/src/api/git-info.ts

### Issue #9: MEDIUM - Missing error context in getGitProjectInfo()

- **Lines**: 115-118
- **Problem**: Generic error message without context
- **Code**:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("getGitProjectInfo error", new Error(message));  // Too generic!
}

return result;  // No indication of what failed
```

- **Fix**: Add context to error message indicating which operation failed

---

### Issue #10: MEDIUM - formatDate() silent fallback

- **Lines**: 37-55
- **Problem**: Bare catch block returns original string, no logging
- **Code**:

```typescript
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  } catch {
    // Bare catch - no logging!
    return dateStr; // Silent fallback
  }
}
```

- **Fix**: Add logging when catch is triggered

---

## Summary Table

| Issue | File         | Lines            | Severity | Fix Type                   |
| ----- | ------------ | ---------------- | -------- | -------------------------- |
| #1    | dev-tools.ts | 458-465          | CRITICAL | Await exec or verify start |
| #2    | dev-tools.ts | 506-516          | CRITICAL | Verify process starts      |
| #3    | projects.ts  | 85-92            | CRITICAL | Promise.allSettled()       |
| #4    | dev-tools.ts | 438, 451         | HIGH     | Add error callback         |
| #5    | dev-tools.ts | 437, 450         | HIGH     | Add try-catch              |
| #6    | dev-tools.ts | 234-240          | HIGH     | Add error field            |
| #7    | dev-tools.ts | 393-399          | HIGH     | Add error field            |
| #8    | projects.ts  | 464-467, 473-476 | HIGH     | Add onError                |
| #9    | git-info.ts  | 115-118          | MEDIUM   | Add context                |
| #10   | git-info.ts  | 37-55            | MEDIUM   | Add logging                |
