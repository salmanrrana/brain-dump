# Core Logic Extraction + CLI + MCP Consolidation Spec

> **Epic**: Core Extraction & CLI Migration
> **Author**: Claude + Salman
> **Status**: Draft

---

## 1. Overview

**What is this?**

Brain Dump's MCP server has 55 tools with business logic embedded directly in MCP handler functions. This makes the logic untestable in isolation, impossible to call from a CLI, and creates massive context overhead for AI providers (55 tool schemas loaded per session).

This spec extracts all business logic into a shared `core/` layer, builds CLI commands on top of it, and consolidates the MCP server from 55 tools down to ~8 resource-based tools. Both interfaces (CLI + MCP) call the same core functions, meaning behavior is identical and independently verifiable.

- **Problem being solved**: Logic is locked inside MCP handlers. AI providers burn context on 55 tool schemas. There's no way to test workflow steps from the command line. Three interfaces (MCP server, TanStack Start server functions, CLI) exist but don't share logic.
- **User value delivered**: CLI commands for every workflow step (testable, composable, scriptable). Massive context reduction for AI sessions. Single source of truth for all business logic. Cross-provider compatibility (Claude Code, OpenCode, Cursor, VS Code).
- **How it fits into the system**: The `core/` layer sits between the data layer (SQLite) and all interface layers (MCP, CLI, TanStack Start server functions). No interface talks to the database directly anymore — everything goes through core.

### Key Insight

> **"The MCP server is a UI for AI. The CLI is a UI for humans and scripts. Neither should contain business logic."** Both should be thin wrappers over a shared core that is independently testable and verifiable.

---

## 2. Reference Tables

### Resource Mapping (55 tools → 8 resources)

| Resource    | CLI Command                     | MCP Tool Name     | Actions                                                                                            | Current Tool Count     |
| ----------- | ------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------- |
| `ticket`    | `brain-dump ticket <action>`    | `ticket`          | create, list, get, update, delete                                                                  | 8 tools                |
| `epic`      | `brain-dump epic <action>`      | `epic`            | create, list, get, update, delete                                                                  | 4 tools                |
| `comment`   | `brain-dump comment <action>`   | `comment`         | add, list                                                                                          | 2 tools                |
| `workflow`  | `brain-dump workflow <action>`  | `workflow`        | start-work, complete-work, start-epic                                                              | 3 tools                |
| `review`    | `brain-dump review <action>`    | `review`          | submit-finding, mark-fixed, check-complete, generate-demo, get-demo, submit-feedback, get-findings | 8 tools                |
| `session`   | `brain-dump session <action>`   | `session`         | create, update, complete, get, list, emit-event, get-events, clear-events                          | 8 tools                |
| `telemetry` | `brain-dump telemetry <action>` | `telemetry`       | start, log-tool, log-prompt, log-context, end, get, list                                           | 7 tools                |
| `admin`     | `brain-dump admin <action>`     | (none - CLI only) | health, backup, restore, check, doctor                                                             | 4 tools (existing CLI) |

**Not migrated to consolidated MCP** (remain available via CLI or existing server functions):

- Conversation/compliance logging (6 tools) → `brain-dump compliance <action>` CLI only
- Claude tasks (4 tools) → `brain-dump tasks <action>` CLI only
- File linking (2 tools) → `brain-dump files <action>` CLI only
- Git integration (3 tools) → `brain-dump git <action>` CLI only
- Settings (2 tools) → `brain-dump settings <action>` CLI only

Rationale: The consolidated MCP exposes only what AI agents need during the workflow. Everything else is available via CLI. This keeps the MCP surface area minimal.

### Core Module Mapping

| Core Module          | Source MCP Files                                          | Functions Extracted                                                                                    |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `core/workflow.ts`   | `tools/workflow.ts` (49KB)                                | startWork, completeWork, startEpicWork, completeEpicWork                                               |
| `core/ticket.ts`     | `tools/tickets.ts` (28KB)                                 | createTicket, listTickets, getTicket, updateTicket, deleteTicket, updateAcceptanceCriterion            |
| `core/epic.ts`       | `tools/epics.ts` (10KB)                                   | createEpic, listEpics, getEpic, updateEpic, deleteEpic                                                 |
| `core/comment.ts`    | `tools/comments.ts` (5KB)                                 | addComment, listComments                                                                               |
| `core/review.ts`     | `tools/review-findings.ts` (18KB), `tools/demo.ts` (18KB) | submitFinding, markFixed, checkComplete, getFindings, generateDemo, getDemo, submitFeedback            |
| `core/session.ts`    | `tools/sessions.ts` (24KB), `tools/events.ts` (10KB)      | createSession, updateState, completeSession, getState, listSessions, emitEvent, getEvents, clearEvents |
| `core/telemetry.ts`  | `tools/telemetry.ts` (33KB)                               | startSession, logTool, logPrompt, logContext, endSession, getSession, listSessions                     |
| `core/git.ts`        | `tools/git.ts` (23KB)                                     | linkCommit, linkPr, syncLinks                                                                          |
| `core/files.ts`      | `tools/files.ts` (6KB)                                    | linkFiles, getTicketsForFile                                                                           |
| `core/compliance.ts` | `tools/conversations.ts` (40KB)                           | startConversation, logMessage, endConversation, listConversations, exportLogs, archiveOld              |
| `core/tasks.ts`      | `tools/claude-tasks.ts` (23KB)                            | saveTasks, getTasks, clearTasks, getSnapshots                                                          |
| `core/health.ts`     | `tools/health.ts` (12KB)                                  | getHealth, getEnvironment, getSettings, updateSettings                                                 |
| `core/project.ts`    | `tools/projects.ts` (11KB)                                | createProject, listProjects, findByPath, deleteProject                                                 |

### Error Codes

