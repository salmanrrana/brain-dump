# Universal Quality Workflow: Multi-Environment Implementation Guide

## Overview

The **Universal Quality Workflow (UQW)** is a structured quality system that ensures consistent code quality and workflow discipline regardless of which AI coding environment you use. It implements a "tracer review" pattern inspired by Dillon Mulroy's methodology, creating a mandatory progression through quality gates:

```
backlog → ready → in_progress → ai_review → human_review → done
```

### Why UQW Matters

- **Consistency**: Same workflow across Claude Code, OpenCode, VS Code, Cursor
- **Quality Gates**: Mandatory code review and human approval before merging
- **Audit Trail**: Complete record of who did what, when, and why
- **State Enforcement**: Prevents accidental code pushes before review
- **Telemetry**: Captures tool usage, token counts, and workflow metrics

### Shared Foundation

All environments use:

- **Same MCP Server**: `mcp-server/index.ts` with all workflow logic pre-implemented
- **Same State File**: `.claude/ralph-state.json` tracks Ralph session state
- **Same Database**: SQLite schema with `ticket_workflow_state`, `ralph_sessions`, `review_findings` tables
- **Same Telemetry**: Identical metrics captured across all environments

The key difference is **enforcement mechanism** - how the workflow constraints are communicated and enforced.

---

## Claude Code Implementation

Claude Code (claude.ai/code) uses **shell hooks** to enforce UQW constraints. Hooks are shell scripts that execute at specific points in the workflow, providing interactive feedback and guidance to the AI.

### Hook-Based Architecture

**Hooks** are shell scripts in `.claude/hooks/` that trigger during tool execution:

| Hook Type              | When It Triggers                  | Example Hook                     |
| ---------------------- | --------------------------------- | -------------------------------- |
| **PreToolUse**         | Before any tool is called         | Validate state before Write/Edit |
| **PostToolUse**        | After tool completes successfully | Create PR marker after MCP call  |
| **PostToolUseFailure** | After tool fails                  | Log error to telemetry           |
| **SessionStart**       | Claude session begins             | Create telemetry session         |
| **Stop**               | Claude session ends               | Flush telemetry to database      |

### State Enforcement

Claude Code provides **interactive state enforcement** - when you violate state constraints, the hook injects guidance into the chat:

```
❌ YOU ATTEMPT: Write src/api/tickets.ts

🪝 HOOK RESPONSE:
   "STATE ENFORCEMENT: You are in 'analyzing' state but tried to write code.

    Valid states for writing code: ['implementing', 'testing', 'committing']
    Current state: 'analyzing'

    Call this MCP tool first:
    update_session_state({
      sessionId: 'xyz-789',
      state: 'implementing'
    })"

✅ YOU RESPOND: Calls update_session_state, then retries Write
```

The flow is **feedback-driven**: the AI sees the error, understands the constraint, fixes it, and retries.

### Key State Enforcement Hooks

**Hook 1: `.claude/hooks/enforce-state-before-write.sh`**

- **Purpose**: Block Write/Edit unless in valid state
- **Valid States**: `implementing`, `testing`, `committing`
- **Trigger**: PreToolUse on Write/Edit tools
- **Feedback**: Tells AI exactly which MCP call is needed

**Hook 2: `.claude/hooks/enforce-review-before-push.sh`**

- **Purpose**: Block git push/gh pr create until code review complete
- **Validation**: Check for `.claude/.review-completed` marker (< 30 min old)
- **Trigger**: PreToolUse on Bash tool with `git push` or `gh pr create` commands
- **Feedback**: Guides AI to run `/review` command

**Hook 3: `.claude/hooks/create-pr-on-ticket-start.sh`**

- **Purpose**: Auto-create draft PR when `start_ticket_work` completes
- **Workflow**: Parses output → Creates empty WIP commit → Pushes → Creates draft PR
- **Trigger**: PostToolUse on `mcp__brain-dump__start_ticket_work`
- **Result**: PR is created and linked to ticket immediately

### Auto-Telemetry Capture

Claude Code hooks automatically capture telemetry using MCP tools:

