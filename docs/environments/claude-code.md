# Claude Code Integration Guide

Brain Dump provides deep integration with Claude Code for AI-assisted development with guaranteed quality.

## Quick Start

### Installation

```bash
./scripts/install.sh --claude
```

This installs:

- Hooks in `~/.claude/hooks/`
- Settings in `~/.claude/settings.json`
- Brain Dump MCP server config

Verify with:

```bash
brain-dump doctor
```

### Using Brain Dump in Claude Code

1. **Open Brain Dump**

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. **Click "Start with Claude" on any ticket**
   - Claude opens in your terminal
   - Full ticket context is loaded
   - `.claude/ralph-state.json` tracks your session

3. **Start working**

   ```
   > /start-ticket-work ticketId
   ```

4. **Code, commit, test**
   - Write code normally
   - Make commits: `git commit -m "feat(ticket-id): ..."`
   - Run tests: `pnpm test`
   - Hooks track your work automatically

5. **Complete implementation**

   ```
   > workflow tool, action: "complete-work", ticketId, "summary of changes"
   ```

6. **Run AI review**

   ```
   > /review-ticket
   ```

7. **Fix findings and generate demo**

   ```
   > /demo
   ```

8. **Demo approval**
   - Go back to Brain Dump UI
   - Find your ticket in `human_review` column
   - Click "Start Demo Review"
   - Run through demo steps
   - Approve or request changes

## Features Unique to Claude Code

### Hook-Based Enforcement

Hooks provide intelligent guidance:

```
You: "I'll write the file now"

Hook: "BLOCKED - You are in 'analyzing' state but tried to write code.
       Call session 'update-state' with state: 'implementing' first."

You: Call session "update-state" with state: "implementing"
     Retry writing the file → Success ✓
```

**What this means:**

- Prevents accidentally skipping steps
- Guides you through the workflow naturally
- Doesn't block legitimate work, just wrong-state work

### Automatic Telemetry Capture

Hooks automatically capture:

- Every tool call (Read, Write, Edit, Bash, MCP tools)
- Tool duration
- Tool success/failure
- User prompts

This creates an audit trail visible in the ticket's "Telemetry" tab.

### Automatic Task Capture