| Code                | Name                 | Description                                         |
| ------------------- | -------------------- | --------------------------------------------------- |
| `TICKET_NOT_FOUND`  | TicketNotFoundError  | Ticket ID does not exist                            |
| `EPIC_NOT_FOUND`    | EpicNotFoundError    | Epic ID does not exist                              |
| `PROJECT_NOT_FOUND` | ProjectNotFoundError | Project ID does not exist                           |
| `FINDING_NOT_FOUND` | FindingNotFoundError | Review finding ID does not exist                    |
| `SESSION_NOT_FOUND` | SessionNotFoundError | Ralph session ID does not exist                     |
| `INVALID_STATE`     | InvalidStateError    | Operation not valid in current ticket/session state |
| `INVALID_ACTION`    | InvalidActionError   | Unknown action for this resource                    |
| `GIT_ERROR`         | GitError             | Git command failed                                  |
| `PATH_NOT_FOUND`    | PathNotFoundError    | Filesystem path does not exist                      |
| `VALIDATION_ERROR`  | ValidationError      | Input validation failed                             |

---

## 3. Type Definitions

```typescript
// ============================================
// core/types.ts - Shared types for all layers
// ============================================

/**
 * Base error class for all core errors.
 * Interface layers catch these and format appropriately:
 * - MCP: { content: [{ type: "text", text: error.message }], isError: true }
 * - CLI: stderr + exit code 1
 */
export class CoreError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export class TicketNotFoundError extends CoreError {
  constructor(ticketId: string) {
    super(
      `Ticket not found: ${ticketId}. Use 'brain-dump ticket list' to see available tickets.`,
      "TICKET_NOT_FOUND",
      { ticketId }
    );
  }
}

export class InvalidStateError extends CoreError {
  constructor(resource: string, currentState: string, requiredState: string, action: string) {
    super(
      `Cannot ${action}: ${resource} is in '${currentState}' state, must be '${requiredState}'.`,
      "INVALID_STATE",
      { resource, currentState, requiredState, action }
    );
  }
}

// ... similar for all error types

/**
 * Result from starting work on a ticket.
 */
export interface StartWorkResult {
  branch: string;
  ticket: TicketWithProject;
  context: string;
  warnings: string[];
  epicBranch?: string;
}

/**
 * Result from completing work on a ticket.
 */
export interface CompleteWorkResult {
  ticketId: string;
  status: "ai_review";
  workSummary: string;
  nextSteps: string[];
  suggestedNextTicket?: { id: string; title: string } | null;
}

/**
 * Result from completing an epic.
 */
export interface CompleteEpicResult {
  epicId: string;
  totalTickets: number;
  completedTickets: number;
  skippedTickets: number;
  prUrl?: string;
  summary: string;
  learnings: string[];
}

/**
 * Review finding as submitted.
 */
export interface ReviewFinding {
  id: string;
  ticketId: string;
  iteration: number;
  agent: "code-reviewer" | "silent-failure-hunter" | "code-simplifier";
  severity: "critical" | "major" | "minor" | "suggestion";
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestedFix?: string;
  status: "open" | "fixed" | "wont_fix" | "duplicate";
  createdAt: string;
}

/**
 * Review completion check result.
 */
export interface ReviewCompletionStatus {
  complete: boolean;
  openCritical: number;
  openMajor: number;
  openMinor: number;
  openSuggestion: number;
  totalFindings: number;
  fixedFindings: number;
  message: string;
}

/**
 * Ticket with joined project data.
 */
export interface TicketWithProject {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  projectId: string;
  epicId: string | null;
  tags: string[];
  subtasks: Subtask[];
  isBlocked: boolean;
  blockedReason: string | null;
  linkedFiles: string[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  linkedCommits: Commit[];
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: string | null;
  project: {
    id: string;
    name: string;
    path: string;
  };
}

/**
 * Consolidated MCP resource tool input.
 * Each resource tool accepts an action + relevant params.
 */
export interface ResourceToolInput<A extends string> {
  action: A;
  [key: string]: unknown;
}
```

---

## 4. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         INTERFACE LAYER                              │
│                                                                      │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │
│  │ CLI          │  │ MCP Server       │  │ TanStack Start         │ │
│  │ brain-dump   │  │ (8 resource      │  │ Server Functions       │ │
│  │ <resource>   │  │  tools)          │  │ (existing, for UI)     │ │
│  │ <action>     │  │                  │  │                        │ │
│  │ [--flags]    │  │ ticket({ action, │  │ getTickets()           │ │
│  │              │  │   ticketId })    │  │ createTicket()         │ │
│  │ JSON stdout  │  │                  │  │                        │ │
│  └──────┬───────┘  └────────┬─────────┘  └───────────┬────────────┘ │
│         │                   │                         │              │
├─────────┼───────────────────┼─────────────────────────┼──────────────┤
│         │        CORE LOGIC LAYER (NEW)               │              │
│         │                                             │              │
│         └──────────────┐    │    ┌────────────────────┘              │
│                        ▼    ▼    ▼                                   │
│              ┌─────────────────────────┐                            │
│              │  core/                  │                            │
│              │  ├─ workflow.ts         │  Pure functions.           │
│              │  ├─ ticket.ts          │  Throw typed errors.       │
│              │  ├─ review.ts          │  Return typed results.     │
│              │  ├─ session.ts         │  No MCP. No CLI.          │
│              │  ├─ telemetry.ts       │  No formatting.           │
│              │  ├─ types.ts           │  Just logic.              │
│              │  ├─ errors.ts          │                            │
│              │  └─ db.ts              │                            │
│              └────────────┬────────────┘                            │
│                           │                                         │
├───────────────────────────┼─────────────────────────────────────────┤
│                    DATA LAYER                                       │
│                           ▼                                         │
│              ┌─────────────────────────┐                            │
│              │  SQLite (better-sqlite3) │                            │
│              │  XDG-compliant paths     │                            │
│              │  Drizzle schema          │                            │
│              └─────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Cross-Provider Strategy