```bash
# SessionStart hook
start_telemetry_session({ ticketId: "..." })

# PreToolUse hook for Bash
log_tool_event({
  sessionId: "...",
  event: "start",
  toolName: "Bash",
  correlationId: "..."
})

# PostToolUse hook for Bash
log_tool_event({
  sessionId: "...",
  event: "end",
  toolName: "Bash",
  correlationId: "...",
  success: true,
  durationMs: 250
})

# Stop hook
end_telemetry_session({ sessionId: "..." })
```

### Claude Code Advantages

✅ **Interactive feedback**: Errors appear inline in chat
✅ **Immediate retry loop**: AI sees error, understands, fixes, retries
✅ **No documentation overhead**: Hooks provide guidance automatically
✅ **Graceful degradation**: When Ralph mode inactive, all operations allowed
✅ **Installed globally**: Works from any project directory

### Claude Code Limitations

❌ **Shell-only**: Limited to what bash can do
❌ **Text parsing**: Output parsing can be fragile
❌ **Hook conflicts**: Multiple projects might conflict

---

## OpenCode Implementation

OpenCode uses **TypeScript plugins** to enforce UQW constraints. Unlike hooks that modify behavior, plugins are discrete components that run code at specific lifecycle points.

### Plugin-Based Architecture

**Plugins** are TypeScript files in `.opencode/plugins/` that implement event handlers:

```typescript
// .opencode/plugins/brain-dump-state-enforcement.ts
export function onBeforeToolExecution(tool, params) {
  if (tool === "Write" || tool === "Edit") {
    // Check state, possibly throw Error
  }
}
```

OpenCode plugins have access to:

- Full TypeScript ecosystem (no shell limitations)
- File system access (read `.claude/ralph-state.json`)
- Child process execution (`execSync` for git/gh commands)
- Console output (feedback visible in OpenCode chat)

### State Enforcement via Plugins

OpenCode provides **exception-based state enforcement** - when you violate state constraints, the plugin throws an Error that appears in the chat:

```
❌ YOU ATTEMPT: Write src/api/tickets.ts

🔌 PLUGIN THROWS ERROR:
   "STATE ENFORCEMENT: You are in 'analyzing' state but tried to write/edit code.

    Valid states for writing code: ['implementing', 'testing', 'committing']
    Current state: 'analyzing'

    Call this MCP tool:
    update_session_state({
      sessionId: 'xyz-789',
      state: 'implementing'
    })"

✅ YOU RESPOND: Calls update_session_state, then retries Write
```

The key difference: **OpenCode doesn't catch exceptions** - the error stops execution. The AI must:

1. Read the error message
2. Understand what went wrong
3. Call the suggested MCP tool
4. Retry the operation

This is why **AGENTS.md guidance is critical** - without interactive hook feedback, the AI relies on documentation to understand the workflow.

### Key State Enforcement Plugins

**Plugin 1: `brain-dump-state-enforcement.ts`**

- **Purpose**: Block Write/Edit unless in valid state
- **Valid States**: `implementing`, `testing`, `committing`
- **Hook**: `tool.execute.before` (before Write/Edit)
- **Action**: Read `.claude/ralph-state.json`, check currentState, throw Error if invalid
- **Fail-Open**: If not in Ralph mode (no state file), allow operation

**Plugin 2: `brain-dump-auto-pr.ts`**

- **Purpose**: Auto-create draft PR after `start_ticket_work` completes
- **Hook**: `tool.execute.after` (after MCP tool)
- **Workflow**: Parse output → Create WIP commit → Push → Create draft PR
- **Communication**: Output to console with `[Brain Dump]` prefix
- **Graceful**: Doesn't block workflow if git/gh fails

**Plugin 3: `brain-dump-commit-tracking.ts`**

- **Purpose**: Output MCP commands to link commits to tickets
- **Hook**: `tool.execute.after` (after Bash tool with `git commit`)
- **Action**: Extract commit hash/message → Read ticketId → Output MCP commands
- **Graceful**: Fails silently if not in Ralph mode

