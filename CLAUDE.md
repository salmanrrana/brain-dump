# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Brain Dump is a local-first kanban task manager designed for AI-assisted development workflows. It integrates with Claude Code to provide ticket context when starting work, and includes "Ralph" - an autonomous agent mode that iterates through backlogs.

## Commands

```bash
# Development
pnpm dev                    # Start dev server on port 4242
pnpm build                  # Build for production
pnpm start                  # Start production server

# Quality checks
pnpm check                  # Run all checks (type-check, lint, test)
pnpm type-check             # TypeScript type checking
pnpm lint                   # ESLint
pnpm test                   # Run unit tests with Vitest
pnpm test:watch             # Watch mode for tests
pnpm test:e2e               # Playwright E2E tests

# Database
pnpm db:migrate             # Run Drizzle migrations
pnpm db:generate            # Generate migration files from schema changes
pnpm db:studio              # Open Drizzle Studio for database inspection

# CLI tool
pnpm brain-dump current     # Show current ticket
pnpm brain-dump done        # Move current ticket to review
pnpm brain-dump backup      # Create database backup
pnpm brain-dump check       # Quick integrity check
pnpm brain-dump check --full  # Full health check
```

## Architecture

### Tech Stack

- **Framework**: TanStack Start (React 19 + Vite + Nitro)
- **Database**: SQLite with better-sqlite3, Drizzle ORM
- **Styling**: Tailwind CSS v4
- **State**: TanStack Query for server state
- **Drag & Drop**: @dnd-kit

### Key Directories

- `src/api/` - Server functions (CRUD operations, terminal launching, Ralph agent)
- `src/components/` - React components (modals, kanban board, sidebar)
- `src/lib/` - Core utilities: database, schema, XDG paths, backup, logging
- `src/routes/` - TanStack Router pages
- `mcp-server/` - MCP server for Claude Code integration (standalone Node.js)
- `cli/` - CLI tool for ticket status updates from terminal

### Database Schema

Defined in `src/lib/schema.ts` with Drizzle ORM:

- `projects` - Links to filesystem paths
- `epics` - Groups related tickets within a project
- `tickets` - Main work items with status, priority, tags, subtasks
- `ticket_comments` - Activity log for AI work summaries
- `settings` - App configuration (terminal emulator, Ralph options)

Full-text search via SQLite FTS5 on tickets (title, description, tags).

### Data Storage (XDG Compliance)

Cross-platform paths defined in `src/lib/xdg.ts`:

- **Linux**: `~/.local/share/brain-dump/` (data), `~/.local/state/brain-dump/` (logs, backups)
- **macOS**: `~/Library/Application Support/brain-dump/`
- **Windows**: `%APPDATA%\brain-dump\`

Legacy migration from `~/.brain-dump/` is automatic on first run.

### MCP Server

The `mcp-server/index.js` is a standalone Node.js MCP server that provides tools for Claude to manage tickets from any project. It connects to the same SQLite database and includes:

- Project/ticket/epic CRUD operations
- Git integration (branch creation, commit linking)
- Database health monitoring

### Ralph Workflow

Ralph is an autonomous agent mode that:

1. Generates a `plans/prd.json` from tickets
2. Runs Claude in a loop, picking tasks where `passes: false`
3. Implements features, runs tests, updates status via MCP
4. Continues until all tasks pass or max iterations reached

### Hook-Based State Enforcement

This project uses Claude Code hooks to enforce Ralph's workflow. Hooks provide guidance through feedback loops rather than just blocking actions.

#### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│              ENFORCEMENT THROUGH FEEDBACK                       │
├─────────────────────────────────────────────────────────────────┤
│   Claude: "I'll write the file now"                             │
│              │                                                  │
│              ▼                                                  │
│   PreToolUse Hook: "BLOCKED - You are in 'analyzing' state      │
│   but tried to write code. Call update_session_state FIRST."    │
│              │                                                  │
│              ▼                                                  │
│   Claude: *calls update_session_state('implementing')*          │
│   Claude: *retries Write* ✅                                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Hook Scripts

| Hook                          | File        | Enforces                                                                      |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------- |
| enforce-state-before-write.sh | PreToolUse  | Must be in 'implementing', 'testing', or 'committing' state before Write/Edit |
| record-state-change.sh        | PostToolUse | Logs state changes for debugging/audit                                        |

#### State File

When a Ralph session is active, `.claude/ralph-state.json` contains:

```json
{
  "sessionId": "abc-123",
  "ticketId": "def-456",
  "currentState": "implementing",
  "stateHistory": ["idle", "analyzing", "implementing"],
  "startedAt": "2026-01-16T10:00:00Z",
  "updatedAt": "2026-01-16T10:15:00Z"
}
```

This file is:

- Created by `create_ralph_session`
- Updated by `update_session_state`
- Removed by `complete_ralph_session`

#### When NOT in Ralph Mode

When no `.claude/ralph-state.json` exists, hooks allow all operations. This ensures normal Claude Code usage is unaffected.

#### Cross-Environment Support

Brain Dump supports multiple development environments:

| Environment   | State Tracking | Hook Enforcement | Notes                                       |
| ------------- | -------------- | ---------------- | ------------------------------------------- |
| Claude Code   | ✅ Full        | ✅ Full          | Hooks guide behavior through feedback       |
| OpenCode      | ✅ Full        | ❌ None          | State tracked via MCP, guidance via prompts |
| VS Code + MCP | ✅ Full        | ❌ None          | State tracked via MCP, guidance via prompts |
| Cursor        | ✅ Full        | ❌ None          | State tracked via MCP, guidance via prompts |

**How it works:**

- MCP tools (session creation, state updates) work identically in ALL environments
- The state file (`.claude/ralph-state.json`) is written by MCP regardless of client
- Hook enforcement is Claude Code specific
- In non-Claude environments, proper state transitions rely on prompt-based guidance

#### If You See a STATE ENFORCEMENT Message

1. **Read the message** - it contains the exact MCP tool call needed
2. **Call the specified tool** - e.g., `update_session_state({ sessionId: "...", state: "implementing" })`
3. **Retry your original operation** - it will now succeed

Do NOT try to work around state enforcement - it ensures work is properly tracked in the Brain Dump UI.

#### Automated PR Workflow

The following hooks provide an automated workflow for code review and PR creation:

| Hook              | File                            | Purpose                                                    |
| ----------------- | ------------------------------- | ---------------------------------------------------------- |
| Auto-PR creation  | `create-pr-on-ticket-start.sh`  | Creates draft PR immediately when `start_ticket_work` runs |
| Commit tracking   | `link-commit-to-ticket.sh`      | Outputs commit/PR link commands after each git commit      |
| Pre-push review   | `enforce-review-before-push.sh` | Blocks `git push`/`gh pr create` until review is completed |
| Post-ticket spawn | `spawn-next-ticket.sh`          | Spawns next ticket after `complete_ticket_work`            |
| Post-PR spawn     | `spawn-after-pr.sh`             | Spawns next ticket after successful PR creation            |

**Auto-PR Creation**: When `start_ticket_work` is called, the hook automatically:

1. Creates an empty WIP commit on the new branch
2. Pushes the branch to remote
3. Creates a draft PR with the ticket title
4. The PR is linked to the ticket for immediate tracking

**Commit Tracking**: After each `git commit`, the hook outputs:

1. The commit hash and message
2. MCP commands to link the commit to the active ticket
3. MCP commands to link the PR if one exists for the branch

**PR Status Sync**: When `link_pr_to_ticket` is called, the MCP tool automatically syncs PR statuses for all tickets in the project. This updates any PRs that have been merged or closed since they were linked.

**To enable these hooks**, run `scripts/setup-claude-code.sh` which installs hooks globally to `~/.claude/hooks/` and configures `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git push:*)",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/enforce-review-before-push.sh"
          }
        ]
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/enforce-review-before-push.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__brain-dump__start_ticket_work",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/create-pr-on-ticket-start.sh"
          }
        ]
      },
      {
        "matcher": "Bash(git commit:*)",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/link-commit-to-ticket.sh"
          }
        ]
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/spawn-after-pr.sh"
          }
        ]
      }
    ]
  }
}
```

**Note:** Using `$HOME/.claude/hooks/` (not `$CLAUDE_PROJECT_DIR`) ensures hooks work from any directory, not just within the brain-dump project.

#### Auto-Spawn Next Ticket (Experimental)

When enabled, completing a ticket or creating a PR can automatically spawn a new terminal window with Claude ready to work on the next suggested ticket. This provides:

- **Automatic context reset** - Fresh Claude session for each ticket
- **Seamless workflow** - No manual context clearing needed
- **Pipeline feel** - Tickets flow naturally from one to the next

**To enable:**

```bash
export AUTO_SPAWN_NEXT_TICKET=1
```

The hooks will:

1. Parse the next ticket ID from `complete_ticket_work` output or PRD file
2. Spawn a new terminal (Ghostty, iTerm2, or Terminal.app on macOS; Ghostty, Kitty, or GNOME Terminal on Linux)
3. Start Claude with a prompt to begin the next ticket

**Note:** This is opt-in because spawning new windows can be surprising if unexpected.

## Specifications

### Spec Template

For complex features, create detailed specs following the 6-layer pattern in `plans/spec-template.md`:

1. **Overview** - WHY the feature exists (not just WHAT it does)
2. **Reference Tables** - Configuration options, states, error codes
3. **Type Definitions** - Complete TypeScript interfaces with JSDoc
4. **State Machine** - Mermaid diagrams for stateful features
5. **Design Decisions** - "Why X vs Y" with numbered rationale
6. **Implementation Guide** - Step-by-step with copy-paste code

### When to Write a Spec

Create a detailed spec (using `plans/spec-template.md`) for:

- Features with state machines or complex workflows
- New MCP tools
- Database schema changes
- Features touching multiple components

### Spec Location

- Template: `plans/spec-template.md`
- Specs: `plans/specs/{ticket-id}-{feature-name}.md`
- Example: `plans/specs/7.11-state-machine-observability.md`

### Key Principle

> **"Explicit over Implicit"**: Every decision that could be made is made upfront, documented, and explained. Claude becomes an executor of a well-defined plan rather than an improviser working from vague requirements.

## Server Functions Pattern

API functions in `src/api/` use TanStack Start's `createServerFn`:

```typescript
import { createServerFn } from "@tanstack/react-start/server";