When you use `TodoWrite` (Claude's built-in task list), Brain Dump automatically captures your tasks:

```
You: Use TodoWrite to create tasks

Brain Dump: Auto-captures to ticket_id:
- Task 1: status, description, etc.
- Task 2: status, description, etc.

User sees: Tasks in ticket detail page
```

### Automatic Commit Linking

After you commit:

```bash
$ git commit -m "feat(abc-123): Add validation"

Hook output:
✓ Commit abc12ef linked to ticket abc-123

UI shows: Commit linked in ticket detail
```

## Hooks Explained

Brain Dump installs 6 hooks to your Claude Code configuration:

### `enforce-state-before-write.sh` (PreToolUse)

**When:** Before any Write/Edit operation

**Checks:** Are you in 'implementing', 'testing', or 'committing' state?

**If not:** Blocks with helpful message suggesting which MCP tool to call

**Why:** Ensures work is properly tracked in Brain Dump

**Example:**

```
You try: Edit file
Hook: "You're in 'analyzing' state. Call session 'update-state' with state: 'implementing' first."
You call: session "update-state" with state: "implementing"
You retry: Edit file → Success
```

### `capture-claude-tasks.sh` (PostToolUse)

**When:** After TodoWrite tool is used

**Does:** Converts your task format to Brain Dump format and saves to database

**Why:** Your task breakdowns become visible in Brain Dump UI

**Example:**

```
You: Create 5 todos with TodoWrite
Hook: Captures them → They appear in ticket detail
```

### `link-commit-to-ticket.sh` (PostToolUse)

**When:** After `git commit` command

**Does:**

1. Reads commit hash and message
2. Outputs MCP command to link to active ticket
3. Also outputs command to link PR if one exists

**Why:** Git history stays connected to tickets

**Example:**

```
$ git commit -m "feat(abc-123): Add validation"

Hook outputs:
workflow tool, action: "link-commit", ...
workflow tool, action: "link-pr", ...

UI shows: "Commit abc12ef" linked in ticket
```

### `start-telemetry-session.sh` (SessionStart)

**When:** Claude Code session starts

**Does:** Detects active ticket from `.claude/ralph-state.json`

**Prompts:** "Call `telemetry "start"` to begin telemetry capture"

**Why:** Background tracking of your tool usage and prompts

### `end-telemetry-session.sh` (Stop)

**When:** Claude Code session ends (you exit)

**Does:**

1. Flushes any pending telemetry events
2. Calls `telemetry "end"` MCP tool
3. Cleans up temp files

**Why:** Finalizes the telemetry record in database

### `log-prompt.sh` (UserPromptSubmit)

**When:** You submit a prompt to Claude

**Does:** Records your prompt (can be hashed for privacy)

**Why:** Complete audit trail of what you asked Claude to do

## Commands

### Start Work

```
/start-ticket-work ticketId
```

- Creates git branch `feature/{ticket-id}`
- Sets ticket status to `in_progress`
- Creates Ralph session
- Returns with full ticket context

### Complete Work

```
/complete-ticket-work ticketId "summary of what you did"
```

- Requires: Validation passed (`pnpm type-check`, `pnpm lint`, `pnpm test`)
- Moves ticket to `ai_review`
- Starts AI review if enabled
- Suggests next ticket

### Run Review

```
/review-ticket
```

- Runs all 3 review agents in parallel
- Submits findings to current ticket
- Lists issues to fix
- Suggests fixes for critical/major issues

### Generate Demo

```
/demo
```

- Analyzes ticket and implementation
- Generates step-by-step test instructions
- Moves ticket to `human_review`
- Shows demo preview

### Select Next Ticket

```
/next-task
```

- Shows top 3 recommended tickets
- Considers priority and dependencies
- Starts work on selected ticket

## Skills Available

All skills work via slash commands:

- `/next-task` - Select next ticket
- `/review-ticket` - Run AI review
- `/review-epic` - Review entire epic
- `/demo` - Generate demo script
- `/reconcile-learnings` - Extract learnings

[Full skills reference →](../universal-workflow.md#skills-workflow-shortcuts)

## Troubleshooting

### "STATE ENFORCEMENT: You must call session update-state first"

**Cause:** You tried to write/edit code but Claude Code hooks detected you're not in the right state

**Fix:**

1. Read the message carefully - it tells you exactly what to call
2. Call the MCP tool it suggests: `session` tool, `action: "update-state"`, `sessionId: "..."`, `state: "implementing"`
3. Retry your operation

This is intentional - it ensures your work is properly tracked.

### "Validation failed: 1 test failing"

**Cause:** You tried to complete work but tests don't pass

**Fix:**

1. Run `pnpm test` to see which tests fail
2. Fix the code
3. Commit: `git commit -m "fix: ..."`
4. Retry `workflow "complete-work"`

### "Cannot proceed - open critical findings"

**Cause:** You tried to generate a demo but critical issues remain from AI review

**Fix:**

1. Run `/review-ticket` again
2. Address all critical/major findings
3. Try `/demo` again

### "Hooks are not working"

**Check 1:** Verify installation

```bash
brain-dump doctor
```

Should show: `✓ Claude Code: installed and configured`

**Check 2:** Check hook files exist

```bash
ls ~/.claude/hooks/
# Should show: capture-claude-tasks.sh, enforce-state-before-write.sh, etc.
```

**Check 3:** Check Claude Code settings

```bash
cat ~/.claude/settings.json
# Should show PreToolUse and PostToolUse hooks configured
```

**Check 4:** Test a hook manually

```bash
~/.claude/hooks/enforce-state-before-write.sh

# Should output JSON indicating whether state is valid
```

If any of these fail, reinstall:

```bash
./scripts/install.sh --claude
```

### "I want to disable hooks temporarily"

You can disable hooks in Claude Code without uninstalling:

1. Open `~/.claude/settings.json`
2. Comment out or remove the hooks array
3. Restart Claude Code session

To re-enable, reinstall:

```bash
./scripts/install.sh --claude
```

## Best Practices

### Commit Often

Commits are linked to tickets automatically. More commits = better history.

```bash
git commit -m "feat(abc-123): Add validation"      # ✓ Good
git commit -m "feat(abc-123): Add validation, fix error handling"  # ✓ Also good
git commit -m "work"  # ✗ Not descriptive
```

### Use Claude Tasks for Micro-Planning

When starting a ticket, create a task list:

```
1. Read requirements
2. Design data structure
3. Write database migration
4. Implement API endpoint
5. Add tests
6. Run full validation
```

Brain Dump captures these automatically and shows them in the ticket.

### Check Telemetry

After completing a ticket, view the telemetry:

1. Go to Brain Dump UI
2. Open your completed ticket
3. Click "Telemetry" tab
4. See:
   - Tool usage breakdown (how many Read, Write, Edit, etc.)
   - Total time spent
   - Token usage
   - Error rate

This helps you understand your workflow and improve.

### Let AI Review Run Its Course

The AI review fix loop is normal:

```
Iteration 1: 3 issues found
Iteration 2: 1 issue fixed, 2 remain
Iteration 3: 2 issues fixed, 1 remains
Iteration 4: All fixed → Demo ready
```

This is how quality is built in. Don't interrupt the loop.

## Advanced: Ralph Mode

Ralph is an autonomous agent that works your backlog automatically:

```bash
./scripts/ralph-epic-universal-workflow.sh
```

Ralph:

1. Picks the next unfinished ticket
2. Implements it through to demo-ready
3. Repeats until all tickets are in `human_review` or `done`

Ralph uses the same workflow and hooks as interactive Claude Code.

## Reference

- [Universal Quality Workflow](../universal-workflow.md)
- [CLAUDE.md Workflow Section](../../CLAUDE.md#universal-quality-workflow)
- [MCP Tools Reference](../mcp-tools.md)
- [Installation Guide](../../README.md#choose-your-environment)
