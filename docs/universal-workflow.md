# Universal Quality Workflow

**Brain Dump's guarantee: Same quality output regardless of which AI coding environment you use.**

## Overview

The Universal Quality Workflow ensures consistent code quality by enforcing a structured review → fix → demo → approval flow in every AI coding environment (Claude Code, Cursor, VS Code, OpenCode).

This document is the authoritative guide to the workflow. For implementation details, see [plans/specs/universal-quality-workflow.md](../plans/specs/universal-quality-workflow.md).

## Quick Start

### Your First Ticket

```bash
# 1. Open Brain Dump
pnpm dev    # http://localhost:4242

# 2. Click "Start with Claude" on any ticket
# → Claude opens with full context

# 3. Write code, add tests, make commits
# → Tasks are captured automatically as you work

# 4. When done, Claude calls workflow tool "complete-work"
# → Ticket moves to AI review automatically

# 5. AI review agents check your code
# → You'll see findings in the ticket

# 6. Fix any issues the agents found
# → Once all critical/major issues fixed, demo is ready

# 7. Human (you) approves the demo
# → Ticket moves to done
```

## The Status Flow

```
┌──────────┐
│ backlog  │  Waiting to be picked up
└────┬─────┘
     │ (ready status, AI starts work)
     ▼
┌──────────────┐
│ in_progress  │  AI is writing code
└────┬─────────┘
     │ (code done, tests pass)
     ▼
┌──────────┐        ┌────────────┐
│ ai_review│───→    │ Fix Loop:  │
└────┬─────┘        │ - Review   │
     │              │ - Fix      │
     │              │ - Repeat   │
     ▼              └────────────┘
┌──────────────┐     (All critical/major fixed)
│ human_review │  AI generated demo, waiting for you
└────┬─────────┘
     │ (You ran demo, gave feedback)
     ▼
┌─────┐
│ done│  Complete and approved
└─────┘
```

## Detailed Workflow Phases

### Phase 1: Start Work

**Command**: `workflow` tool, `action: "start-work"`, `ticketId`

What happens:

- Git branch created: `feature/{ticket-id}`
- Ticket status: → `in_progress`
- Telemetry session starts
- Ticket comment: "Started work on ticket"

**You can now:**

- Write code
- Make commits (automatically linked to ticket)
- Ask questions in ticket comments
- Use Claude tasks for sub-planning

### Phase 2: Implementation

The AI writes code, runs tests, and creates commits.

**Automatic tracking:**

