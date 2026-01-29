# VS Code (Copilot) Integration Guide

VS Code doesn't have hooks like Claude Code or Cursor, but Brain Dump works through custom instructions and MCP tools.

## Quick Start

### Installation

```bash
./scripts/install.sh --vscode
```

This creates:

- `.vscode/mcp.json` - MCP server configuration
- `.github/copilot-instructions.md` - Custom instructions for Copilot
- Brain Dump MCP server config

Verify with:

```bash
brain-dump doctor
```

### Using Brain Dump in VS Code

1. **Open Brain Dump**

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. **Click "Start with VS Code" on any ticket**
   - Opens in your VS Code window
   - Custom instructions guide you
   - MCP tools available in Copilot Chat

3. **In Copilot Chat, call MCP tools**

   ```
   @brain-dump start_ticket_work ticketId
   ```

4. **Code and test normally**
   - Write code in editor
   - Run tests in terminal
   - Make commits

5. **Use MCP tools in Copilot Chat**

   ```
   @brain-dump complete_ticket_work ticketId "summary"

   @brain-dump /review-ticket

   @brain-dump /demo
   ```

## How vs Code Differs

### No Hooks

VS Code doesn't support hooks, so there's no automatic enforcement:

| Feature           | Claude Code/Cursor | VS Code               |
| ----------------- | ------------------ | --------------------- |
| State enforcement | Automatic (hooks)  | Manual (instructions) |
| Commit linking    | Automatic (hooks)  | Manual (MCP tool)     |
| Telemetry capture | Automatic (hooks)  | Manual (MCP tool)     |
| Task capture      | Automatic (hooks)  | Not supported         |

### Custom Instructions Instead

VS Code uses custom instructions (in `.github/copilot-instructions.md`) to guide the workflow:

```markdown
# Brain Dump Workflow

When working on tickets in this project:

## Starting Work

1. Always call `start_ticket_work` before writing code
2. This creates a branch and sets status to in_progress

## During Development

- Commit frequently with `feat(<ticket-id>): ...` format
- Call `link_commit_to_ticket` after each commit

## Completing Work

1. Ensure validation passes: `pnpm type-check`, `pnpm lint`, `pnpm test`
2. Call `complete_ticket_work` with summary
3. Run `/review-ticket` to trigger AI review
   ...
```

These instructions help guide your work, but they're **not enforced** - you can skip steps if you want.

### MCP Preconditions (Soft Enforcement)

MCP tools have preconditions that provide **soft enforcement**:

```typescript
// Example: generate_demo_script
if (ticket.status !== "ai_review") {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          "Ticket must be in ai_review status to generate demo.\n" +
          "First run /review-ticket to complete AI review.",
      },
    ],
  };
}
```

This means:

- MCP tools won't let you do invalid operations
- But the error is just a message, not a hard block
- You could theoretically work around it

**In practice:** Just follow the guidance. It's all there for a reason.

## Workflow

### Phase 1: Start Work

```
You: @brain-dump start_ticket_work ticketId

MCP tool:
✓ Creates git branch: feature/{ticket-id}
✓ Sets status to in_progress
✓ Returns: Full ticket context

You: Now code normally
```

### Phase 2: Implementation

Write code, make commits, run tests:

```bash
# Write code in editor
# ...

# Commit (manually call MCP tool in chat)
@brain-dump link_commit_to_ticket ticketId abc12ef

# Run tests
pnpm test
```

### Phase 3: Complete & Review

```
You: @brain-dump complete_ticket_work ticketId "Added validation layer"

MCP tool:
✓ Requires validation passed
✓ Sets status to ai_review
✓ Triggers AI review (if enabled)

You: @brain-dump /review-ticket

MCP tool:
✓ Runs 3 review agents
✓ Submits findings
✓ Lists issues to fix

You: Fix findings, commit, repeat until clean
```

### Phase 4: Demo & Approval

```
You: @brain-dump /demo

MCP tool:
✓ Generates demo steps
✓ Sets status to human_review

You: Go to Brain Dump UI
     Click "Start Demo Review"
     Run through steps
     Approve or request changes
```

## Commands in Copilot Chat

### MCP Tools

Invoke via `@brain-dump` mention:

```
@brain-dump start_ticket_work abc-123
@brain-dump complete_ticket_work abc-123 "summary"
@brain-dump link_commit_to_ticket abc-123 abc12ef
@brain-dump /review-ticket
@brain-dump /demo
@brain-dump /next-task
@brain-dump /reconcile-learnings
```

All the same tools as Claude Code and Cursor.

### Brain Dump Agents (if available)

Some VS Code setups support agents:

```
@ralph        # Autonomous agent mode
@ticket-worker # Single ticket implementation
@planner      # Create plans from requirements
```