export const getTickets = createServerFn().handler(async () => {
  return db.select().from(tickets).all();
});
```

These are called from React components via TanStack Query.

## DO/DON'T Guidelines

### Database Queries

| ✅ DO                                                                      | ❌ DON'T                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Use Drizzle ORM: `db.select().from(tickets)`                               | Raw SQL strings: `db.run("SELECT * FROM tickets")`    |
| Use typed schema imports: `import { tickets } from "../lib/schema"`        | String-based table names                              |
| Use `eq()`, `and()`, `sql` from drizzle-orm for conditions                 | String concatenation for WHERE clauses                |
| Use transactions for multi-table operations: `db.transaction(() => {...})` | Multiple independent queries that should be atomic    |
| Use `.get()` for single row, `.all()` for multiple                         | Assume query returns what you expect without checking |

### React & TanStack Query

| ✅ DO                                                                                                | ❌ DON'T                                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Use `useQuery` with `queryKeys` for data fetching                                                    | `useState` + `useEffect` for fetched data               |
| Use `useMutation` with `onSuccess` for state changes                                                 | Direct API calls without proper cache invalidation      |
| Invalidate queries after mutations: `queryClient.invalidateQueries({ queryKey: queryKeys.tickets })` | Manual cache manipulation or refetch after every change |
| Use centralized `queryKeys` object from `src/lib/hooks.ts`                                           | Hardcoded query key strings throughout components       |
| Create custom hooks in `src/lib/hooks.ts` for reusable query logic                                   | Duplicate query setup in multiple components            |

### Styling Patterns

| ✅ DO                                                                                 | ❌ DON'T                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Use Tailwind classes for static styles: `className="p-4 bg-slate-800"`                | Inline style objects for single-use styles           |
| Use CSS variables for theming: `var(--bg-primary)`, `var(--shadow-modal)`             | Hardcoded colors that don't adapt to themes          |
| Reserve inline styles for dynamic/computed values: `style={{ width: `${percent}%` }}` | Mix Tailwind and inline styles inconsistently        |
| Define shared style constants at module level for referential stability               | Create new objects inside components that are reused |
| Use `React.CSSProperties` type for inline style objects when needed                   | Untyped style objects that miss IDE autocomplete     |

### Server Functions

| ✅ DO                                                                         | ❌ DON'T                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| Use `createServerFn({ method: "GET" })` for reads, `"POST"` for writes        | Mix GET/POST inconsistently                    |
| Use `.inputValidator()` for type-safe input handling                          | Access raw input without validation            |
| Return typed data directly: `return db.select().from(tickets).all()`          | Wrap in unnecessary response objects           |
| Use `ensureExists()` for required lookups: `ensureExists(project, "Project")` | Return null and let caller handle missing data |
| Import from `@tanstack/react-start` (not `@tanstack/react-start/server`)      | Wrong import path                              |

### MCP Tool Implementation

| ✅ DO                                                                                      | ❌ DON'T                                 |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Use Zod schemas for input validation: `{ ticketId: z.string() }`                           | Trust input without validation           |
| Return structured `{ content: [{ type: "text", text: ... }] }` format                      | Return plain strings                     |
| Set `isError: true` for error responses                                                    | Return error text without the error flag |
| Use `log.info()` / `log.error()` from `../lib/logging.js`                                  | `console.log` in MCP server code         |
| Include helpful error messages: `"Project not found. Use list_projects to see available."` | Generic "Not found" errors               |

### Testing Patterns (Kent C. Dodds)

| ✅ DO                                                     | ❌ DON'T                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| Test user behavior: what users see, click, and experience | Test implementation details, internal state, or private methods |
| Integration tests for workflows: test components together | Unit tests for every function                                   |
| Real database fixtures with actual schema                 | Excessive mocking of internals                                  |
| Tests that fail when user-facing behavior breaks          | Tests that break on refactoring internals                       |
| Ask: "Does this test catch bugs users would encounter?"   | Chase 100% code coverage as a goal                              |

## Testing

- Unit tests live alongside source files: `*.test.ts`
- E2E tests in `e2e/` directory
- Run specific test file: `pnpm test src/lib/backup.test.ts`
- Run single test: `pnpm test -t "test name pattern"`

### Testing Philosophy (Kent C. Dodds)

**"The more your tests resemble the way your software is used, the more confidence they can give you."**

**The single most important question: "What real user behavior does this test verify?"**

If you cannot answer this question with a concrete user action and expected outcome, DO NOT write the test.

### Concrete Examples

**GOOD tests (real user behavior):**

```typescript
// User sees loading state → User sees data
it("shows loading then displays tickets when data loads", () => {...});