```
┌────────────────────────────────────────────────────┐
│ Claude Code  │  Preferred: CLI (bash)              │
│              │  Fallback: MCP (8 tools)            │
│              │  Skills reference bash commands      │
├──────────────┼─────────────────────────────────────┤
│ OpenCode     │  Preferred: CLI (bash tool built-in)│
│              │  Fallback: MCP (8 tools)            │
│              │  AGENTS.md references bash commands  │
├──────────────┼─────────────────────────────────────┤
│ Cursor       │  Preferred: MCP (8 tools)           │
│              │  CLI available if bash supported     │
├──────────────┼─────────────────────────────────────┤
│ VS Code      │  MCP only (8 tools)                 │
│              │  No bash execution in Copilot        │
└──────────────┴─────────────────────────────────────┘
```

---

## 5. Design Decisions

### Why extract to `core/` instead of just wrapping CLI from MCP?

1. **Testability**: Core functions can be unit tested with a real SQLite database, no MCP protocol, no CLI parsing
2. **Type safety**: Core functions have TypeScript input/output types. CLI parses strings into these types. MCP validates with Zod into these types. The core never deals with stringly-typed data.
3. **Three consumers**: TanStack Start server functions (UI), MCP (AI providers), CLI (humans/scripts) all need the same logic. A shared core avoids triple-maintaining.
4. **Future-proofing**: If a new AI provider protocol emerges, you write a thin wrapper, not re-implement logic.

### Why resource-based MCP tools instead of keeping 55 individual tools?

1. **Context reduction**: 8 tool schemas vs 55. Each schema includes name, description, and Zod input shape. At ~200-400 tokens per tool, that's ~15K tokens saved per session.
2. **Discoverability**: An AI seeing `workflow`, `review`, `ticket` immediately understands the API surface. 55 individual tool names require reading all descriptions.
3. **Matches REST mental model**: AI models are heavily trained on REST APIs. `{ resource: "ticket", action: "update" }` is natural.
4. **Trade-off**: Slightly more complex Zod schema per tool (union of action-specific params). Acceptable given the context savings.

### Why keep MCP at all if CLI works everywhere?

1. **VS Code Copilot**: Cannot execute bash commands. MCP is the only interface.
2. **Cursor**: Bash support varies. MCP is reliable.
3. **Future providers**: MCP is becoming a standard. Having a thin MCP layer costs little and provides compatibility.
4. **Structured responses**: MCP guarantees JSON. CLI output needs parsing (though `--json` flag mitigates this).

### Why JSON output by default for CLI?

1. **AI consumption**: Claude/OpenCode reads the output. JSON is unambiguous.
2. **Composability**: `brain-dump ticket list --status ready | jq '.[0].id'` works.
3. **Human readability**: `--pretty` flag for formatted output when humans run commands.
4. **Error handling**: JSON errors have structure: `{ "error": "TICKET_NOT_FOUND", "message": "..." }` vs plain text.

### Why `completeEpicWork()` as a new function?

1. **PR lifecycle**: Epics own the PR. Completing an epic should mark the PR ready for review.
2. **Symmetry**: `startEpicWork()` exists. A corresponding completion creates a clean lifecycle.
3. **Aggregation**: Collects all ticket summaries, learnings, and findings into an epic-level report.
4. **Guard rail**: Validates all tickets are done (or explicitly skipped) before completing.

### Where does the "elegance check" live?

1. **As a skill, not a core function.** The elegance check is an AI reflection prompt, not a data operation. It reads context (ticket, files, findings) and asks the AI to reflect.
2. **Core provides the data gathering**: `review.getEleganceContext(ticketId)` returns the ticket summary, changed files, and findings. The skill formats the prompt.
3. **Result stored as a comment**: `comment.add(ticketId, { type: "elegance_review", content: ... })`. No new table needed.
4. **Gate in workflow**: Added as an optional step between `check_review_complete` and `generate_demo_script`. If the elegance check recommends a refactor, the human decides during demo review.

---

## 6. Implementation Guide

### Directory Structure (Final State)

```
core/                           # NEW - shared business logic
├── db.ts                       # Database initialization (shared instance)
├── errors.ts                   # Typed error classes
├── types.ts                    # Shared TypeScript types
├── workflow.ts                 # startWork, completeWork, startEpicWork, completeEpicWork
├── ticket.ts                   # CRUD for tickets
├── epic.ts                     # CRUD for epics
├── comment.ts                  # Add/list comments
├── review.ts                   # Findings, demo scripts, feedback
├── session.ts                  # Ralph sessions + events
├── telemetry.ts                # Telemetry session tracking
├── git.ts                      # Commit/PR linking
├── files.ts                    # File linking
├── compliance.ts               # Enterprise conversation logging
├── tasks.ts                    # Claude task snapshots
├── health.ts                   # Database health, environment detection
├── project.ts                  # Project CRUD
└── __tests__/                  # Unit tests for core logic
    ├── workflow.test.ts
    ├── ticket.test.ts
    ├── review.test.ts
    └── ...

cli/
├── brain-dump.ts               # Main CLI entry point (extended)
├── commands/                   # NEW - command handlers
│   ├── workflow.ts             # brain-dump workflow <action>
│   ├── ticket.ts               # brain-dump ticket <action>
│   ├── epic.ts                 # brain-dump epic <action>
│   ├── comment.ts              # brain-dump comment <action>
│   ├── review.ts               # brain-dump review <action>
│   ├── session.ts              # brain-dump session <action>
│   ├── telemetry.ts            # brain-dump telemetry <action>
│   ├── git.ts                  # brain-dump git <action>
│   ├── files.ts                # brain-dump files <action>
│   ├── compliance.ts           # brain-dump compliance <action>
│   ├── tasks.ts                # brain-dump tasks <action>
│   └── admin.ts                # brain-dump backup/check/doctor (existing, reorganized)
└── lib/
    ├── output.ts               # JSON/pretty output formatting
    └── args.ts                 # Argument parsing helpers

mcp-server/
├── index.ts                    # Server init (registers 8 resource tools)
├── tools/                      # SIMPLIFIED - thin wrappers
│   ├── ticket.ts               # One tool: ticket({ action, ... })
│   ├── epic.ts                 # One tool: epic({ action, ... })
│   ├── comment.ts              # One tool: comment({ action, ... })
│   ├── workflow.ts             # One tool: workflow({ action, ... })
│   ├── review.ts               # One tool: review({ action, ... })
│   ├── session.ts              # One tool: session({ action, ... })
│   ├── telemetry.ts            # One tool: telemetry({ action, ... })
│   └── health.ts               # One tool: admin({ action, ... })
├── lib/                        # Kept: MCP-specific utilities only
│   ├── logging.ts
│   └── format.ts               # NEW: core result → MCP content formatting
└── types.ts                    # MCP-specific types only
```

