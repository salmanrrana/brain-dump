# CLI Launch Parity - Integration Strategy

**Ticket:** `55ffc9a5-b059-46ba-b5f4-6f1e61175e9e`
**Date:** 2026-04-16
**Status:** Recommended

---

## 1. Context

Brain Dump's UI has a "Launch" menu that kicks off a Ralph loop for an epic or ticket with a chosen AI backend (claude-code, vscode, cursor, cursor-agent, copilot-cli, codex, opencode). This is implemented in `src/api/ralph.ts` via `launchRalphForEpic` / `launchRalphForTicket` server functions.

The CLI currently has **no equivalent** — `workflow start-epic` only flips DB state; there is no `--provider` flag anywhere.

**Goal:** Add `brain-dump workflow launch-epic` and `workflow launch-ticket` CLI commands with `--provider <name>`, `--terminal <name>`, `--max-iterations <n>`, `--sandbox` flags.

---

## 2. Decision

**Recommended: Strategy A — Extract launcher core into a shared module**

Move the meaty parts of `launchRalphForTicket` / `launchRalphForEpic` out of `createServerFn({...}).handler(...)` into pure async functions in a new `src/lib/ralph-launch/` module. Keep the server function as a thin wrapper. CLI imports the same pure function directly.

---

## 3. Rationale

### 3.1 Behavioral Parity

- **A (shared module):** 100% behavioral parity. CLI calls identical code paths as UI.
- B (HTTP): Behavioral parity only if server is running; introduces HTTP failure modes (connection refused, timeouts, CORS).

### 3.2 Testability

- **A:** Core functions are plain async functions — trivial to unit test, can run without Nitro server.
- B: Requires running server, HTTP client setup, mocking network layer.

### 3.3 Offline Use

- **A:** Works fully offline. CLI doesn't need dev server.
- B: Requires `localhost:4242` to be reachable. Fails if server isn't running.

### 3.4 Error Surfaces

- **A:** Single code path, single error handling strategy.
- B: Adds HTTP errors (connection refused, 502, timeout), server errors, network partition.

### 3.5 Complexity

- **A:** Refactoring to extract pure functions, then thin wrappers. One-time cost.
- B: HTTP client setup, endpoint routing, auth (if protected), CORS config.

### 3.6 Conclusion

**Strategy A wins on all dimensions.** The refactoring is straightforward because the launch logic is already well-separated from TanStack Start internals.

---

## 4. Architecture

### 4.1 New Module Structure

```
src/lib/ralph-launch/
├── launch-ticket.ts      # launchRalphForTicketCore(db, input): Promise<Result>
├── launch-epic.ts        # launchRalphForEpicCore(db, input): Promise<Result>
├── launchers.ts          # VSCode, Cursor, CopilotCli, Terminal launchers
├── script.ts             # generateRalphScript()
├── prompts.ts            # generateEnhancedPRD(), generateVSCodeContext(), writeVSCodeContext()
├── docker.ts             # getDockerHostEnvValue(), validateDockerSetup()
└── terminal.ts           # detectTerminal(), buildTerminalCommand(), isTerminalAvailable()
```

### 4.2 Refactored `src/api/ralph.ts`

```typescript
// Thin wrappers only — delegate to core
export const launchRalphForTicket = createServerFn({ method: "POST" })
  .inputValidator((data: LaunchTicketInput) => data)
  .handler(async ({ data }) => launchRalphForTicketCore(db, data));

export const launchRalphForEpic = createServerFn({ method: "POST" })
  .inputValidator((data: LaunchEpicInput) => data)
  .handler(async ({ data }) => launchRalphForEpicCore(db, data));
```

### 4.3 CLI Integration (`cli/commands/workflow.ts`)

```typescript
import { launchRalphForTicketCore, launchRalphForEpicCore } from "../../src/lib/ralph-launch/launch-ticket.ts";
import { launchRalphForEpicCore } from "../../src/lib/ralph-launch/launch-epic.ts";

// In handle():
case "launch-ticket": {
  const ticketId = requireFlag(flags, "ticket");
  const result = await launchRalphForTicketCore(db, { ticketId, ... });
  outputResult(result, pretty);
}
case "launch-epic": {
  const epicId = requireFlag(flags, "epic");
  const result = await launchRalphForEpicCore(db, { epicId, ... });
  outputResult(result, pretty);
}
```

---

## 5. Functions to Move

### 5.1 From `src/api/ralph.ts`

| Function/Logic                      | Target Module      | Notes                |
| ----------------------------------- | ------------------ | -------------------- |
| `prepareEpicLaunch()`               | `launch-epic.ts`   | Pure function        |
| `launchRalphForTicket` handler body | `launch-ticket.ts` | Needs `db` passed in |
| `launchRalphForEpic` handler body   | `launch-epic.ts`   | Needs `db` passed in |

### 5.2 From `src/api/ralph-launchers.ts`

| Function                     | Target Module  | Notes                |
| ---------------------------- | -------------- | -------------------- |
| `escapeForBashDoubleQuote()` | `launchers.ts` | Pure utility         |
| `isCursorAgentHelpOutput()`  | `launchers.ts` | Pure utility         |
| `isCursorAgentCommand()`     | `launchers.ts` | Pure utility         |
| `findVSCodeCli()`            | `launchers.ts` | CLI discovery        |
| `findCursorCli()`            | `launchers.ts` | CLI discovery        |
| `findCursorAgentCli()`       | `launchers.ts` | CLI discovery        |
| `isCopilotCliInstalled()`    | `launchers.ts` | CLI discovery        |
| `launchInVSCode()`           | `launchers.ts` | No React deps        |
| `launchInCursor()`           | `launchers.ts` | No React deps        |
| `launchInCopilotCli()`       | `launchers.ts` | No React deps        |
| `createCopilotRalphScript()` | `launchers.ts` | No React deps        |
| `launchInTerminal()`         | `launchers.ts` | No React deps        |
| `ensureDockerNetwork()`      | `docker.ts`    | Moved from launchers |
| `validateDockerSetup()`      | `docker.ts`    | No React deps        |

