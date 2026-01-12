# Ticket-to-Code Workflow

This document describes the complete workflow for implementing a ticket using Brain Dumpy, from selecting work to completing it with proper tracking.

## Overview

The ticket-to-code workflow enables AI assistants to:
1. Pick up a ticket from the backlog
2. Create a feature branch automatically
3. Implement the feature with full context
4. Track commits and files touched
5. Complete work with PR-ready summary
6. Signal for fresh context before next ticket

This workflow works identically in **Claude Code** and **VS Code** environments.

## Prerequisites

- Brain Dumpy MCP server configured and running
- Project registered in Brain Dumpy
- Tickets created in backlog (via breakdown agent or manually)
- Git repository initialized in project

## Workflow Steps

### Step 1: Select a Ticket

Choose a ticket from the backlog based on priority. You can list available tickets using the MCP tool:

```
list_tickets(projectId: "<project-id>", status: "backlog")
```

Or use the `ready` status to see tickets marked ready for implementation:

```
list_tickets(projectId: "<project-id>", status: "ready")
```

**Prioritization:**
- High priority tickets first
- Consider dependencies (blocked tickets can't be started)
- Check for any human_action_required flags

### Step 2: Start Work on Ticket

Use the `start_ticket_work` MCP tool to begin:

```
start_ticket_work(ticketId: "<ticket-id>")
```

**What happens:**
1. **Branch created**: `feature/<short-id>-<ticket-slug>`
   - Example: `feature/025fd80a-define-ticket-to-code-workflow-spec`
2. **Status updated**: Ticket moves to `in_progress`
3. **Context returned**: Full ticket details provided

**Returns:**
```json
{
  "branch": "feature/025fd80a-define-ticket-to-code-workflow-spec",
  "project": { "name": "Brain Dump", "path": "/path/to/project" },
  "ticket": {
    "title": "...",
    "description": "...",
    "priority": "high",
    "tags": ["workflow", "documentation"],
    "subtasks": []
  }
}
```

### Step 3: Post Progress Update

Before starting implementation, post a progress comment:

```
add_ticket_comment(
  ticketId: "<ticket-id>",
  content: "Starting work on [feature]. Will implement [approach].",
  author: "ralph",  // or "claude" depending on agent
  type: "comment"
)
```

This provides visibility into active work for team members viewing Brain Dumpy.

### Step 4: Implement the Feature

Work through the ticket requirements:

1. **Read existing code** - Understand context and patterns
2. **Make changes** - Follow ticket description and acceptance criteria
3. **Run tests** - Ensure quality with `pnpm test` or `npm test`
4. **Run type checks** - Verify types with `pnpm type-check`
5. **Commit incrementally** - Small, focused commits

**Best Practices:**
- Follow existing code patterns in the codebase
- Keep changes focused on ticket scope
- Update tests for new functionality
- Don't over-engineer beyond requirements

### Step 5: Link Files to Ticket

Track which files were modified:

```
link_files_to_ticket(
  ticketId: "<ticket-id>",
  files: ["src/lib/workflow.ts", "src/lib/workflow.test.ts"]
)
```

**Features:**
- Accepts relative or absolute paths
- Auto-normalizes absolute paths to relative
- Prevents duplicate entries
- Enables future queries by file

### Step 6: Commit Changes

Make git commits with proper formatting:

```bash
git add .
git commit -m "feat(<ticket-id>): <description>"
```

**Commit message format:**
- `feat(abc123): Add user authentication`
- `fix(def456): Fix race condition in cache`
- `docs(ghi789): Update API documentation`

### Step 7: Link Commits to Ticket

After committing, link the commit to the ticket:

```
link_commit_to_ticket(
  ticketId: "<ticket-id>",
  commitHash: "a1b2c3d"
)
```

**What happens:**
- Commit hash stored in ticket metadata
- Message auto-fetched from git if not provided
- Creates audit trail for ticket work
- Multiple commits can be linked to one ticket

### Step 8: Complete the Ticket

When all acceptance criteria are met:

```
complete_ticket_work(
  ticketId: "<ticket-id>",
  summary: "Implemented ticket-to-code workflow documentation"
)
```

**What happens:**
1. **Status updated**: Ticket moves to `review`
2. **Git analysis**: Commits on branch compared to main/master
3. **PR description generated**: Ready-to-use markdown
4. **Context reset signal**: Environment-specific guidance returned

**Returns:**
```json
{
  "ticket": { "status": "review", ... },
  "commits": [
    { "hash": "a1b2c3d", "message": "feat: ..." }
  ],
  "suggestedPR": "## Summary\n...",
  "clearContext": true,
  "contextResetGuidance": {
    "environment": "claude-code",
    "message": "Run /clear to start fresh",
    "action": "/clear"
  }
}
```

### Step 9: Create Pull Request

Push your branch and create a PR:

```bash
git push -u origin feature/<ticket-id>-<slug>
gh pr create --base dev --title "feat: <ticket title>" --body "<suggested PR description>"
```

### Step 10: Reset Context (Fresh Eyes)

Follow the context reset guidance for your environment:

| Environment | Action |
|-------------|--------|
| Claude Code | Run `/clear` command |
| VS Code | Start new chat (`Cmd/Ctrl+L`) |
| Other | Start new conversation |

This ensures the next ticket gets worked on with fresh context, preventing accumulated assumptions from causing bugs.

## Complete Example

Here's a full example working on a documentation ticket:

```
# 1. Start work
> start_ticket_work(ticketId: "025fd80a-fcd9-4ab3-8490-38ac086387af")

Branch created: feature/025fd80a-define-ticket-to-code-workflow-spec
Status: in_progress

# 2. Post progress
> add_ticket_comment(ticketId: "025fd80a", content: "Starting workflow docs", author: "ralph", type: "comment")

Comment added!

# 3. Implement (create documentation file)
# ... write code/docs ...

# 4. Link files
> link_files_to_ticket(ticketId: "025fd80a", files: ["plans/workflows/ticket-to-code.md"])

Files linked: plans/workflows/ticket-to-code.md

# 5. Commit
$ git add . && git commit -m "docs(025fd80a): Add ticket-to-code workflow documentation"

# 6. Link commit
> link_commit_to_ticket(ticketId: "025fd80a", commitHash: "f4e5d6c")

Commit linked!

# 7. Complete work
> complete_ticket_work(ticketId: "025fd80a", summary: "Created comprehensive workflow documentation")

Status: review
Context reset: Run /clear for fresh start

# 8. Push and PR
$ git push -u origin feature/025fd80a-define-ticket-to-code-workflow-spec
$ gh pr create --base dev --title "docs: Add ticket-to-code workflow" --body "..."

# 9. Reset context
$ /clear
```

## MCP Tools Reference

| Tool | Purpose | Required Parameters |
|------|---------|---------------------|
| `list_tickets` | Find tickets to work on | projectId (optional) |
| `start_ticket_work` | Begin work, create branch | ticketId |
| `add_ticket_comment` | Post progress updates | ticketId, content, author |
| `link_files_to_ticket` | Track modified files | ticketId, files |
| `link_commit_to_ticket` | Track commits | ticketId, commitHash |
| `complete_ticket_work` | Finish work, move to review | ticketId |

## Environment Consistency

This workflow is designed to work identically in both:

### Claude Code
- MCP tools accessed via `mcp__brain-dumpy__<tool>`
- Context reset via `/clear` command
- Terminal commands via bash tool

### VS Code
- MCP tools accessed via configured server
- Context reset via new chat session
- Terminal commands via integrated terminal

The same ticket workflow applies regardless of environment. Brain Dumpy detects your environment and provides appropriate guidance.

## Integration with Ralph

Ralph (Brain Dumpy's autonomous agent) follows this workflow automatically:

1. Reads backlog and picks highest priority ticket
2. Calls `start_ticket_work` to begin
3. Posts progress updates during implementation
4. Links files and commits as it works
5. Calls `complete_ticket_work` when done
6. Context resets between iterations

See `docs/fresh-eyes-workflow.md` for details on the Fresh Eyes pattern.

## Troubleshooting

### Branch Already Exists

If `start_ticket_work` finds an existing branch, it checks it out instead of creating a new one. This allows resuming work on a ticket.

### Ticket Already In Progress

You'll get a message indicating the ticket is already being worked on. You can:
- Continue working on it
- Check for stale work and manually update status

### Git Not Initialized

The project path must be a git repository. Initialize with:
```bash
git init
git add .
git commit -m "Initial commit"
```

### Missing Commits in Completion

If no commits appear in the completion summary, ensure you committed on the feature branch, not main/master.

## Next Steps

After completing a ticket:
1. Wait for PR review
2. Address any feedback
3. Merge when approved
4. Pick up next ticket with fresh context
