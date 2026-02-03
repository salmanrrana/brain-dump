# Cursor Integration Guide

Cursor has full support for the Universal Quality Workflow with hooks similar to Claude Code.

## Quick Start

### Installation

```bash
./scripts/install.sh --cursor
```

This installs:

- Hooks in `~/.cursor/hooks/`
- Hook configuration in `~/.cursor/hooks.json`
- Brain Dump MCP server config

Verify with:

```bash
brain-dump doctor
```

### Using Brain Dump in Cursor

1. **Open Brain Dump**

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. **Click "Start with Cursor" on any ticket**
   - Cursor Agent chat opens with full context
   - Session tracking begins

3. **Work normally**
   - Use Cursor's Composer for coding
   - Make commits
   - Run tests
   - Hooks track automatically

4. **Complete implementation**

   ```
   workflow tool, action: "complete-work", ticketId, "summary"
   ```

5. **Run AI review, fix findings, generate demo**
   ```
   /review-ticket
   /demo
   ```

## How Cursor Differs from Claude Code

### Hook Format

Cursor hooks use a slightly different configuration format than Claude Code, but the functionality is identical.

Claude Code:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Write", "hooks": [...] }]
  }
}
```

Cursor (in `.cursor/hooks.json`):

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [{ "command": "~/.cursor/hooks/enforce-state.sh" }]
  }
}
```

### Hook Behavior

Same hooks, same behavior:

- State enforcement before writing code
- Automatic task capture
- Commit linking
- Telemetry capture

### MCP Configuration

In Cursor, MCP is configured in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "brain-dump": {
      "command": "npx",
      "args": ["tsx", "/path/to/brain-dump/mcp-server/index.ts"]
    }
  }
}
```

The installation script configures this automatically.

## Features

### State Enforcement

Just like Claude Code, Cursor hooks enforce state transitions:

```
You: Write code while in 'analyzing' state
Hook: Blocks → "Call session 'update-state' with state: 'implementing' first"
You: Call the MCP tool
You: Retry → Success
```

### Automatic Telemetry

All tool usage is captured:

- Tool name and parameters
- Duration
- Success/failure
- Prompts (optional privacy hash)

View in Brain Dump UI → ticket detail → "Telemetry" tab.

### Commit Linking

Commits are automatically linked to tickets:

```bash
$ git commit -m "feat(abc-123): Add validation"

Hook: Outputs MCP command to link commit
UI: Shows commit in ticket detail
```

## Commands

All the same commands as Claude Code:

```
/next-task              # Select next ticket
/review-ticket          # Run AI review
/review-epic            # Review entire epic
/demo                   # Generate demo script
/reconcile-learnings    # Extract learnings
```

Plus MCP tools:

```
workflow tool, action: "start-work", ticketId
workflow tool, action: "complete-work", ticketId, "summary"
review tool, action: "submit-finding", ...
review tool, action: "mark-fixed", ...
review tool, action: "generate-demo", ...
review tool, action: "submit-feedback", ...
```

## Troubleshooting

### "STATE ENFORCEMENT: You must call session update-state first"

Same as Claude Code:

1. Read the message
2. Call the suggested MCP tool
3. Retry your operation

### "Hooks are not working"

**Check 1:** Verify installation

```bash
brain-dump doctor
```

Should show: `✓ Cursor: installed and configured`

**Check 2:** Check hook files

```bash
ls ~/.cursor/hooks/
```

**Check 3:** Check Cursor settings

```bash
cat ~/.cursor/hooks.json
```

**Check 4:** Restart Cursor

Reinstall if needed:

```bash
./scripts/install.sh --cursor
```

### "MCP tools not available"

**Check:** Cursor MCP configuration

```bash
cat ~/.cursor/mcp.json
```

Should include `brain-dump` server. If not, reinstall:

```bash
./scripts/install.sh --cursor
```

## Best Practices

### Use Cursor Composer for Complex Tasks

Cursor's Composer is great for large refactors and multi-file changes:

1. Select files to modify in Composer
2. Describe the task
3. Composer handles changes across multiple files
4. Your work is still tracked via hooks

### Commit Strategy

Same as Claude Code - commit often:

```bash
# Good - small, focused commits
git commit -m "feat(abc-123): Add validation"
git commit -m "feat(abc-123): Add tests for validation"

# Less good - large commit
git commit -m "feat(abc-123): Add validation, tests, docs, and refactor utils"
```

### Leverage Cursor's Speed

Cursor is particularly fast for:

- Large refactors
- File generation
- Multi-file edits

Use these strengths while benefiting from Brain Dump's quality workflow.

## Advanced: CLI Fallback

If hooks aren't working, you can use the CLI directly:

```bash
# Link a commit manually
workflow tool, action: "link-commit", ticketId: "abc-123", commitHash: "abc12ef"

# Create a progress comment
comment tool, action: "add", ticketId: "abc-123", content: "Completed validation"

# Move to next phase
ticket tool, action: "update-status", ticketId: "abc-123", status: "ai_review"
```

This ensures you're never blocked even if hooks malfunction.

## Comparison: Cursor vs Claude Code

| Feature                | Cursor                  | Claude Code |
| ---------------------- | ----------------------- | ----------- |
| Hook enforcement       | ✅ Yes                  | ✅ Yes      |
| Telemetry capture      | ✅ Yes                  | ✅ Yes      |
| Commit linking         | ✅ Yes                  | ✅ Yes      |
| MCP tools              | ✅ Yes                  | ✅ Yes      |
| Speed                  | ⚡ Very fast            | ⚡ Fast     |
| Multi-file editing     | ⚡ Excellent (Composer) | ✅ Good     |
| Codebase understanding | ⚡ Excellent            | ✅ Good     |
| Cost                   | 💰 High                 | 💰 Medium   |

**When to use Cursor:**

- Large refactors
- Deep codebase changes
- Fast iteration preferred over cost

**When to use Claude Code:**

- Day-to-day development
- Budget-conscious
- Thorough, careful work

## Reference

- [Universal Quality Workflow](../universal-workflow.md)
- [Claude Code Integration](claude-code.md)
- [MCP Tools Reference](../mcp-tools.md)
- [Installation Guide](../../README.md#choose-your-environment)