**Plugin 4: `brain-dump-review-marker.ts`**

- **Purpose**: Create `.claude/.review-completed` marker after review completes
- **Hook**: `tool.execute.after` (after `check_review_complete`)
- **Action**: Parse output → Create marker file with ISO timestamp
- **Used By**: `brain-dump-review-guard.ts` checks this marker

**Plugin 5: `brain-dump-review-guard.ts`**

- **Purpose**: Block git push/gh pr create until review is complete
- **Hook**: `tool.execute.before` (before Bash tool with push command)
- **Validation**: Check for uncommitted changes → Verify marker exists → Check freshness (< 30 min)
- **Error Message**: Guides AI to run `/review` command
- **Graceful**: Allows push if no source code changes

### AGENTS.md: The AI Guidance Document

Since OpenCode plugins lack interactive hook feedback, **AGENTS.md is critical**. This document:

1. **Explains the state machine** - All 7 states and valid transitions
2. **Describes enforcement rules** - Why certain operations are blocked
3. **Provides error recovery** - What to do when you see "STATE ENFORCEMENT" message
4. **Documents the AI review workflow** - How to submit findings, fix issues, generate demo
5. **Offers self-review checklist** - Type safety, error handling, edge cases

Example AGENTS.md section:

```markdown
## If You See "STATE ENFORCEMENT" Error

This error means you tried to write/edit code while in the wrong state.

**Current state**: Check `.claude/ralph-state.json` for `currentState` value

**Valid states for writing code**: `implementing`, `testing`, `committing`

**How to fix**:

1. Call this MCP tool:
   update_session_state({ sessionId: "YOUR-SESSION-ID", state: "implementing" })
2. Retry your Write/Edit operation
3. It should now succeed
```

### OpenCode Advantages

✅ **TypeScript power**: Full language capabilities, not limited to shell
✅ **Better error handling**: Try/catch, structured logging
✅ **File system access**: Read/write arbitrary files (state, markers, etc.)
✅ **Process execution**: Run git/gh commands with better control
✅ **Clear error messages**: Plugin can throw structured Errors with helpful context

### OpenCode Limitations

❌ **No interactive feedback**: Errors stop execution, AI must read and retry
❌ **Documentation-dependent**: AGENTS.md must be comprehensive
❌ **Plugin loading**: Must be installed and enabled in OpenCode config
❌ **Limited introspection**: Can't inspect what the AI is thinking, only react to tool calls

---

## Key Differences: Claude Code vs OpenCode

| Aspect                   | Claude Code                                      | OpenCode                                                |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------- |
| **Technology**           | Shell hooks in `.claude/hooks/`                  | TypeScript plugins in `.opencode/plugins/`              |
| **Blocking Mechanism**   | Hook returns `{"decision": "block"}`             | Plugin throws `Error()`                                 |
| **Feedback Delivery**    | Hook injects message into chat context           | Plugin throws error, visible in chat                    |
| **Interactivity**        | Interactive: AI sees error inline, retries flow  | Exception-driven: AI must read error, understand, retry |
| **State File**           | `.claude/ralph-state.json` (same)                | `.claude/ralph-state.json` (same)                       |
| **Environment Var**      | `CLAUDE_CODE=1` set by Claude                    | `OPENCODE=1` set by OpenCode                            |
| **AI Guidance**          | Hooks provide inline feedback (self-explanatory) | AGENTS.md critical for understanding                    |
| **Telemetry**            | Hooks call MCP tools directly                    | Plugins can call MCP tools or rely on MCP to log        |
| **Installation**         | `.claude/hooks/` (global in user home)           | `.opencode/plugins/` (project or user config)           |
| **Graceful Degradation** | When no Ralph session: hooks allow all ops       | When no Ralph session: plugins allow all ops            |

### Why Different Approaches?

**Claude Code uses hooks** because:

1. Claude Code already has a well-defined hook system
2. Shell is sufficient for most enforcement tasks
3. Hooks are global (work from any project, any environment)
4. Interactive feedback is natural for chat-based interface

**OpenCode uses plugins** because:

