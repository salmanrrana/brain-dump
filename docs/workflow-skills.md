# Brain Dump Workflow Skills

These are Claude Code slash commands that help manage the Universal Quality Workflow.

## Installation

Skills are installed to `~/.claude/commands/` and are user-local (not project-specific).

Run the setup script to install:

```bash
scripts/setup-claude-code.sh
```

Or manually copy files:

```bash
cp scripts/skills/*.md ~/.claude/commands/
```

## Available Skills

### `/next-task`

**Purpose**: Intelligently select the next ticket to work on from your backlog

**When to use**:

- Picking up a new ticket after completing one
- Planning your work session
- Getting recommendations on what to work on next

**What it does**:

1. Lists available tickets from your ready/backlog
2. Analyzes by priority, dependencies, and epic context
3. Presents 3-5 recommendations with rationale
4. Starts the selected ticket when you choose

**Example**:

```
/next-task
→ Shows 3 recommended tickets
→ You pick #1
→ System creates branch and sets up tracking
```

---

### `/review-ticket`

**Purpose**: Run AI review agents on completed ticket work to catch issues

**When to use**:

- After implementing a feature and tests pass
- Before moving to human review phase
- Checking code quality before committing

**What it does**:

1. Runs three review agents in parallel:
   - **code-reviewer**: Code quality against CLAUDE.md patterns
   - **silent-failure-hunter**: Error handling gaps
   - **code-simplifier**: Simplification opportunities
2. Submits findings to ticket
3. Summarizes issues by severity
4. Suggests fixes for critical/major issues

**Example**:

```
/review-ticket
→ Agents review your code
→ Findings displayed by severity
→ "3 critical issues found - let's fix them"
```

---

### `/demo`

**Purpose**: Generate a demo script for human review

**When to use**:

- After AI review passes (all critical/major issues fixed)
- Before human approves and marks ticket done
- Creating reproducible test steps for verification

**What it does**:

1. Verifies all review findings are fixed
2. Creates step-by-step demo walkthrough
3. Includes expected outcomes for each step
4. Moves ticket to `human_review` status

**Example**:

```
/demo
→ Creates 5-step demo walkthrough
→ Human reviews each step
→ If all pass → ticket moves to done
→ If issues → ticket returns to in_progress
```

---

### `/review-epic`

**Purpose**: Comprehensive review of an entire epic

**When to use**:

- After completing all tickets in an epic
- Quality gate before release
- Identifying cross-ticket issues

**What it does**:

1. Lists all completed tickets in epic
2. Reviews each for consistency and quality
3. Checks for integration issues between tickets
4. Identifies architectural issues
5. Extracts learnings for future work

**Example**:

```
/review-epic
→ Analyzes all 12 tickets in "Authentication" epic
→ Finds 2 inconsistent patterns
→ Suggests learnings to document
```

---

### `/reconcile-learnings`

**Purpose**: Extract learnings from completed work and update project docs

**When to use**:

- After completing a complex ticket
- After reviewing an entire epic
- When you discover patterns worth standardizing
- To keep CLAUDE.md and project docs current

**What it does**:

1. Identifies patterns, anti-patterns, tool insights
2. Creates learning objects
3. Optionally updates CLAUDE.md/AGENTS.md/README.md
4. Creates audit trail of documentation changes

**Learning types**:

- **pattern**: Approaches that work well ("always use X")
- **anti-pattern**: Things to avoid ("never do Y")
- **tool-usage**: Useful libraries/techniques ("use Z for W")
- **workflow**: Process improvements ("break into smaller tickets")

**Example**:

```
/reconcile-learnings
→ "Drizzle ORM pattern works well, should standardize"
→ Updates CLAUDE.md with DO/DON'T guideline
→ Creates progress comment showing what changed
```

---

## How They Work Together

The workflow is designed to be a pipeline:

```
[Ready Ticket]
    ↓
/next-task
    ↓
[Start ticket, implement feature]
    ↓
/review-ticket
    ↓
[Fix any critical/major issues]
    ↓
/demo
    ↓
[Human reviews and approves]
    ↓
/reconcile-learnings (optional)
    ↓
[Done - learnings recorded]
```

## Configuration

These skills work with Brain Dump MCP tools. Ensure your `~/.claude/settings.json` includes the MCP server:

```json
{
  "mcp": {
    "brain-dump": {
      "type": "local",
      "command": "npx",
      "args": ["tsx", "/path/to/brain-dump/mcp-server/index.ts"]
    }
  }
}
```

## Troubleshooting

**Q: Skills not showing up in Claude Code**

- Ensure files are in `~/.claude/commands/` (not in project)
- Check file names match: `next-task.md`, `review-ticket.md`, etc.
- Restart Claude Code

**Q: "MCP tool not found" error**

- Run `brain-dump doctor` to check if MCP server is accessible
- Verify MCP config in `~/.claude/settings.json`
- Check that Brain Dump project is accessible at the path

**Q: Skills aren't being triggered**

- Use `/next-task` syntax (with slash)
- Ensure you're inside a Brain Dump project or have one configured
- Check that skill description matches what you're typing

## See Also

- [Universal Quality Workflow](./universal-workflow.md)
- [MCP Tools Reference](../mcp-server/README.md)
- [Ralph Agent](./ralph-loop.md)