These are optional and depend on your VS Code setup.

## Troubleshooting

### "MCP server not responding"

**Check 1:** Verify MCP configuration

```bash
cat .vscode/mcp.json
```

Should have `brain-dump` server configured.

**Check 2:** Start the MCP server manually (if needed)

```bash
node /path/to/brain-dump/mcp-server/dist/index.js
```

**Check 3:** Check VS Code MCP extension is installed

- Install: "MCP Extension" or equivalent

**Check 4:** Restart VS Code

### "Tool not found in Copilot Chat"

**Possible causes:**

1. MCP server not running
2. MCP configuration wrong
3. VS Code MCP extension not installed

**Fix:**

```bash
./scripts/install.sh --vscode
# Then restart VS Code
```

### "I forgot to call start_ticket_work"

**No problem!** You can still call it mid-ticket:

```
@brain-dump start_ticket_work abc-123
```

This creates the branch and sets status. Your commits won't be linked unless you also call:

```
@brain-dump link_commit_to_ticket abc-123 abc12ef
```

For each commit.

### "I want to manually link commits"

If you forgot to call `link_commit_to_ticket`:

```bash
# Get commit hash
git log --oneline -n 1
# abc12ef My commit message

# In Copilot Chat:
@brain-dump link_commit_to_ticket abc-123 abc12ef
```

This retroactively links the commit.

## Best Practices

### Keep Custom Instructions in Mind

The instructions in `.github/copilot-instructions.md` guide your workflow. Review them occasionally:

```bash
cat .github/copilot-instructions.md
```

### Always Call start_ticket_work

Even though it's not enforced, always call it:

```
@brain-dump start_ticket_work abc-123
```

This ensures:

- Branch is created
- Status is tracked
- Telemetry session begins (if MCP telemetry enabled)

### Link Commits Regularly

Commit linking connects your git history to tickets:

```bash
# After committing:
@brain-dump link_commit_to_ticket abc-123 abc12ef
```

Or do it batch style:

```bash
# Get all commits on your branch
git log origin/main..HEAD --pretty=format:"%h"

# Link them all
@brain-dump link_commit_to_ticket abc-123 abc12ef
@brain-dump link_commit_to_ticket abc-123 def45gh
@brain-dump link_commit_to_ticket abc-123 ghi67jk
```

### Use Copilot's Full Context

Since VS Code has full codebase context, leverage it:

- Reference existing patterns: "Add validation like in src/lib/validate.ts"
- Ask about file locations: "Where should I add this new API?"
- Request optimizations: "Refactor this to match project style"

### Run Full Validation

Always validate before completing:

```bash
pnpm check    # runs type-check, lint, test
```

Only then call:

```
@brain-dump complete_ticket_work abc-123 "Added validation layer"
```

## Comparison: VS Code vs Claude Code vs Cursor

| Feature            | VS Code              | Claude Code  | Cursor       |
| ------------------ | -------------------- | ------------ | ------------ |
| Hook enforcement   | ❌ No                | ✅ Yes       | ✅ Yes       |
| Instructions       | ✅ Yes               | ✅ Yes       | ✅ Yes       |
| Soft enforcement   | ✅ MCP preconditions | ✅ Hooks     | ✅ Hooks     |
| Telemetry          | ✅ Manual            | ✅ Automatic | ✅ Automatic |
| Commit linking     | ✅ Manual            | ✅ Automatic | ✅ Automatic |
| Multi-file editing | ⚡ Excellent         | ✅ Good      | ⚡ Excellent |
| Cost               | 💳 Varies            | 💰 Medium    | 💰 High      |
| Codebase knowledge | ✅ Good              | ✅ Good      | ⚡ Excellent |

**When to use VS Code:**

- Already using Copilot
- Don't need automatic enforcement
- Want familiar editor experience
- Budget-conscious

**When to use Claude Code/Cursor:**

- Want automatic enforcement
- Want automatic telemetry
- Dedicated AI coding experience preferred

## Advanced: Manual Telemetry

If you want to track your work manually:

```bash
# Start telemetry session
curl -X POST http://localhost:3000/api/telemetry/start \
  -H "Content-Type: application/json" \
  -d '{"ticketId": "abc-123"}'

# ... do your work ...

# End telemetry session
curl -X POST http://localhost:3000/api/telemetry/end \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "xyz-789"}'
```

Not recommended - the automatic capture in Claude Code/Cursor is better.

## Reference

- [Universal Quality Workflow](../universal-workflow.md)
- [Claude Code Integration](claude-code.md)
- [MCP Tools Reference](../mcp-tools.md)
- [Installation Guide](../../README.md#choose-your-environment)