1. OpenCode's plugin system is the recommended extension point
2. TypeScript gives better control than shell
3. Plugins can be project-specific or global (configurable)
4. Error throwing is the natural way to block operations in code

Both approaches achieve the **same goal**: enforce UQW state transitions and prevent workflow violations.

---

## Cross-Environment Consistency

Despite using different enforcement mechanisms, **all environments share the same underlying system**:

### Shared State File: `.claude/ralph-state.json`

```json
{
  "sessionId": "abc-123-def-456",
  "ticketId": "da61b726-9999-46cd-a4ae-57755af8ae62",
  "currentState": "implementing",
  "stateHistory": ["idle", "analyzing", "implementing"],
  "startedAt": "2026-01-31T19:36:59.494Z",
  "updatedAt": "2026-01-31T19:45:00.000Z"
}
```

This file is:

- **Written by**: `create_ralph_session`, `update_session_state` (MCP tools)
- **Read by**: Hooks (Claude Code) and plugins (OpenCode)
- **Format**: JSON, machine and human readable
- **Location**: Project root `.claude/` directory (not git-tracked)

### Shared MCP Server

All environments call the same MCP tools:

- `start_ticket_work()` - Creates branch, initializes state
- `update_session_state()` - Moves through workflow states
- `complete_ticket_work()` - Validates and moves to ai_review
- `submit_review_finding()` - Records code review issues
- `mark_finding_fixed()` - Marks issues as resolved
- `check_review_complete()` - Verifies all critical/major findings fixed
- `generate_demo_script()` - Creates manual test steps
- `submit_demo_feedback()` - Human approves (only humans can call this)
- `complete_ralph_session()` - Finalizes session

### Shared Database Schema

All telemetry and workflow state is stored in the same SQLite database:

```sql
-- Ralph session tracking
CREATE TABLE ralph_sessions (
  id TEXT PRIMARY KEY,
  ticketId TEXT,
  currentState TEXT,
  stateHistory TEXT,
  startedAt TEXT,
  updatedAt TEXT
);

-- Code review findings
CREATE TABLE review_findings (
  id TEXT PRIMARY KEY,
  ticketId TEXT,
  agent TEXT,
  severity TEXT,
  category TEXT,
  description TEXT
);

-- Telemetry events
CREATE TABLE telemetry_sessions (
  id TEXT PRIMARY KEY,
  ticketId TEXT,
  environment TEXT,
  startedAt TEXT,
  endedAt TEXT
);
```

This means:

- **Same reports**: All environments report to same database
- **Same queries**: Brain Dump UI shows unified telemetry
- **Same history**: Can trace work across environments

---

## The AI Review Workflow (All Environments)

The mandatory AI review phase is identical across all environments:

### Phase 1: Implementation (AI writes code)

1. Call `start_ticket_work(ticketId)`
   - Creates git branch
   - Sets status to `in_progress`
   - Returns branch name

2. Call `create_ralph_session(ticketId)`
   - Initializes `.claude/ralph-state.json`
   - Sets state to `idle`
   - Returns sessionId

3. Call `update_session_state(sessionId, "analyzing")`
   - Transition to analyzing state
   - Read ticket requirements

4. Call `update_session_state(sessionId, "implementing")`
   - Transition to implementing state
   - (Hooks/plugins now allow Write/Edit)
   - Write code, run tests, debug

5. Call `update_session_state(sessionId, "committing")`
   - Transition to committing state
   - Create git commits

6. Call `complete_ticket_work(ticketId, summary)`
   - Validates: `pnpm type-check && pnpm lint && pnpm test`
   - Sets status to `ai_review`
   - Creates work summary comment
   - Ready for code review

### Phase 2: AI Review (AI reviews own code)

7. Call `submit_review_finding()` for each issue found
   - Use 3 agents: code-reviewer, silent-failure-hunter, code-simplifier
   - Specify: severity (critical/major/minor/suggestion), category, description

8. Call `mark_finding_fixed()` for each critical/major issue fixed
   - Update code to fix the issue
   - Verify with tests
   - Mark as fixed with description