- Claude tasks are captured (you see the AI's micro-plan)
- Git commits are linked to the ticket
- Test results are logged in telemetry

**Requirements to pass this phase:**

- `pnpm type-check` must pass (no TypeScript errors)
- `pnpm lint` must pass (no style violations)
- `pnpm test` must pass (all tests green)

If any fail, AI cannot complete the ticket.

**Ticket comments show:**

- "✓ Validation passed: type-check, lint, test"

### Phase 3: Complete Implementation

**Command**: `workflow` tool, `action: "complete-work"`, `ticketId`, `summary`

What happens:

- Ticket status: → `ai_review`
- Work summary added to ticket comments
- AI review begins automatically (if enabled)

**Work summary includes:**

- What was implemented
- Files changed
- Tests added
- Any assumptions made

### Phase 4: AI Review (The Fix Loop)

Three review agents run:

1. **code-reviewer** - Checks code quality against project guidelines
2. **silent-failure-hunter** - Identifies error handling issues and silent failures
3. **code-simplifier** - Suggests refactoring and simplification

**What happens:**

- Findings are submitted: `review` tool, `action: "submit-finding"`, `ticketId`, finding params
- Critical/major findings MUST be fixed
- Minor/suggestion findings are optional

**The fix loop:**

```
1. AI Review agents find issues
   ↓
2. Findings submitted to ticket
   ↓
3. AI reads findings, fixes code
   ↓
4. Run tests again
   ↓
5. Review iteration increments
   ↓
   → Loop back to step 1 if issues remain
   → Proceed to demo generation if all critical/major fixed
```

**Ticket comments show:**

- "Starting AI review (iteration 1)"
- "Found 2 issues: 1 critical, 1 major"
- "Fixed: Missing null check in parser [critical]"
- "AI review passed after 2 iterations"

### Phase 5: Generate Demo

**Command**: `review` tool, `action: "generate-demo"`, `ticketId`, `steps`

Requirements to call this:

- Ticket MUST be in `ai_review` status
- NO open critical findings
- NO open major findings

What happens:

- Demo script created with step-by-step instructions
- Ticket status: → `human_review`
- Ticket comment: "Demo script generated with {n} steps"

**Demo steps include:**

- How to set up
- Core functionality verification
- Edge case testing
- Visual confirmation points

### Phase 6: Human Review (Demo Approval)

**You (the human) do:**

1. Open ticket detail
2. Find "Demo Ready" badge
3. Click "Start Demo Review"
4. Run through each step
5. Mark step as "Passed", "Failed", or "Skipped"
6. Approve or request changes

**If Approved**: Ticket → `done` ✓

**If Changes Requested**: Ticket stays in `human_review` with feedback

- AI reads feedback comment
- AI fixes issues
- Loop back to Phase 4: AI Review

**Ticket comments show:**

- Step 1 of 5: Setup database
- Step 2 of 5: Create user account
- ✓ Step 3 of 5: Login succeeds
- ✗ Step 4 of 5: Profile page missing avatar field
- "Requested changes: Add avatar support to user profile"

### Phase 7: Reconcile Learnings (Optional)

**Command**: `epic` tool, `action: "reconcile-learnings"`, `ticketId`, `learnings`

After ticket completion, extract insights:

- **Patterns** - "Always validate input at API boundary"
- **Anti-patterns** - "Don't use setState in callbacks"
- **Tool usage** - "Zod is best for runtime validation"
- **Workflow** - "Demo scripts save time on edge cases"

These can optionally update:

- `CLAUDE.md` - Project guidelines
- `AGENTS.md` - Workflow guidance
- `specs/` - Feature specifications

This ensures the project continuously improves from each ticket's learnings.

## Environment-Specific Details

### Claude Code

**How it works:**

- Click "Start with Claude" on any ticket
- Claude opens with full context
- Hooks automatically track state
- Telemetry hooks capture tool usage

**What's enforced:**

- State transitions via hooks
- Write/edit operations only in "implementing" state
- Work gets properly tracked

**Setup:**

```bash
./scripts/install.sh --claude
```

**Troubleshooting:**

```bash
brain-dump doctor
```

[Full Claude Code guide →](environments/claude-code.md)

### Cursor

**How it works:**

- Cursor supports hooks (similar to Claude Code)
- Same workflow enforcement as Claude Code
- Full telemetry capture

**What's enforced:**

- Same state-based enforcement
- Same quality gates

**Setup:**

```bash
./scripts/install.sh --cursor
```

[Full Cursor guide →](environments/cursor.md)

### VS Code (Copilot)

**How it works:**

- MCP server provides all tools
- Custom instructions guide workflow
- No hook enforcement (MCP preconditions instead)

**What's enforced:**

- MCP tool preconditions block invalid operations
- Instructions provide guidance via prompts

**Setup:**

```bash
./scripts/install.sh --vscode
```

**To use:**

- Use custom instructions in Copilot Chat
- All Brain Dump tools available in MCP

[Full VS Code guide →](environments/vscode.md)

### OpenCode

**How it works:**

- OpenCode plugin handles telemetry
- MCP server provides tools
- 40+ lifecycle events for tracking

**What's enforced:**

- Same MCP preconditions
- Plugin tracks sessions automatically

**Setup:**

```bash
./scripts/install.sh --opencode
```

[Full OpenCode guide →](environments/opencode.md)

## MCP Tools (The Workflow Engine)

These tools enforce the workflow in all environments:

| Tool + Action                | Purpose                  | Preconditions               |
| ---------------------------- | ------------------------ | --------------------------- |
| `workflow` `start-work`      | Begin work               | No other ticket in_progress |
| `workflow` `complete-work`   | Finish implementation    | Validation passed           |
| `review` `submit-finding`    | Report issue from review | Ticket in ai_review         |
| `review` `mark-fixed`        | Mark issue resolved      | Finding exists              |
| `review` `check-complete`    | Check if review passed   | Findings submitted          |
| `review` `generate-demo`     | Create test instructions | No critical/major findings  |
| `review` `submit-feedback`   | Record human feedback    | Demo script exists          |
| `epic` `reconcile-learnings` | Update project docs      | Ticket in done              |

## Telemetry & Observability

Every phase creates a ticket comment for audit trail:

```
Activity
─────────────────────────────────────────
🤖 claude - Started work on ticket. Branch: feature/abc-123
🤖 claude - Created micro-plan with 5 tasks
🤖 claude - Validation passed: type-check ✓, lint ✓, test ✓
🤖 claude - Starting AI review (iteration 1)
🤖 claude - Found 2 issues: 1 critical, 1 major
🤖 claude - Fixed: Missing validation [critical]
🤖 claude - AI review passed after 2 iterations
🤖 claude - Demo script generated with 5 steps
👤 user - Approved. "Looks great!"
```

Plus detailed telemetry:

- Tool usage breakdown (Read: 45, Edit: 12, Bash: 8)
- Time spent in each phase
- Token usage
- Error rate

View in ticket detail → "Telemetry" tab.

## Skills (Workflow Shortcuts)

Claude Code skills provide shortcuts for common operations:

### `/next-task`

Intelligently select the next ticket to work on.

```
/next-task
```

Considers:

- Priority (high > medium > low)
- Dependencies (unblocked tickets first)
- Epic context (continue current epic if possible)

Shows top 3 recommendations with rationale.

### `/review-ticket`

Run AI review agents on current ticket.

```
/review-ticket
```

Runs all 3 agents in parallel, submits findings, lists issues to fix.

### `/review-epic`

Run Tracer Review on entire epic (multiple tickets).

```
/review-epic
```

Finds cross-ticket patterns and consistency issues.

### `/demo`

Generate demo script for human review.

```
/demo
```

Analyzes requirements, generates step-by-step test instructions.

### `/reconcile-learnings`

Extract learnings from completed work.

```
/reconcile-learnings
```

Identifies patterns and optionally updates CLAUDE.md and specs.

## Common Issues & Fixes

### "Cannot proceed - open critical findings"

You tried to generate a demo script while issues remain.

**Fix:**

- Run `/review-ticket` again
- Fix any remaining critical/major findings
- Try generating demo again

### "Ticket must be in ai_review to submit findings"

You tried to submit a finding for a ticket not in AI review.

**Fix:**

- Call `workflow` tool `complete-work` first
- This moves the ticket to `ai_review`
- Then submit findings

### "Cannot start ticket - previous ticket still in review"

A previous ticket is waiting for human feedback.

**Fix:**

- Review and approve/reject the previous ticket
- Then start the new one

### "Validation failed: 1 test failing"

You tried to complete work but tests don't pass.

**Fix:**

- Run `pnpm test` to see which tests fail
- Fix the code
- Re-commit
- Try `workflow` `complete-work` again

## Configuration

### Install for All Environments

```bash
./scripts/install.sh --all
```

This configures:

- Claude Code hooks and settings
- Cursor hooks and settings
- OpenCode plugin and config
- VS Code MCP and instructions

### Check Configuration

```bash
brain-dump doctor
```

Shows:

- ✓/✗ Claude Code configured
- ✓/✗ Cursor configured
- ✓/✗ OpenCode configured
- ✓/✗ VS Code configured

Any issues are listed with fix suggestions.

### Uninstall

```bash
./scripts/uninstall.sh
```

Cleanly removes all Brain Dump configurations without breaking other setups.

## Advanced: Ralph Autonomous Mode

Ralph is an agent that works your backlog automatically:

```bash
# Start Ralph on an epic
./scripts/ralph-epic-universal-workflow.sh
```

Ralph:

1. Picks the next unfinished ticket
2. Calls `workflow` `start-work`
3. Implements and tests
4. Calls `workflow` `complete-work`
5. Runs AI review
6. Generates demo
7. Repeats until all tickets are in `human_review` or `done`

Ralph respects the same workflow as interactive mode. All tickets are reviewed and demo-ready before Ralph stops.

## Architecture

### MCP Server (Workflow Engine)

The MCP server (`mcp-server/index.ts`) is the enforcement point:

- All MCP tools in one place
- Preconditions checked for every operation
- Comments and telemetry created automatically
- Works identically in all environments

### Hooks (Claude Code & Cursor)

Hooks provide guidance through feedback:

- State enforcement (you must call the right MCP tool before editing)
- Telemetry capture (tool usage recorded automatically)
- Commit linking (git commits linked to tickets automatically)

Hooks are **Claude Code and Cursor specific**. Other environments use MCP preconditions instead.

### Database Schema

Tables for workflow state:

- `ticket_workflow_state` - Current phase, review iteration, demo status
- `review_findings` - Issues found by review agents
- `demo_scripts` - Demo steps and feedback
- `epic_workflow_state` - Learning collection for epics

See `src/lib/schema.ts` for full schema.

## Best Practices

### Writing Good Demo Steps

Demo steps should:

1. Be specific ("Click the 'Login' button" not "Log in")
2. State expected outcome clearly ("Profile page loads" not "Check if it works")
3. Cover both happy path and edge cases
4. Include visual verification points
5. Take 5-15 minutes total to run through

Example:

```markdown
1. Navigate to /signup
   Expected: Registration form with email, password, name fields

2. Enter invalid email "not-an-email"
   Expected: Error message "Invalid email format"

3. Enter valid email and short password "123"
   Expected: Error message "Password must be 8+ characters"

4. Enter valid credentials
   Expected: Account created, redirect to dashboard
```

### Fixing Review Findings

When the review agents find issues:

1. **Read the issue** - Understand what the agent found
2. **Review the suggestion** - Is it valid?
3. **Reproduce** - If code issue, try to reproduce locally
4. **Fix** - Make minimal fix, no refactoring
5. **Test** - Run full test suite
6. **Commit** - Commit with message "fix(review): {issue}"
7. **Mark fixed** - Call `review` `mark-fixed`

### Keeping Learning Artifacts Fresh

After completing tickets:

- Extract 1-2 learnings
- Update CLAUDE.md if workflow-related
- Update specs if technical decision-related
- Update AGENTS.md if tool/skill-related

This keeps the project knowledge fresh and helps future work.

## Reference

- [Universal Quality Workflow Spec](../plans/specs/universal-quality-workflow.md)
- [CLAUDE.md Workflow Section](../CLAUDE.md#universal-quality-workflow)
- [MCP Tools Reference](mcp-tools.md)
- [Environment Setup Guides](environments/)