### Ticket Breakdown

All tickets live under one epic, one branch, one PR.

#### Ticket 1: Create `core/` foundation (errors, types, db)

**Files to create:**

- `core/errors.ts` - All typed error classes
- `core/types.ts` - All shared TypeScript interfaces
- `core/db.ts` - Database initialization (extract from `mcp-server/lib/database.ts`)

**Acceptance criteria:**

- [ ] All error classes defined with codes matching the error table above
- [ ] All result types defined for every core function
- [ ] Database initializer works standalone (not tied to MCP server)
- [ ] `pnpm type-check` passes

#### Ticket 2: Extract `core/ticket.ts` and `core/project.ts`

**Extract from:** `mcp-server/tools/tickets.ts` (28KB), `mcp-server/tools/projects.ts` (11KB)

**Functions:**

- `createTicket(db, params)` → `TicketWithProject`
- `listTickets(db, filters)` → `TicketWithProject[]`
- `getTicket(db, ticketId)` → `TicketWithProject`
- `updateTicketStatus(db, ticketId, status)` → `TicketWithProject`
- `updateAcceptanceCriterion(db, ticketId, criterionId, status, note?)` → `Ticket`
- `deleteTicket(db, ticketId, confirm)` → `DeleteResult`
- `createProject(db, params)` → `Project`
- `listProjects(db)` → `Project[]`
- `findProjectByPath(db, path)` → `Project | null`
- `deleteProject(db, projectId, confirm)` → `DeleteResult`

**Acceptance criteria:**

- [ ] All functions extracted with typed inputs/outputs
- [ ] Throw `TicketNotFoundError` / `ProjectNotFoundError` instead of returning MCP error objects
- [ ] Unit tests for each function using real SQLite in-memory database
- [ ] MCP tool handlers updated to call core functions (thin wrappers)
- [ ] Existing MCP behavior unchanged (regression test)

#### Ticket 3: Extract `core/epic.ts` and `core/comment.ts`

**Extract from:** `mcp-server/tools/epics.ts` (10KB), `mcp-server/tools/comments.ts` (5KB)

**Functions:**

- `createEpic(db, params)` → `Epic`
- `listEpics(db, projectId)` → `Epic[]`
- `updateEpic(db, epicId, params)` → `Epic`
- `deleteEpic(db, epicId, confirm)` → `DeleteResult`
- `addComment(db, ticketId, params)` → `Comment`
- `listComments(db, ticketId)` → `Comment[]`

**Acceptance criteria:**

- [ ] Same pattern as Ticket 2
- [ ] Unit tests with in-memory SQLite
- [ ] MCP wrappers updated

#### Ticket 4: Extract `core/workflow.ts` (the big one)

**Extract from:**

- `mcp-server/tools/workflow.ts` (49KB)
- `src/api/start-ticket-workflow.ts` (400 lines — ABSORB into core, then DELETE)
- `mcp-server/lib/git-utils.ts` (shared git helpers — move to `core/git-utils.ts`)

**Functions:**

- `startWork(db, ticketId)` → `StartWorkResult`
- `completeWork(db, ticketId, summary?)` → `CompleteWorkResult`
- `startEpicWork(db, epicId, createPr?)` → `StartEpicWorkResult`

**Key extraction challenges:**

- `startWork` does git operations, status updates, context building, conversation session creation — all need to be in core but git operations need the project path
- `src/api/start-ticket-workflow.ts` is already a proto-core function used by BOTH UI launches and MCP. It has duplicated git utils (lines 28-64 are copy-pasted from mcp-server). Must be absorbed into core as the single implementation.
- `completeWork` updates PRD files, suggests next ticket — PRD logic stays in core
- Telemetry self-logging (currently inline) moves to a decorator/wrapper pattern
- After extraction: `src/api/ralph.ts` must import from core instead of `start-ticket-workflow.ts`

**Acceptance criteria:**

- [ ] All 3 functions extracted
- [ ] `src/api/start-ticket-workflow.ts` DELETED — replaced by `core/workflow.ts`
- [ ] `src/api/ralph.ts` updated to import `startWork` / `startEpicWork` from core
- [ ] Git operations in `core/git-utils.ts` (single copy, no duplication)
- [ ] Git operations abstracted behind interface (testable with mocks for git, real db for everything else)
- [ ] Unit tests for state transitions and error cases
- [ ] Integration tests for full startWork → completeWork flow
- [ ] UI Ralph launch still works after wiring change (manual verification)

#### Ticket 5: Extract `core/review.ts`

**Extract from:** `mcp-server/tools/review-findings.ts` (18KB), `mcp-server/tools/demo.ts` (18KB)

**Functions:**

- `submitFinding(db, params)` → `ReviewFinding`
- `markFixed(db, findingId, status, description?)` → `ReviewFinding`
- `getFindings(db, ticketId, filters?)` → `ReviewFinding[]`
- `checkComplete(db, ticketId)` → `ReviewCompletionStatus`
- `generateDemo(db, ticketId, steps)` → `DemoScript`
- `getDemo(db, ticketId)` → `DemoScript | null`
- `updateDemoStep(db, demoScriptId, stepOrder, status, notes?)` → `DemoScript`
- `submitFeedback(db, ticketId, passed, feedback, stepResults?)` → `FeedbackResult`

**Acceptance criteria:**

- [ ] State validation (ticket must be in ai_review for findings)
- [ ] Review iteration auto-increment logic preserved
- [ ] Demo generation validates all critical/major findings fixed
- [ ] Unit tests for each function

#### Ticket 6: Extract `core/session.ts` and `core/telemetry.ts`

