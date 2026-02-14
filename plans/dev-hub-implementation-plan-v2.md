# Development Hub Implementation Plan - V2 (Feedback-Refined)

**Date:** 2026-02-14
**Status:** Ready for Implementation
**Epic:** Project Detail Page → Development Hub

---

## Summary of Changes from Feedback

This refined plan addresses key architectural concerns and simplifies the V1 scope:

### ✅ Changes Made

1. **Merge git-info.ts into dev-tools.ts**
   - Single API file: `src/api/dev-tools.ts`
   - Contains 6 functions: `detectTechStack`, `detectEditors`, `detectDevCommands`, `getGitInfo`, `launchEditor`, `launchDevServer`
   - Reduces API overhead, simpler to ship

2. **Reduce Editor Scope (V1)**
   - Support: VS Code, Cursor, Codex, OpenCode (already in codebase)
   - Skip: Vim, Neovim (defer to V2)
   - Reason: Reuse existing patterns from `src/api/terminal.ts`

3. **Remove Destructive Actions**
   - Remove "Initialize Git" button from GitHistoryCard
   - Git not initialized → Shows info only, no action
   - Keep hub read-only for V1 (non-destructive)

4. **Tighten Command Execution Safety**
   - `launchDevServer` only accepts commands from detected list
   - Validate against `package.json` scripts or `Makefile` targets
   - No free-text input allowed
   - Prevents arbitrary code execution

5. **Mark Launchers as Pure (No Side Effects)**
   - All launcher functions (`launchEditor`, `launchDevServer`) marked `@pure`
   - Return only `{ success, message }`
   - NO ticket state mutations (no `workflow` calls)
   - Let caller decide what to do with result

6. **Fix Ticket Dependencies**
   - Backend (dev-tools.ts) → **FIRST** (0 blockers)
   - Hooks/Query Keys → **DEPENDS ON** dev-tools.ts
   - UI Components → **DEPENDS ON** hooks
   - Integration → **DEPENDS ON** all UI components
   - Clear sequential chain, not false parallelization

7. **Reuse Existing Patterns**
   - Terminal detection: `detectTerminal()` from `terminal-utils.ts`
   - Terminal building: `buildTerminalCommand()` from `terminal-utils.ts`
   - Install detection: `isVSCodeInstalled()`, `isCursorInstalled()` from `terminal.ts`
   - Terminal availability: `isTerminalAvailable()` from `settings.ts`

---

## Updated Ticket Structure

### Phase 1: Backend (SEQUENTIAL) ⚙️

**Ticket 1: Create dev-tools.ts (CONSOLIDATED)**

- Includes all 6 functions (was split into dev-tools + git-info)
- File: `src/api/dev-tools.ts`
- No blockers
- **Functions:**
  1. `detectTechStack(projectPath)` → TechStackInfo
  2. `detectInstalledEditors()` → EditorInfo[]
  3. `detectDevCommands(projectPath)` → DevCommand[]
  4. `getGitInfo(projectPath)` → GitProjectInfo
  5. `launchEditor({ projectPath, editor })` → @pure, returns { success, message }
  6. `launchDevServer({ projectPath, command })` → @pure, returns { success, message }

**Ticket 2: Add hooks + query keys**

- Files: `src/lib/hooks/projects.ts`, `src/lib/query-keys.ts`
- Blockers: **DEPENDS ON Ticket 1**
- **Hooks:** `useTechStack`, `useInstalledEditors`, `useDevCommands`, `useGitInfo`, `useLaunchEditor`, `useLaunchDevServer`
- **Query Keys:** techStack, editors, devCommands, gitInfo

---

### Phase 2: UI Components (SEQUENTIAL) 🎨

All UI components depend on hooks being complete.

**Ticket 3: Create TechStackCard**

- File: `src/components/projects/TechStackCard.tsx`
- Blockers: **DEPENDS ON Ticket 2**
- Uses: `useTechStack(projectPath)`

**Ticket 4: Create GitHistoryCard** ⚡ KEY CHANGE

- File: `src/components/projects/GitHistoryCard.tsx`
- Blockers: **DEPENDS ON Ticket 2**
- Uses: `useGitInfo(projectPath)`
- **REMOVED:** "Initialize Git" button (not destructive for V1)
- Shows: "Git not initialized" message with no action
- **HAS:** "View Git History →" button to open git log in terminal

**Ticket 5: Create EditorLauncher** ⚡ KEY CHANGE

- File: `src/components/projects/EditorLauncher.tsx`
- Blockers: **DEPENDS ON Ticket 2**
- Uses: `useInstalledEditors()`, `useLaunchEditor()`
- **Supported Editors (V1):**
  - VS Code
  - Cursor
  - Codex
  - OpenCode
- **Skipped (V2):** Vim, Neovim

**Ticket 6: Create DevServerPicker**

- File: `src/components/projects/DevServerPicker.tsx`
- Blockers: **DEPENDS ON Ticket 2**
- Uses: `useDevCommands()`, `useLaunchDevServer()`
- **SAFETY:** Only allows commands from `detectDevCommands()` output
- Validates command is in detected list before launching

**Ticket 7: Create DevHubToolbar**

- File: `src/components/projects/DevHubToolbar.tsx`
- Blockers: **DEPENDS ON Tickets 3-6**
- Embeds: EditorLauncher, DevServerPicker
- Displays: TechStackCard, GitHistoryCard
- Buttons: [Open in Editor] [New Terminal] [Start Dev Server] [View README]

---

### Phase 3: Integration (FINAL) 🔗

**Ticket 8: Integrate into project detail page**

- File: `src/routes/projects.$projectId.tsx`
- Blockers: **DEPENDS ON ALL UI Tickets**
- Adds toolbar + cards above epic list
- 10 end-to-end tests
- Quality checks: type-check, lint, test