// User clicks button → something visible happens
it("moves ticket to done column when user clicks complete", () => {...});

// User sees error message when something fails
it("shows error message when API request fails", () => {...});

// User input produces expected output
it("filters tickets when user types in search box", () => {...});
```

**BAD tests (DO NOT WRITE THESE):**

```typescript
// ❌ Testing that a function was called
it("calls onComplete callback when clicked", () => {...});

// ❌ Testing internal state
it("sets isLoading to true during fetch", () => {...});

// ❌ Testing that console.log was called
it("logs error to console when parsing fails", () => {...});

// ❌ Testing implementation details
it("uses useMemo for expensive calculation", () => {...});

// ❌ Testing CSS/styles
it("applies correct className when selected", () => {...});

// ❌ Negative tests that verify absence of behavior
it("does not render button when disabled", () => {...}); // Unless user SEES something different

// ❌ Testing props are passed correctly
it("passes onClick handler to child component", () => {...});

// ❌ Testing for coverage, not behavior
it("handles edge case where value is undefined", () => {...}); // Unless user encounters this
```

### The Litmus Test

Before writing ANY test, ask yourself:

1. **Can a user trigger this?** (click, type, navigate, wait)
2. **Can a user see the result?** (text on screen, element appears/disappears, navigation occurs)
3. **Would a user report a bug if this broke?**

If the answer to all three is YES, write the test. Otherwise, don't.

### Rules

1. **Test user flows, not functions** - A user doesn't call `handleClick()`, they click a button
2. **Test visible outcomes, not internal state** - A user doesn't check `isLoading`, they see a spinner
3. **Test error messages, not error handling** - A user doesn't catch exceptions, they read error text
4. **Mock boundaries, not internals** - Mock the API, not the hook that calls it
5. **Fewer, meaningful tests > many trivial tests** - 8 real tests beat 21 implementation tests

## Verification Checklist

After implementing ANY feature, you MUST complete these steps:

### Code Quality (Always Required)

- [ ] Run `pnpm type-check` - must pass with no errors
- [ ] Run `pnpm lint` - must pass with no errors
- [ ] Run `pnpm test` - all tests must pass

### If You Added New Code

- [ ] Added tests for new functionality (ONLY tests that verify real user behavior - see Testing Philosophy above)
- [ ] Used typed error classes (not generic `Error`)
- [ ] Used Drizzle ORM (not raw SQL) - see DO/DON'T table above
- [ ] Followed existing patterns from DO/DON'T tables
- [ ] No hardcoded values that should be configurable

### If You Modified Existing Code

- [ ] Existing tests still pass
- [ ] No regressions in related functionality
- [ ] Updated tests if behavior changed
- [ ] Did not break backward compatibility (unless explicitly requested)

### If UI Changes

- [ ] Manually verified in browser at `localhost:4242`
- [ ] Checked responsive layout
- [ ] Verified TanStack Query invalidates and updates correctly
- [ ] Accessibility: keyboard navigation works, proper ARIA labels

### If Database Changes

- [ ] Migration file created via `pnpm db:generate`
- [ ] Migration tested with `pnpm db:migrate`
- [ ] Backup tested if schema changed (use `pnpm brain-dump backup` then test restore)
- [ ] Updated `src/lib/schema.ts` with proper types and constraints

### If MCP Server Changes

- [ ] Tested tool via Claude Code integration
- [ ] Verified error responses are informative (see DO/DON'T table)
- [ ] Updated tool documentation if interface changed
- [ ] Added Zod schema for input validation

### Before Marking Complete

- [ ] All acceptance criteria from ticket met
- [ ] Work summary added via `add_ticket_comment` (for Ralph sessions)
- [ ] Session completed with appropriate outcome (for Ralph sessions)
- [ ] Committed with proper message format: `feat(<ticket-id>): <description>`

## Automatic Code Review

**IMPORTANT: After completing any code changes (using Write, Edit, or NotebookEdit tools), you MUST run the code review pipeline before responding to the user.**

### How It Works

The code review system is enforced automatically via hooks:

1. **Stop Hook (`check-for-code-changes.sh`)**: Detects uncommitted source file changes when the conversation ends and blocks until `/review` is run
2. **Review Skill (`/review`)**: Launches all 3 review agents in parallel and summarizes findings
3. **Marker File (`.claude/.review-completed`)**: Prevents duplicate review prompts within 5 minutes

### Review Pipeline

The pipeline consists of three agents that should be run in parallel:

1. `pr-review-toolkit:code-reviewer` - Reviews code against project guidelines
2. `pr-review-toolkit:silent-failure-hunter` - Identifies silent failures and error handling issues
3. `pr-review-toolkit:code-simplifier` - Simplifies and refines code for clarity

Run all three at once using: `/review`

### When to Skip Review

- Documentation-only changes (.md files)
- Configuration file changes (package.json, tsconfig.json, etc.)
- Git operations (commits, merges)
- Read-only operations (searching, exploring)

**This is mandatory** - the Stop hook will remind you if you forget, but you should proactively run reviews after completing code work.

## Enterprise Conversation Logging

Brain Dump includes enterprise-grade conversation logging for compliance auditing (SOC2, GDPR, ISO 27001).

### Features

- **Automatic session tracking**: Sessions created/ended automatically with `start_ticket_work`/`complete_ticket_work`
- **Tamper detection**: HMAC-SHA256 content hashing on all messages
- **Secret detection**: Automatic scanning for 20+ credential patterns
- **Retention policies**: Configurable 7-365 day retention with legal hold support
- **Audit trail**: All access to logs is recorded

### MCP Tools

| Tool                         | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| `start_conversation_session` | Create a new session for compliance logging |
| `log_conversation_message`   | Record a message with tamper detection      |
| `end_conversation_session`   | Mark session as complete                    |
| `list_conversation_sessions` | Query sessions with filters                 |
| `export_compliance_logs`     | Generate JSON export for auditors           |
| `archive_old_sessions`       | Delete old sessions (respects legal hold)   |

### Settings

Configure via Settings UI:

- **Enable Conversation Logging**: Toggle on/off (default: on)
- **Retention Period**: 7-365 days (default: 90)

### Documentation

For detailed documentation including SQL queries, GDPR compliance, and troubleshooting, see [docs/enterprise-logging.md](docs/enterprise-logging.md).