**Extract from:** `mcp-server/tools/sessions.ts` (24KB), `mcp-server/tools/events.ts` (10KB), `mcp-server/tools/telemetry.ts` (33KB)

**Functions:**

- Session: createSession, updateState, completeSession, getState, listSessions
- Events: emitEvent, getEvents, clearEvents
- Telemetry: startSession, logTool, logPrompt, logContext, endSession, getSession, listSessions

**Acceptance criteria:**

- [ ] State machine transitions validated (idle → analyzing → implementing → ...)
- [ ] Ralph state file (`.claude/ralph-state.json`) management in core
- [ ] Telemetry correlation ID logic preserved
- [ ] Unit tests for state transitions

#### Ticket 7: Extract remaining core modules

**Extract from:** `mcp-server/tools/git.ts`, `files.ts`, `conversations.ts`, `claude-tasks.ts`, `health.ts`, `learnings.ts`

**Creates:**

- `core/git.ts` - linkCommit, linkPr, syncLinks
- `core/files.ts` - linkFiles, getTicketsForFile
- `core/compliance.ts` - conversation session CRUD, export, archival
- `core/tasks.ts` - saveTasks, getTasks, clearTasks, getSnapshots
- `core/health.ts` - getHealth, getEnvironment, getSettings, updateSettings
- `core/learnings.ts` - reconcileLearnings, getEpicLearnings

**Acceptance criteria:**

- [ ] All functions extracted
- [ ] Unit tests
- [ ] MCP wrappers updated

#### Ticket 8: Build CLI commands

**Depends on:** Tickets 1-7

**Creates:** All `cli/commands/*.ts` files + `cli/lib/output.ts` + `cli/lib/args.ts`

**CLI structure:**

```bash
brain-dump <resource> <action> [--flags]

# Output: JSON by default, --pretty for human-readable
# Errors: JSON to stderr, exit code 1
# Success: JSON to stdout, exit code 0
```

**Full command list:**

```bash
# Workflow
brain-dump workflow start-work --ticket <id>
brain-dump workflow complete-work --ticket <id> [--summary "..."]
brain-dump workflow start-epic --epic <id> [--create-pr]
brain-dump workflow complete-epic --epic <id>

# Tickets
brain-dump ticket create --project <id> --title "..." [--priority high] [--epic <id>]
brain-dump ticket list [--project <id>] [--status ready] [--limit 20]
brain-dump ticket get --ticket <id>
brain-dump ticket update --ticket <id> --status <status>
brain-dump ticket delete --ticket <id> [--confirm]

# Epics
brain-dump epic create --project <id> --title "..."
brain-dump epic list --project <id>
brain-dump epic update --epic <id> [--title "..."] [--description "..."]
brain-dump epic delete --epic <id> [--confirm]

# Comments
brain-dump comment add --ticket <id> --content "..." [--type work_summary]
brain-dump comment list --ticket <id>

# Review
brain-dump review submit-finding --ticket <id> --severity major --agent code-reviewer --category "type-safety" --description "..."
brain-dump review mark-fixed --finding <id> --status fixed [--description "..."]
brain-dump review check-complete --ticket <id>
brain-dump review generate-demo --ticket <id> --steps-file <path>
brain-dump review get-demo --ticket <id>
brain-dump review submit-feedback --ticket <id> --passed [--feedback "..."]
brain-dump review get-findings --ticket <id> [--status open] [--severity critical]

# Sessions
brain-dump session create --ticket <id>
brain-dump session update --session <id> --state implementing
brain-dump session complete --session <id> --outcome success
brain-dump session get [--session <id>] [--ticket <id>]
brain-dump session list --ticket <id>

# Git
brain-dump git link-commit --ticket <id> --hash <sha>
brain-dump git link-pr --ticket <id> --pr <number>
brain-dump git sync --ticket <id>

# Admin (existing, reorganized)
brain-dump admin backup [--list]
brain-dump admin restore [<filename>] [--latest]
brain-dump admin check [--full]
brain-dump admin doctor
brain-dump admin health
```

**Acceptance criteria:**

- [ ] Every command works end-to-end
- [ ] JSON output parseable by `jq`
- [ ] `--pretty` flag produces human-readable output
- [ ] `--help` for every resource and action
- [ ] Exit code 0 on success, 1 on error
- [ ] Integration tests: run CLI commands against real SQLite
- [ ] Existing `brain-dump backup/check/doctor` commands still work (backward compat)

#### Ticket 9: Consolidate MCP server (55 → 8 tools)

**Depends on:** Tickets 1-7

**Rewrites:** `mcp-server/tools/*.ts` to be thin wrappers

**Each MCP tool:**

1. Validates `action` parameter
2. Validates action-specific parameters with Zod
3. Calls core function
4. Formats result as MCP content blocks
5. Catches `CoreError` and returns `{ isError: true }`

**Example (workflow tool):**

```typescript
server.tool(
  "workflow",
  {
    action: z.enum(["start-work", "complete-work", "start-epic", "complete-epic"]),
    ticketId: z.string().optional(),
    epicId: z.string().optional(),
    summary: z.string().optional(),
    createPr: z.boolean().optional(),
  },
  async (params) => {
    try {
      switch (params.action) {
        case "start-work":
          return format(await startWork(db, params.ticketId!));
        case "complete-work":
          return format(await completeWork(db, params.ticketId!, params.summary));
        case "start-epic":
          return format(await startEpicWork(db, params.epicId!, params.createPr));
        case "complete-epic":
          return format(await completeEpicWork(db, params.epicId!));
      }
    } catch (e) {
      return formatError(e);
    }
  }
);
```

**Acceptance criteria:**

- [ ] 8 resource tools registered (ticket, epic, comment, workflow, review, session, telemetry, admin)
- [ ] All existing MCP functionality preserved
- [ ] OpenCode config updated (8 tools instead of 13)
- [ ] Claude Code MCP config updated
- [ ] Integration tests: call each tool via MCP protocol

#### Ticket 10: Wire up end-to-end integration (skills, hooks, configs, prompts)

