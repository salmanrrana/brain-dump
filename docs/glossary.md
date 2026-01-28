# Glossary

Complete terminology reference for Brain Dump.

[← Back to CLAUDE.md](../CLAUDE.md)

---

## Core Concepts

### Ralph

Autonomous agent mode that iterates through ticket backlogs. Named after the character from "The Simpsons" who famously says "I'm helping!" Ralph runs in a loop, picking tasks from a PRD file, implementing them, running tests, and updating status until all tasks pass or max iterations are reached.

**See also**: [Ralph Workflow](workflows.md#ralph-workflow)

### Worktree

Git feature that allows multiple working directories from the same repository. Brain Dump uses worktrees to enable parallel AI sessions on different epics without checkout conflicts. Each worktree has its own `.claude/` folder and branch.

**See also**: [Git Worktree Workflow](workflows.md#git-worktree-workflow)

### Isolation Mode

How epics are worked on: either "branch" (work in main repo directory) or "worktree" (work in separate isolated directory). Configured per-project with global defaults.

**See also**: [Enabling Worktree Support](../CLAUDE.md#enabling-worktree-support)

### Tracer Review

Structured quality review pattern inspired by Dillon Mulroy. Runs three review agents in parallel (`code-reviewer`, `silent-failure-hunter`, `code-simplifier`) to catch different classes of issues. Part of the Universal Quality Workflow.

**See also**: [Universal Quality Workflow](workflows.md#universal-quality-workflow)

### PRD (Product Requirements Document)

JSON file (`plans/prd.json`) that contains a list of tasks for Ralph to complete. Generated from epic tickets. Each task has a `passes` boolean that Ralph uses to determine what to work on next.

**Format**:

```json
{
  "tasks": [
    {
      "id": "1",
      "title": "Implement feature X",
      "description": "...",
      "passes": false,
      "dependencies": []
    }
  ]
}
```

---

## Workflows

### Universal Quality Workflow

Structured progression through quality gates: `backlog → ready → in_progress → ai_review → human_review → done`. Ensures consistent code quality regardless of AI coding environment.

**See also**: [Universal Quality Workflow](workflows.md#universal-quality-workflow)

### Telemetry Session

Background tracking of AI work sessions for observability and audit trails. Captures tool usage, token counts, error rates, and time spent in each phase. Automatically created when starting ticket work.

**See also**: [Telemetry Hooks](workflows.md#telemetry-hooks)

### State Enforcement

Mechanism where hooks guide Claude's behavior by blocking certain operations unless in the correct state (e.g., must be in "implementing" state before writing code). Uses `.claude/ralph-state.json` to track current state.

**See also**: [Hook-Based State Enforcement](workflows.md#hook-based-state-enforcement)

---

## Technologies

### MCP (Model Context Protocol)

Standard protocol for Claude to interact with external tools and services. Brain Dump provides an MCP server (`mcp-server/`) that exposes ticket management, git operations, and database health monitoring.

**See also**: [MCP Server](../CLAUDE.md#mcp-server)

### Drizzle ORM

Type-safe SQL query builder for TypeScript. Brain Dump uses Drizzle to interact with the SQLite database, providing compile-time type safety and better IDE support than raw SQL.

**Examples**: `db.select().from(tickets).where(eq(tickets.id, id)).get()`

### TanStack Start

Full-stack React framework combining React 19, Vite, and Nitro. Provides server functions, file-based routing, and SSR capabilities. Brain Dump's main framework.

**See also**: [Server Functions Pattern](../CLAUDE.md#server-functions-pattern)

### TanStack Query (React Query)

Data fetching and caching library for React. Brain Dump uses it to manage server state, cache invalidation, and optimistic updates.

**See also**: [React & TanStack Query](../CLAUDE.md#react--tanstack-query)

### XDG (Cross-platform Directory Specification)

Standard for organizing application data on Linux, macOS, and Windows. Brain Dump follows XDG Base Directory Specification for data, config, and state files.

**Paths**:

- Linux: `~/.local/share/brain-dump/`, `~/.local/state/brain-dump/`
- macOS: `~/Library/Application Support/brain-dump/`
- Windows: `%APPDATA%\brain-dump\`

**See also**: [Data Storage](../CLAUDE.md#data-storage-xdg-compliance)

---

## Database

### FTS5 (Full-Text Search)

SQLite extension for full-text search. Brain Dump uses FTS5 to search tickets by title, description, and tags.

**Example query**: `SELECT * FROM tickets_fts WHERE tickets_fts MATCH 'authentication'`

### Epic

Grouping of related tickets within a project. Epics have their own branch/worktree and PRD file. Typically represent a feature or milestone.

**Schema**: `epics` table in [src/lib/schema.ts](../src/lib/schema.ts)

### Ticket

Main work item in Brain Dump. Has status (backlog, ready, in_progress, ai_review, human_review, done), priority, tags, subtasks, and links to epic/project.

**Schema**: `tickets` table in [src/lib/schema.ts](../src/lib/schema.ts)

### Ticket Comment

Activity log entry for a ticket. Created automatically when starting work, completing work, submitting findings, etc. Provides audit trail.

**Schema**: `ticket_comments` table in [src/lib/schema.ts](../src/lib/schema.ts)

---

## File Locations

### `.claude/ralph-state.json`

State file created when Ralph session is active. Contains session ID, ticket ID, current state, isolation mode, worktree path, and main repo path. Used by hooks to enforce workflow.

**Format**:

```json
{
  "sessionId": "abc-123",
  "ticketId": "def-456",
  "currentState": "implementing",
  "isolationMode": "worktree",
  "worktreePath": "/path/to/worktree",
  "mainRepoPath": "/path/to/main-repo"
}
```

### `.claude/telemetry-queue.jsonl`

Queue of telemetry events pending flush to database. JSONL format (newline-delimited JSON) for streaming. Events include tool calls, prompts, errors, and durations.

### `plans/prd.json`

Product Requirements Document for current epic. Generated from epic tickets. Ralph reads this file to determine which tasks to work on next.

### `plans/spec-template.md`

Template for writing detailed feature specifications. Follows 6-layer pattern: Overview, Reference Tables, Type Definitions, State Machine, Design Decisions, Implementation Guide.

### `plans/specs/{ticket-id}-{feature-name}.md`

Individual feature specifications following the spec template pattern.

---

## Hooks

### PreToolUse Hook

Hook that runs before a tool is invoked. Used for state enforcement (e.g., must be in "implementing" state before Write/Edit) and pre-push review checks.

**Examples**:

- `enforce-state-before-write.sh` - Blocks Write/Edit unless in correct state
- `enforce-review-before-push.sh` - Blocks `git push` until review is completed

### PostToolUse Hook

Hook that runs after a tool completes successfully. Used for tracking state changes, linking commits to tickets, and spawning next tickets.

**Examples**:

- `record-state-change.sh` - Logs state transitions for audit
- `link-commit-to-ticket.sh` - Outputs MCP commands to link commits/PRs
- `spawn-after-pr.sh` - Spawns next ticket after PR creation

### Stop Hook

Hook that runs when Claude session ends. Used to end telemetry sessions and check for uncommitted code changes that need review.

**Examples**:

- `end-telemetry-session.sh` - Flushes telemetry queue to database
- `check-for-code-changes.sh` - Blocks exit if code changed without review

### SessionStart Hook

Hook that runs when Claude session starts. Used to detect active tickets and prompt for telemetry session creation.

**Example**: `start-telemetry-session.sh` - Detects active ticket, prompts for session start

---

## Skills (Slash Commands)

Skills are shortcuts for common workflow operations. Invoked with `/` prefix in Claude Code.

### `/next-task`

Intelligently selects the next ticket considering priority, dependencies, and blockers. Respects epic boundaries and status flow.

### `/review-ticket`

Runs all three AI review agents in parallel on current work. Submits findings to ticket comments.

### `/review-epic`

Runs Tracer Review on an entire epic. Reviews all tickets in the epic, aggregates findings.

### `/demo`

Generates demo script (manual test instructions) after AI review passes. Moves ticket to `human_review` status.

### `/reconcile-learnings`

Extracts learnings from completed ticket and applies them to project documentation (CLAUDE.md, specs). Ensures continuous improvement.

---

## Patterns

### End-to-End Feature Implementation

Pattern for ensuring features are fully connected from UI to backend. Requires verifying data flow through all layers: UI → API → Database → Side Effects.

**See also**: [End-to-End Feature Implementation](../CLAUDE.md#end-to-end-feature-implementation-critical)

### Server Functions Pattern

Pattern for API functions in `src/api/` using TanStack Start's `createServerFn`. Provides type-safe request/response handling.

**See also**: [Server Functions Pattern](../CLAUDE.md#server-functions-pattern)

### Testing Philosophy (Kent C. Dodds)

"Test user behavior, not implementation details." Focus on what users see, click, and experience rather than internal state or function calls.

**See also**: [Testing Philosophy](testing.md)

---

## Abbreviations

- **AI**: Artificial Intelligence
- **API**: Application Programming Interface
- **CLI**: Command Line Interface
- **DB**: Database
- **FTS**: Full-Text Search
- **MCP**: Model Context Protocol
- **ORM**: Object-Relational Mapping
- **PR**: Pull Request
- **PRD**: Product Requirements Document
- **SSR**: Server-Side Rendering
- **UI**: User Interface
- **XDG**: Cross-Desktop Group (directory specification)

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Main project documentation
- [Architecture](architecture.md) - Tech stack deep dive
- [Workflows](workflows.md) - Ralph, Quality Pipeline, Hooks
- [Testing](testing.md) - Kent C. Dodds philosophy
- [Troubleshooting](troubleshooting.md) - Common issues