---

## Dependency Chain (Visual)

```
Ticket 1: dev-tools.ts
    ↓
Ticket 2: hooks + query-keys
    ↓
    ├─→ Ticket 3: TechStackCard
    ├─→ Ticket 4: GitHistoryCard (no "Initialize Git")
    ├─→ Ticket 5: EditorLauncher (VS Code/Cursor/Codex/OpenCode only)
    ├─→ Ticket 6: DevServerPicker (validated commands)
    └─→ Ticket 7: DevHubToolbar (embeds all above)
        ↓
Ticket 8: Integration + end-to-end tests
```

---

## Key Architectural Constraints

### 1. Pure Launcher Functions

```typescript
// @pure - No side effects on ticket state
export const launchEditor = createServerFn({ method: "POST" })
  .inputValidator(...)
  .handler(async ({ data }) => {
    // Only returns success/message
    // Does NOT call workflow.start() or any ticket mutations
    return { success: true, message: "VS Code opened" };
  });
```

### 2. Command Validation (Safety)

```typescript
// DevServerPicker MUST validate commands
export const launchDevServer = createServerFn({ method: "POST" }).inputValidator(
  ({ projectPath, command }) => {
    // Only accept commands from detectDevCommands() output
    const detected = await detectDevCommands(projectPath);
    const isValid = detected.some((cmd) => cmd.command === command);
    if (!isValid) throw new Error("Command not detected - security risk");
    return true;
  }
);
```

### 3. Read-Only Hub (V1)

- No "Initialize Git" button
- No "Install Editor" action button
- No "Create Makefile" or auto-setup
- Just informational + launching existing tools

### 4. Reuse Existing Patterns

- Terminal detection: `detectTerminal()` from `terminal-utils.ts`
- Editor detection: `isVSCodeInstalled()` from `terminal.ts`
- Terminal building: `buildTerminalCommand()` from `terminal-utils.ts`

---

## Files Summary

### New Files to Create

- `src/api/dev-tools.ts` (consolidated from dev-tools + git-info)
- `src/components/projects/DevHubToolbar.tsx`
- `src/components/projects/EditorLauncher.tsx`
- `src/components/projects/DevServerPicker.tsx`
- `src/components/projects/TechStackCard.tsx`
- `src/components/projects/GitHistoryCard.tsx`

### Files to Modify

- `src/routes/projects.$projectId.tsx` (add toolbar + cards)
- `src/lib/hooks/projects.ts` (add 6 hooks)
- `src/lib/query-keys.ts` (add 4 query keys)

### Files NOT Touched (for V1)

- `src/api/terminal.ts` (reuse, don't modify)
- `src/api/terminal-utils.ts` (reuse, don't modify)
- `src/api/settings.ts` (reuse, don't modify)

---

## Implementation Order (DO THIS IN SEQUENCE)

1. ✅ **Backend First**
   - Implement `src/api/dev-tools.ts` with all 6 functions
   - Test each function independently
   - No UI yet

2. ✅ **Hooks Second**
   - Add hooks to `src/lib/hooks/projects.ts`
   - Add keys to `src/lib/query-keys.ts`
   - All hooks depend on dev-tools.ts

3. ✅ **UI Third**
   - TechStackCard (simplest, no mutations)
   - GitHistoryCard (no "Initialize Git")
   - EditorLauncher (reduced scope: 4 editors only)
   - DevServerPicker (command validation)
   - DevHubToolbar (orchestrates all)

4. ✅ **Integration Last**
   - Assemble all components in project detail page
   - Run 10 end-to-end tests
   - Polish responsive layout

---

## Success Criteria (Updated)

### Functional ✓

- [x] Tech stack detection (Node.js, Go, Rust, Python)
- [x] Editor launch (VS Code, Cursor, Codex, OpenCode only)
- [x] Terminal launch (correct directory)
- [x] Dev server launch (validated commands from package.json/Makefile)
- [x] Git history display (recent commits, no "Initialize Git")
- [x] README opener (if file exists)

### Safety ✓

- [x] All launchers marked @pure (no side effects)
- [x] Dev commands validated against detected list only
- [x] No arbitrary shell execution
- [x] No destructive actions (git init, file creation, etc.)

### Engineering ✓

- [x] Sequential dependencies clearly marked
- [x] Reuses existing patterns from terminal.ts, terminal-utils.ts
- [x] All tests pass (type-check, lint, unit, e2e)
- [x] No performance regression
- [x] Responsive on mobile and desktop

---

## Migration from Old Tickets

**OLD TICKETS** (from original plan):

- `80722270...`: Backend: Create dev-tools.ts
- `642ce41e...`: Backend: Create git-info.ts
- `d3bf08c6...`: Backend: Add hooks and query keys
- `bccaf6f1...`: UI: Create TechStackCard
- `aed01f2f...`: UI: Create GitHistoryCard
- `eada9e08...`: UI: Create EditorLauncher
- `8e107160...`: UI: Create DevServerPicker
- `443d0d8d...`: UI: Create DevHubToolbar
- `b3397f13...`: Integration: Assemble dev hub

**CHANGES:**

- Consolidate git-info.ts into dev-tools.ts (one ticket)
- Reduce EditorLauncher scope: 4 editors, not 6
- Remove "Initialize Git" from GitHistoryCard
- All tickets remain, no deletions needed
- Just update descriptions to reflect these constraints

---

## Next Steps

1. Update ticket descriptions with these constraints
2. Mark dependencies in tickets clearly
3. Start with dev-tools.ts (no blockers)
4. All other work waits for backend to complete
5. Run all tests before integration

**Ready to begin? Start with dev-tools.ts** ✅