9. Call `check_review_complete()`
   - Validates all critical/major findings are fixed
   - Returns: `{ complete: true, openCritical: 0, openMajor: 0 }`
   - If false: go back to step 7 (more iterations)

### Phase 3: Demo Generation (AI creates test steps)

10. Call `generate_demo_script(ticketId, steps)`
    - Only allowed if review is complete (check_review_complete returned true)
    - Include at least 3 manual test steps
    - Sets status to `human_review`

### Phase 4: Human Review (STOP - Wait for Human)

11. **STOP** - Do not proceed further
    - Ticket is now in `human_review` status
    - Wait for human to review and test

12. Human calls `submit_demo_feedback(ticketId, passed, feedback)`
    - If approved (passed: true) → ticket moves to `done`
    - If rejected (passed: false) → stays in `human_review`, AI can fix and re-submit demo

**Key Rule**: Only humans can move tickets to `done`. AI cannot approve its own work.

---

## Troubleshooting Guide

### Common Errors and How to Fix Them

#### "STATE ENFORCEMENT: You are in 'analyzing' state but tried to write/edit code"

**Root Cause**: You tried to write code while not in a valid code-writing state.

**Valid states for writing**: `implementing`, `testing`, `committing`

**Fix**:

```
update_session_state({
  sessionId: "SESSION-ID-FROM-ERROR",
  state: "implementing"
})
```

Then retry your Write/Edit operation.

#### "CODE REVIEW REQUIRED before push"

**Root Cause**: You tried to push code changes but haven't completed the AI review phase.

**Fix**:

1. Run: `/review` (or call review agents manually)
2. Submit findings: `submit_review_finding({...})`
3. Fix critical/major findings: `mark_finding_fixed({...})`
4. Verify complete: `check_review_complete({ ticketId })`
5. Retry push - should now succeed

#### "Cannot generate demo - open critical findings"

**Root Cause**: You tried to generate demo script but critical/major findings aren't fixed.

**Fix**:

1. Get findings: `get_review_findings({ ticketId, severity: "critical|major" })`
2. Fix each issue in code
3. Call: `mark_finding_fixed({ findingId, status: "fixed" })`
4. Call: `check_review_complete({ ticketId })` - should return complete: true
5. Then call `generate_demo_script()`

#### "Cannot start ticket - previous ticket still in review"

**Root Cause**: A previous ticket is stuck in `human_review` waiting for approval.

**Fix**:
Get the demo script and submit feedback to unblock:

```
demo = get_demo_script({ ticketId: "BLOCKED-TICKET" })
submit_demo_feedback({
  ticketId: "BLOCKED-TICKET",
  passed: true,
  feedback: "Approved"
})
```

Then start your new ticket.

#### "(OpenCode) Plugin not triggering / No error messages"

**Root Cause**: Plugin not installed or not enabled in OpenCode config.

**Fix**:

1. Check `.opencode/opencode.json` has the plugin enabled
2. Check plugin file exists at `.opencode/plugins/brain-dump-*.ts`
3. Restart OpenCode
4. Check console output for plugin load errors

#### "(Claude Code) Hook not triggering"

**Root Cause**: Hook not installed or not configured in `.claude/settings.json`.

**Fix**:

1. Run: `./scripts/setup-claude-code.sh`
2. Verify hooks are installed: `ls ~/.claude/hooks/`
3. Check `.claude/settings.json` has hooks configured
4. Restart Claude Code

#### "State file missing or corrupted"

**Root Cause**: `.claude/ralph-state.json` deleted or invalid JSON.

**Fix**:

1. Create new session: `create_ralph_session({ ticketId })`
   - This will recreate the state file with valid JSON
2. If session exists, manually fix JSON or delete and recreate

#### "Merge conflicts or git errors"

**Root Cause**: Branch conflicts, dirty working directory, or authentication issues.

**Fix**:

1. Resolve git conflicts: `git status`, `git add`, `git merge --abort` if needed
2. Clean working directory: `git clean -fd`, `git restore .`
3. Check authentication: `gh auth status`, `git config user.email`

---