**Depends on:** Tickets 8-9

This is the capstone ticket that plugs everything together. See Section 7 (End-to-End Integration) for the full trace of what must be wired.

**Hook matchers (settings.json):**

- [ ] Update 6 matchers in `~/.claude/settings.json` to match new CLI commands or consolidated MCP tool names
- [ ] Update `scripts/setup-claude-code.sh` to install correct matchers

**Hook scripts (24 scripts in .claude/hooks/):**

- [ ] Update `create-pr-on-ticket-start.sh` — new trigger matcher
- [ ] Update `spawn-next-ticket.sh` — new trigger matcher
- [ ] Update `record-state-change.sh` — new trigger matchers (3 tools)
- [ ] Update `clear-pending-links.sh` — new trigger matcher
- [ ] Update `link-commit-to-ticket.sh` — output text references CLI commands
- [ ] Update `check-pending-links.sh` — output text references CLI commands
- [ ] Update `start-telemetry-session.sh` — output text references CLI commands
- [ ] Update `end-telemetry-session.sh` — output text references CLI commands

**Ralph prompt (`getRalphPrompt()` in src/api/ralph.ts):**

- [ ] Update all 8+ MCP tool references to CLI commands or consolidated names
- [ ] Make prompt environment-aware (CLI for Claude Code/OpenCode, MCP for VS Code)

**Skills:**

- [ ] Update `brain-dump-workflow` skill — 5-step MCP sequence → CLI commands
- [ ] Update `/next-task` skill
- [ ] Update `/review-ticket` skill
- [ ] Update `/demo` skill
- [ ] Update `/reconcile-learnings` skill

**Provider configs:**

- [ ] Update OpenCode `AGENTS.md` — reference CLI commands
- [ ] Update OpenCode `opencode.json` — 8 consolidated tools
- [ ] Update Cursor config — tool names
- [ ] Update VS Code config — tool names

**Setup scripts:**

- [ ] Update `scripts/setup-claude-code.sh` — hook matchers + MCP config
- [ ] Update `scripts/setup-opencode.sh` — tool names
- [ ] Update `scripts/setup-cursor.sh` — hook + MCP config
- [ ] Update `scripts/setup-vscode.sh` — MCP config

**CLAUDE.md:**

- [ ] Update architecture docs to reflect core/ layer
- [ ] Update MCP tool references
- [ ] Update hook documentation table

**End-to-end verification (ALL must pass):**

- [ ] Flow 1: UI → Ralph Launch (Claude Code) → terminal opens → workflow completes
- [ ] Flow 2: UI → Ralph Launch (OpenCode) → terminal opens → workflow completes
- [ ] Flow 3: Direct CLI workflow (start → complete → review → demo)
- [ ] Flow 4: Hook integration (PR auto-create, commit linking, next-ticket spawn)
- [ ] Flow 5: Kanban drag-drop still works (should be unaffected)

#### (Future) Ticket 11: Add `completeEpicWork` functionality — DEFERRED

#### (Future) Ticket 12: Add elegance check skill — DEFERRED

---

## 7. End-to-End Integration (Critical — Do Not Skip)

This section addresses every connection point that must be wired up for the system to work after migration. Based on a full trace of all UI → server → MCP → database flows.

### 7.1 The `start-ticket-workflow.ts` Problem

**File:** `src/api/start-ticket-workflow.ts` (400 lines)

This file is ALREADY a proto-core function. Both the UI (via `launchRalphForTicket()` in `src/api/ralph.ts`) and the MCP server (`start_ticket_work` tool) call it. It even has **duplicated git utilities** inlined from `mcp-server/lib/git-utils.ts` (lines 28-64 are copy-pasted).

**Resolution:** This file gets absorbed into `core/workflow.ts` during Ticket 4. After extraction:

- `src/api/ralph.ts` imports `startWork()` from `core/workflow.ts`
- `mcp-server/tools/workflow.ts` imports `startWork()` from `core/workflow.ts`
- `cli/commands/workflow.ts` imports `startWork()` from `core/workflow.ts`
- `src/api/start-ticket-workflow.ts` is DELETED (replaced by core)
- `mcp-server/lib/git-utils.ts` git helpers move to `core/git-utils.ts` (single copy)

### 7.2 UI Server Functions That Must Call Core

These `src/api/` server functions currently duplicate logic that exists in MCP tools. After extraction, they must call core functions:

| Server Function          | File                               | Must Call                        |
| ------------------------ | ---------------------------------- | -------------------------------- |
| `startTicketWorkflow()`  | `src/api/start-ticket-workflow.ts` | `core/workflow.startWork()`      |
| `startEpicWorkflow()`    | `src/api/start-ticket-workflow.ts` | `core/workflow.startEpicWork()`  |
| `launchRalphForTicket()` | `src/api/ralph.ts`                 | Uses `startWork()` via above     |
| `launchRalphForEpic()`   | `src/api/ralph.ts`                 | Uses `startEpicWork()` via above |

Note: `updateTicketStatus()` in `src/api/tickets.ts` (kanban drag-drop) does NOT need to change — it's a simple DB update with no workflow logic. It stays as-is.

### 7.3 Hook Matchers Must Be Updated

The Claude Code hook system uses **matchers** in `~/.claude/settings.json` that trigger on specific MCP tool names. These matchers currently reference old 55-tool names:

| Current Matcher                           | Hook Triggered                 | New Matcher (CLI mode)                      | New Matcher (MCP mode)                               |
| ----------------------------------------- | ------------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| `mcp__brain-dump__start_ticket_work`      | `create-pr-on-ticket-start.sh` | `Bash(brain-dump workflow start-work:*)`    | `mcp__brain-dump__workflow` (check action in script) |
| `mcp__brain-dump__complete_ticket_work`   | `spawn-next-ticket.sh`         | `Bash(brain-dump workflow complete-work:*)` | `mcp__brain-dump__workflow` (check action in script) |
| `mcp__brain-dump__update_session_state`   | `record-state-change.sh`       | `Bash(brain-dump session update:*)`         | `mcp__brain-dump__session` (check action in script)  |
| `mcp__brain-dump__create_ralph_session`   | `record-state-change.sh`       | `Bash(brain-dump session create:*)`         | `mcp__brain-dump__session` (check action in script)  |
| `mcp__brain-dump__complete_ralph_session` | `record-state-change.sh`       | `Bash(brain-dump session complete:*)`       | `mcp__brain-dump__session` (check action in script)  |
| `mcp__brain-dump__sync_ticket_links`      | `clear-pending-links.sh`       | `Bash(brain-dump git sync:*)`               | `mcp__brain-dump__git` (check action in script)      |