### 5.3 From `src/api/ralph-script.ts`

| Function                  | Target Module | Notes                           |
| ------------------------- | ------------- | ------------------------------- |
| `generateRalphScript()`   | `script.ts`   | Pure function, no TanStack deps |
| `DEFAULT_RESOURCE_LIMITS` | `script.ts`   | Constant                        |
| `DEFAULT_TIMEOUT_SECONDS` | `script.ts`   | Constant                        |
| `RalphAiBackend` type     | `script.ts`   | Shared type                     |

### 5.4 From `src/api/ralph-prompts.ts`

| Function                   | Target Module | Notes          |
| -------------------------- | ------------- | -------------- |
| `generateEnhancedPRD()`    | `prompts.ts`  | Pure function  |
| `generateVSCodeContext()`  | `prompts.ts`  | Pure function  |
| `writeVSCodeContext()`     | `prompts.ts`  | Async file I/O |
| `RalphPromptProfile` types | `prompts.ts`  | Shared types   |

### 5.5 From `src/api/terminal-utils.ts`

Entire file moves to `src/lib/ralph-launch/terminal.ts` — no React deps.

### 5.6 From `src/api/docker-utils.ts`

| Function                  | Target Module              | Notes                         |
| ------------------------- | -------------------------- | ----------------------------- |
| `getDockerHostEnvValue()` | `docker.ts`                | No React deps                 |
| `execDockerCommand()`     | Stays in `docker-utils.ts` | Used by `validateDockerSetup` |

---

## 6. Provider Launch Paths

All provider paths are **pure** — no React hooks, no toast calls, no `useSettings`. They use only async file I/O, `child_process.exec`, and database lookups via passed handles.

### 6.1 claude-code (auto) — Terminal Launch

```
workingMethod !== vscode/cursor/copilot-cli
→ generateRalphScript() → writeFileSync → chmod → launchInTerminal()
→ spawns: claude --dangerously-skip-permissions -p "$(cat $PROMPT_FILE)"
```

### 6.2 vscode — Editor Launch

```
workingMethod === "vscode"
→ generateVSCodeContext() → writeVSCodeContext() → launchInVSCode()
→ spawns: "code" -n "/path/to/project" -g "/path/to/context.md"
```

### 6.3 cursor — Editor Launch

```
workingMethod === "cursor"
→ generateVSCodeContext() → writeVSCodeContext() → launchInCursor()
→ spawns: "cursor" -n "/path/to/project" -g "/path/to/context.md"
```

### 6.4 copilot-cli — Terminal Launch

```
workingMethod === "copilot-cli"
→ generateVSCodeContext() → writeVSCodeContext() → launchInCopilotCli()
→ createCopilotRalphScript() → launchInTerminal()
→ spawns: copilot --yolo/-p "$CONTENT"
```

### 6.5 cursor-agent — Terminal Launch

```
workingMethod === "auto" && aiBackend === "cursor-agent"
→ generateRalphScript() with aiBackend="cursor-agent" → writeFileSync → chmod → launchInTerminal()
→ spawns: agent --force --approve-mcps --trust -p "$(cat $PROMPT_FILE)"
```

### 6.6 codex — Terminal Launch

```
workingMethod === "auto" && aiBackend === "codex"
→ generateRalphScript() with aiBackend="codex" → writeFileSync → chmod → launchInTerminal()
→ spawns: codex "$(cat $PROMPT_FILE)"
```

### 6.7 opencode — Terminal Launch

```
workingMethod === "auto" && aiBackend === "opencode"
→ generateRalphScript() with aiBackend="opencode" → writeFileSync → chmod → launchInTerminal()
→ spawns: opencode "$PROJECT_PATH" --prompt "$(cat $PROMPT_FILE)"
```

### 6.8 sandbox (Docker) — Terminal Launch

```
useSandbox === true
→ validateDockerSetup() → generateRalphScript() with Docker wrapper
→ writeFileSync → chmod → launchInTerminal()
→ spawns: docker run --rm -it ... brain-dump-ralph-sandbox:latest claude ...
```

---

## 7. UI-Only Dependencies Audit

**None found.** Every function in the launch chain has no React or browser dependencies:

- File I/O: Node.js `fs` module (works in CLI)
- Database: passed `db` handle (same as `core/` modules)
- `child_process.exec`: Node.js built-in
- Terminal detection: pure async functions reading PATH

The only TanStack Start artifact is `createServerFn` itself — which is only in the wrapper, not the core.

---

## 8. Constraints

1. **No behavior change** — same artifacts, same terminal command, same session creation, same telemetry
2. **No TanStack imports** in the shared module — pure async functions only
3. **DB access** stays via passed `db` handle (same pattern as `core/`)
4. **Settings, Docker, terminal launchers** must be callable without a running HTTP server
5. **All existing tests** continue to pass unchanged

---

## 9. Next Steps (for downstream tickets)

1. **651602d3** — Extract launcher core into `src/lib/ralph-launch/` module
2. **20737b18** — Add `workflow launch-ticket` and `workflow launch-epic` CLI commands
3. **fd95aa02** — E2E verification across all providers + docs update