## Plugin Reference (OpenCode Only)

### Plugin 1: State Enforcement (`brain-dump-state-enforcement.ts`)

**What it does**: Blocks Write/Edit tool unless in valid code-writing state

**When it triggers**: Before any Write or Edit tool execution

**Valid states**: `implementing`, `testing`, `committing`

**Error message**: "STATE ENFORCEMENT: You are in '{state}' state but tried to write/edit code."

**How to fix**: Call `update_session_state({ sessionId, state: "implementing" })`

### Plugin 2: Auto-PR Creation (`brain-dump-auto-pr.ts`)

**What it does**: Auto-creates draft GitHub PR after `start_ticket_work` completes

**When it triggers**: After `mcp__brain-dump__start_ticket_work` MCP tool succeeds

**Workflow**:

1. Parse output to get branch name and ticket ID
2. Create empty WIP commit
3. Push branch to remote
4. Create draft PR via `gh pr create --draft`

**Output**: Console message with PR URL and branch name

**Fail-safe**: Doesn't block workflow if git/gh fails

### Plugin 3: Commit Tracking (`brain-dump-commit-tracking.ts`)

**What it does**: Outputs MCP commands to link commits to tickets

**When it triggers**: After Bash tool executes command containing `git commit`

**Workflow**:

1. Check if `.claude/ralph-state.json` exists (only in Ralph mode)
2. Get latest commit hash and message via git
3. Read ticketId from state file
4. Output suggested MCP commands

**Output**: Console message with:

- `link_commit_to_ticket({ ticketId, commitHash })`
- `link_pr_to_ticket({ ticketId, prNumber })` (if PR exists)

**Fail-safe**: Fails silently if not in Ralph mode

### Plugin 4: Review Marker (`brain-dump-review-marker.ts`)

**What it does**: Auto-creates `.claude/.review-completed` marker after review completes

**When it triggers**: After `mcp__brain-dump__check_review_complete` succeeds

**Conditions for creating marker**:

- Output contains `complete: true`, OR
- Output contains `canProceedToHumanReview: true`, OR
- Output shows `openCritical === 0 && openMajor === 0`

**Marker file content**: ISO timestamp (for staleness checking)

**Used by**: `brain-dump-review-guard.ts` checks this marker before allowing push

### Plugin 5: Review Guard (`brain-dump-review-guard.ts`)

**What it does**: Blocks git push/gh pr create until code review is complete

**When it triggers**: Before Bash tool executes `git push` or `gh pr create`

**Validation steps**:

1. Get uncommitted source file changes (exclude .md, package.json, config files)
2. If no changes: allow push (nothing to review)
3. Check for `.claude/.review-completed` marker file
4. If no marker: block with error message
5. If marker exists: check freshness (must be < 30 minutes old)
6. If stale: block with error about needing fresh review
7. If fresh: allow push

**Error message**: Guides user to run `/review` command or review agents

---

## AGENTS.md: The AI Guide

OpenCode requires comprehensive AGENTS.md documentation because plugins provide exception-based feedback, not interactive guidance. AGENTS.md should include:

### Core Sections

1. **Ralph Session Overview**
   - What is a Ralph session
   - When it starts (after `start_ticket_work`)
   - How to tell if you're in Ralph mode (check for `.claude/ralph-state.json`)

2. **State Machine**
   - 7 states: idle, analyzing, implementing, testing, committing, reviewing, done
   - Valid transitions: what state can follow what
   - Which states allow code writing

3. **State Enforcement Rules**
   - Why Write/Edit only allowed in certain states
   - What to do if you see "STATE ENFORCEMENT" error
   - Example: "You are in 'analyzing' state" → call update_session_state

4. **Workflow Entry Point**
   - Always start with: `start_ticket_work(ticketId)`
   - Creates branch, initializes Ralph session
   - Returns branch name to work on

5. **Complete AI Review Workflow**
   - After implementation, call: `complete_ticket_work(ticketId, summary)`
   - Submit findings: `submit_review_finding({...})`
   - Fix critical/major issues
   - Call: `check_review_complete({ ticketId })`
   - Generate demo: `generate_demo_script(ticketId, steps)`
   - **STOP** - Wait for human approval