**Important:** If using consolidated MCP, the matcher becomes `mcp__brain-dump__workflow` for ALL workflow actions. The hook script must then parse the tool input to determine which specific action was called (start-work vs complete-work). Alternatively, if the preferred interface is CLI, matchers become Bash patterns and this is cleaner.

### 7.4 Hook Scripts That Reference MCP Tool Names in Output

These hooks output text that tells Claude to call specific MCP tools. The text must be updated:

| Hook                         | Current Output                     | Updated Output (CLI)                             |
| ---------------------------- | ---------------------------------- | ------------------------------------------------ |
| `link-commit-to-ticket.sh`   | "Call `sync_ticket_links()`"       | "Run `brain-dump git sync --ticket <id>`"        |
| `check-pending-links.sh`     | "Call `sync_ticket_links()`"       | "Run `brain-dump git sync --ticket <id>`"        |
| `start-telemetry-session.sh` | "Call `start_telemetry_session()`" | "Run `brain-dump telemetry start --ticket <id>`" |
| `end-telemetry-session.sh`   | "Call `end_telemetry_session()`"   | "Run `brain-dump telemetry end --session <id>`"  |

### 7.5 `getRalphPrompt()` Must Be Updated

**File:** `src/api/ralph.ts`, function `getRalphPrompt()` (~line 217)

This is the SINGLE SOURCE OF TRUTH for the Ralph workflow prompt. It tells Claude which MCP tools to call. Every reference to old tool names must be updated.

**Current references (in prompt text):**

- `start_ticket_work`
- `complete_ticket_work`
- `update_session_state`
- `create_ralph_session`
- `complete_ralph_session`
- `submit_review_finding`
- `check_review_complete`
- `generate_demo_script`

**Must be updated to:** CLI commands (for Claude Code/OpenCode) or consolidated MCP tool names (for VS Code/Cursor). The prompt may need to be environment-aware.

### 7.6 Setup Scripts Must Be Updated

| Script                         | What It Configures                      | What Changes                        |
| ------------------------------ | --------------------------------------- | ----------------------------------- |
| `scripts/setup-claude-code.sh` | Hooks in `~/.claude/settings.json`      | Matcher names change                |
| `scripts/setup-opencode.sh`    | MCP config in `.opencode/opencode.json` | Tool names change (8 instead of 13) |
| `scripts/setup-cursor.sh`      | Hooks + MCP config                      | Tool names change                   |
| `scripts/setup-vscode.sh`      | MCP config                              | Tool names change                   |

### 7.7 End-to-End Verification Checklist

After all tickets are complete, verify these flows work:

**Flow 1: UI → Ralph Launch (Claude Code)**

1. Open Brain Dump UI at localhost:4242
2. Click ticket → Click "Ralph (Claude)" button
3. Verify: terminal opens, Claude starts, branch created, ticket status = in_progress
4. Verify: Claude uses CLI commands (not old MCP tools) for workflow

**Flow 2: UI → Ralph Launch (OpenCode)**

1. Click ticket → Click "Ralph (OpenCode)" button
2. Verify: terminal opens, OpenCode starts
3. Verify: OpenCode uses consolidated MCP tools OR CLI for workflow

**Flow 3: Direct CLI Workflow**

1. `brain-dump workflow start-work --ticket <id>` → branch created, status updated
2. `brain-dump workflow complete-work --ticket <id> --summary "..."` → status = ai_review
3. `brain-dump review submit-finding --ticket <id> ...` → finding recorded
4. `brain-dump review check-complete --ticket <id>` → returns status
5. `brain-dump review generate-demo --ticket <id> ...` → status = human_review

**Flow 4: Hook Integration**

1. After `brain-dump workflow start-work`, the `create-pr-on-ticket-start.sh` hook fires
2. After `git commit`, the `link-commit-to-ticket.sh` hook outputs correct CLI commands
3. After `brain-dump workflow complete-work`, the `spawn-next-ticket.sh` hook fires

**Flow 5: Kanban Drag-Drop (No Change Expected)**