6. **Self-Review Checklist** (for OpenCode - no external agents available)
   - [ ] Type safety: All types correct, no `any`
   - [ ] Error handling: All errors caught, meaningful messages
   - [ ] Edge cases: Handle null/undefined/empty inputs
   - [ ] Tests: Run `pnpm test`, all pass
   - [ ] Performance: No obvious inefficiencies
   - [ ] Code clarity: Variables named clearly, logic easy to follow

7. **Common Errors & Fixes**
   - Copy-paste error examples and solutions
   - Include exact MCP command calls
   - Provide step-by-step recovery procedures

8. **Troubleshooting**
   - Missing state file
   - Plugin loading issues
   - Git command failures
   - PR creation failures

---

## Installation & Setup

### Claude Code Setup

```bash
# Run installation script
./scripts/setup-claude-code.sh

# Verify hooks are installed
ls ~/.claude/hooks/ | grep enforce
ls ~/.claude/hooks/ | grep create-pr

# Check .claude/settings.json has hooks configured
cat ~/.claude/settings.json | grep hooks
```

### OpenCode Setup

```bash
# Run installation script
./scripts/setup-opencode.sh

# Verify plugins are installed
ls .opencode/plugins/

# Check .opencode/opencode.json has MCP configured
cat .opencode/opencode.json | grep mcp
```

### Multi-Environment Setup

To setup all supported environments:

```bash
./scripts/install.sh
```

This script:

1. Detects installed environments (Claude Code, OpenCode, Cursor, VS Code)
2. Calls appropriate setup script for each
3. Outputs verification instructions
4. Provides next steps for each environment

---

## Performance & Observability

All environments capture identical telemetry:

| Metric              | Captured | Used For                    |
| ------------------- | -------- | --------------------------- |
| Session duration    | ✅       | Track time spent per ticket |
| Tool usage          | ✅       | Which MCP tools used most   |
| Tool duration       | ✅       | Performance bottlenecks     |
| Token counts        | ✅       | Cost analysis               |
| Error rates         | ✅       | Reliability metrics         |
| State transitions   | ✅       | Workflow compliance         |
| Code review metrics | ✅       | Quality metrics             |

Access telemetry in Brain Dump UI:

1. Open ticket detail view
2. Click "Telemetry" tab
3. See all captured events with timestamps

---

## Why This Matters

The Universal Quality Workflow exists because:

1. **Consistency** - Same workflow regardless of environment (Claude Code, OpenCode, Cursor, VS Code)
2. **Quality** - Mandatory code review before human approval prevents bugs
3. **Discipline** - State enforcement prevents accidental merges of unreviewed code
4. **Auditability** - Complete audit trail of who did what, when, and why
5. **Learning** - Telemetry shows patterns and bottlenecks for process improvement

Both Claude Code and OpenCode enforce these principles - they just use different mechanisms to communicate them.

---

## Summary

| Aspect          | Claude Code          | OpenCode            | Shared                                  |
| --------------- | -------------------- | ------------------- | --------------------------------------- |
| **Enforcement** | Shell hooks          | TypeScript plugins  | State file (`.claude/ralph-state.json`) |
| **Feedback**    | Interactive (inline) | Exception-driven    | MCP server (all tools)                  |
| **Guidance**    | Hook messages        | AGENTS.md           | Database schema                         |
| **Telemetry**   | Hooks log via MCP    | Plugins log via MCP | Same metrics captured                   |
| **Outcome**     | Same workflow        | Same workflow       | Same quality results                    |

The key principle: **Different paths, same destination.** Both environments guide AI through the same workflow gates, just using their native extension mechanisms.

For questions or issues, refer to:

- Claude Code details: See `.claude/hooks/` for hook implementations
- OpenCode details: See `.opencode/plugins/` for plugin implementations
- Workflow details: See `CLAUDE.md` "Universal Quality Workflow" section
- MCP tools: See `mcp-server/index.ts` for tool specifications