1. Drag ticket between columns in UI
2. Verify status updates correctly (this path doesn't touch MCP/CLI)

---

## 8. AI Self-Verification Protocol (Mandatory Per Ticket)

Every ticket requires the AI to **prove the implementation works** before proceeding to the human demo script. This is not optional — the AI must create, run, and document verification steps as part of the ticket workflow.

### Why This Exists

The universal quality workflow has always had `generate_demo_script` for human verification. But there's a gap: the AI can write code, pass type checks, and generate a demo without ever proving the feature actually works end-to-end. This section closes that gap.

### Verification Sequence (Per Ticket)

```
1. Implement the ticket
2. Run quality gates (pnpm type-check, lint, test)
3. ★ AI SELF-VERIFICATION ★ ← NEW
   a. Run ticket-specific verification commands
   b. Capture output/results
   c. Document results in a ticket comment (type: "test_report")
   d. If any verification fails → fix and re-verify (do NOT skip)
4. complete_ticket_work (moves to ai_review)
5. Self-review (submit_review_finding, check_review_complete)
6. generate_demo_script (creates HUMAN verification steps)
7. STOP
```

### What Goes in AI Verification vs Human Demo

| AI Self-Verification (Step 3)                | Human Demo Script (Step 6)                       |
| -------------------------------------------- | ------------------------------------------------ |
| Automated, repeatable commands               | Manual steps a human follows                     |
| Proves code correctness                      | Proves user experience works                     |
| `brain-dump ticket list` returns JSON        | "Open browser, click ticket, see status update"  |
| `pnpm test src/core/workflow.test.ts` passes | "Launch Ralph, watch terminal open"              |
| CLI exit code is 0                           | "Run command, check --pretty output is readable" |
| Import compiles without error                | "Drag ticket on kanban, verify column changes"   |

### Ticket-Specific Verification Steps

Each ticket below includes its specific AI verification steps. The general pattern is:

1. **Core extraction tickets (1-7):** Run unit tests, verify imports work, call core functions directly and check return types
2. **CLI ticket (8):** Run every command with `--help`, run at least one end-to-end flow per resource, verify JSON output with `jq`
3. **MCP consolidation ticket (9):** Call each consolidated tool via test, verify backward compatibility of behavior
4. **Integration ticket (10):** Run all 5 end-to-end flows from Section 7.7

### Documenting Verification Results

After running verification, the AI posts a comment:

```bash
brain-dump comment add --ticket <id> --type test_report --content "
## AI Self-Verification Report

### Commands Run
1. \`pnpm type-check\` → PASS
2. \`pnpm test core/__tests__/workflow.test.ts\` → 12/12 PASS
3. \`brain-dump workflow start-work --ticket test-123\` → exit 0, branch created
4. \`brain-dump workflow complete-work --ticket test-123\` → exit 0, status=ai_review

### Results
All verification steps passed. Ready for self-review phase.
"
```

---

## 9. Skills + MCP Architecture Pattern

### The Pattern (from Anthropic's guidance)

> **Skills** = procedural knowledge ("how to do things")
> **MCP/CLI** = connectivity ("access to things")
> **"If you're explaining _how_ to do something, that's a skill. If you need Claude to _access_ something, that's MCP."**

A single skill can orchestrate multiple tools. A single tool can support multiple skills.

### How This Applies to Our Architecture

Our system already follows this pattern:

| Layer       | Role                                         | Example                                                         |
| ----------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Skills**  | Define workflow sequences, quality standards | `brain-dump-workflow` SKILL.md defines the 5-step sequence      |
| **MCP/CLI** | Provide data access, execute actions         | `brain-dump workflow start-work` creates branch, updates status |
| **Core**    | Business logic both consume                  | `core/workflow.startWork()` is the shared implementation        |

**Skills don't change** during this migration (except tool name references). The workflow logic ("first start work, then implement, then complete, then review, then demo") is the same whether tools are accessed via MCP or CLI.

### Cross-Provider Skills Strategy

| Provider    | Skills Mechanism                                | Tool Access                | Applies?                                          |
| ----------- | ----------------------------------------------- | -------------------------- | ------------------------------------------------- |
| Claude Code | `.claude/skills/` SKILL.md files                | CLI (preferred) or MCP     | ✅ Yes — skills reference CLI commands            |
| OpenCode    | `.opencode/skill/` SKILL.md files + `AGENTS.md` | CLI (bash built-in) or MCP | ✅ Yes — same skill content, same commands        |
| Cursor      | `.cursor/rules/` + `.cursor/skills/`            | MCP (preferred)            | ✅ Yes — skills reference consolidated MCP tools  |
| VS Code     | Copilot instructions                            | MCP only                   | ✅ Yes — skills embedded in MCP tool descriptions |

### Key Insight for Migration

During Ticket 10 (end-to-end integration), skills must be updated but NOT rewritten. The skill structure stays the same — only the tool references change:

**Before (skill references MCP tools):**

```
Step 1: Call `start_ticket_work({ ticketId })`
```

**After (skill references CLI for Claude Code/OpenCode):**

```
Step 1: Run `brain-dump workflow start-work --ticket <id>`
```

**After (skill references consolidated MCP for Cursor/VS Code):**

```
Step 1: Call workflow tool with action "start-work" and ticketId
```

The workflow logic, quality gates, and review sequence are UNCHANGED. This confirms the architecture: **skills own the "how", tools own the "access"**.

---

## 10. Testing Strategy

### Core Layer Tests

Each `core/*.ts` module gets a corresponding `core/__tests__/*.test.ts`:

- Use real SQLite in-memory database (`:memory:`)
- Run migrations to set up schema
- Test happy paths AND error cases
- Test state transitions (workflow, session)
- No mocking of database — real queries against real schema

### CLI Tests

- Integration tests that spawn `brain-dump` as a child process
- Verify JSON output structure
- Verify exit codes
- Verify `--pretty` output formatting
- Test against real SQLite file (temp directory)

### MCP Tests

- Protocol-level tests using MCP SDK test utilities
- Verify each resource tool handles all actions
- Verify error formatting (isError flag)
- Verify backward compatibility of behavior (not tool names — those change)

### Regression Tests

- Before any extraction: capture current MCP tool outputs for key scenarios
- After extraction: verify outputs match (snapshot testing)
- Key scenarios: start-work, complete-work, submit-finding, check-complete, generate-demo

---

## 11. Out of Scope

- [ ] `completeEpicWork()` function (future — will add when epic PR workflow is needed)
- [ ] Elegance check skill (future — will revisit when workflow is stable post-migration)
- [ ] TanStack Start server function migration for NON-WORKFLOW paths (kanban CRUD, settings — these work fine as-is)
- [ ] Database schema changes (no new tables, just extracting logic)
- [ ] UI changes (kanban board continues reading from same database)
- [ ] New workflow states (elegance check is a skill, not a state)
- [ ] Authentication/authorization (local-first tool, no auth needed)

---

## 12. References

- **Current MCP server**: `mcp-server/tools/*.ts` (16 files, ~320KB total)
- **Current CLI**: `cli/brain-dump.ts` (~800 lines)
- **Spec template**: `plans/spec-template.md`
- **OpenCode docs**: https://opencode.ai/docs/tools/ (bash tool confirmed)
- **Clawdbot inspiration**: CLI-first approach over MCP for verifiable AI workflows
- **Skills + MCP pattern**: https://claude.com/blog/extending-claude-capabilities-with-skills-mcp-servers
