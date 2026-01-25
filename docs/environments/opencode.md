# OpenCode Integration Guide

OpenCode has native plugin support, giving Brain Dump automatic telemetry capture with 40+ lifecycle events.

## Quick Start

### Installation

```bash
./scripts/install.sh --opencode
```

This installs:

- Brain Dump plugin in `~/.config/opencode/plugins/`
- MCP server configuration
- AGENTS.md workflow guide

Verify with:

```bash
brain-dump doctor
```

### Using Brain Dump in OpenCode

1. **Open Brain Dump**

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. **In OpenCode, use @brain-dump agent**

   ```
   @brain-dump start_ticket_work ticketId
   ```

3. **Code normally**
   - OpenCode plugin tracks everything automatically
   - No hooks needed
   - Telemetry captured by plugin

4. **Complete workflow**
   ```
   @brain-dump complete_ticket_work ticketId "summary"
   @brain-dump /review-ticket
   @brain-dump /demo
   ```

## How OpenCode Differs

### Plugin Architecture

OpenCode plugins are TypeScript code that runs in the OpenCode sandbox:

```typescript
export const BrainDumpTelemetry: Plugin = async ({ client, project }) => {
  return {
    "session.created": async (input) => {
      // Handle session start
      await client.callTool("mcp__brain-dump__start_telemetry_session", {});
    },

    "tool.execute.before": async (input, output) => {
      // Handle tool start
      await client.callTool("mcp__brain-dump__log_tool_event", {
        event: "start",
        toolName: input.tool,
      });
    },

    // ... many more events
  };
};
```

This gives OpenCode **40+ lifecycle events** to track:

- Session creation/idle/error
- Tool start/end/failure
- User input
- File changes
- And more...

### Automatic Everything

Because OpenCode has rich event system:

| Feature           | OpenCode              |
| ----------------- | --------------------- |
| State enforcement | Via MCP preconditions |
| Telemetry capture | Automatic (plugin)    |
| Commit linking    | Manual (MCP tool)     |
| Task capture      | Via plugin events     |
| Session tracking  | Automatic (plugin)    |

Much less manual work than VS Code.

### AGENTS.md Template

OpenCode projects can have `.opencode/agents.md` with custom agents:

```markdown
# Brain Dump Agents

## @ticket-worker

Single ticket implementation with guidance.

Works on one ticket:

1. Call start_ticket_work
2. Implement the feature
3. Call complete_ticket_work
4. Run AI review

## @ralph

Autonomous agent mode - works multiple tickets.

...
```

This helps guide workflow in your specific project.

## Workflow

### Phase 1: Start Work

```
You: @brain-dump start_ticket_work abc-123

Plugin: Detects session start → Telemetry begins

MCP tool:
✓ Creates git branch
✓ Sets status to in_progress
✓ Returns ticket context

You: Code normally
```

### Phase 2: Implementation & Telemetry

As you work, the plugin automatically captures:

```
Plugin events captured:
- Session.created (when you started)
- Tool.start (each MCP tool call)
- Tool.end (after each tool succeeds)
- FileCreate (new files written)
- FileModify (edits made)
- Terminal.execute (commands run)
```

All of this flows to Brain Dump database for telemetry.

### Phase 3: Complete & Review

```
You: @brain-dump complete_ticket_work abc-123 "Added auth"

MCP tool:
✓ Requires validation passed
✓ Sets status to ai_review
✓ Triggers AI review

You: @brain-dump /review-ticket
     Fix findings
     Repeat until clean

You: @brain-dump /demo
```

### Phase 4: Demo & Approval

```
You: Go to Brain Dump UI
     Click ticket in human_review
     Click "Start Demo Review"
     Run steps, approve or request changes
```

## Commands

### MCP Tools

```
@brain-dump start_ticket_work abc-123
@brain-dump complete_ticket_work abc-123 "summary"
@brain-dump link_commit_to_ticket abc-123 abc12ef
@brain-dump /review-ticket
@brain-dump /demo
@brain-dump /next-task
@brain-dump /reconcile-learnings
```

### Workflow Guidance

```
@brain-dump help         # Show workflow guidance
@brain-dump next-ticket  # Pick next ticket
@brain-dump status       # Current ticket status
```

### Custom Agents (if defined)

```
@ticket-worker   # Single ticket
@ralph           # Autonomous multi-ticket
@reviewer        # AI review focused
```

Defined in `.opencode/agents.md`.

## Troubleshooting

### "Plugin not loading"

**Check 1:** Plugin file exists

```bash
ls ~/.config/opencode/plugins/brain-dump-telemetry.ts
```

**Check 2:** OpenCode can find plugins

```bash
opencode --version
# Should be recent version with plugin support
```

**Check 3:** Reinstall

```bash
./scripts/install.sh --opencode
```

**Check 4:** Restart OpenCode

### "Telemetry not being captured"

**Check:** Plugin is active in OpenCode

```
Settings → Plugins → Brain Dump Telemetry → Enabled
```

**Verify:** After running a tool, check telemetry:

1. Go to Brain Dump UI
2. Open ticket detail
3. Click "Telemetry" tab
4. Should show recent events

### "MCP tools not available"

**Check:** MCP configuration

```bash
cat ~/.opencode/mcp.json
# or wherever OpenCode MCP config is
```

Should include `brain-dump` server.

**Fix:**

```bash
./scripts/install.sh --opencode
```

## Best Practices

### Leverage Plugin Automation

Since the plugin captures everything automatically:

- You don't need to manually call telemetry tools
- Tool usage is tracked automatically
- Session lifecycle is automatic
- Focus on your work, not tracking

### Still Call start_ticket_work

Even though plugin handles telemetry, always call:

```
@brain-dump start_ticket_work abc-123
```

This ensures:

- Branch created
- Status set correctly
- Telemetry session linked to ticket

### Use Project-Specific AGENTS.md

Create `.opencode/agents.md` to customize workflow:

```markdown
# Brain Dump Agents for My Project

## @ticket-worker

Implements a single ticket with these steps:

1. Read acceptance criteria
2. Design solution (think first)
3. Write code with tests
4. Run full validation
5. Call complete_ticket_work
6. Fix any AI review findings
7. Generate demo

## @ralph

Autonomous multi-ticket agent...
```

This guides OpenCode's behavior for your project.

### Monitor Telemetry

After completing a ticket, check telemetry:

1. Brain Dump UI → Your ticket
2. "Telemetry" tab
3. See:
   - Which tools you used and how often
   - How long each phase took
   - Token usage
   - Error rates

This helps understand your workflow.

### Keep MCP Config Portable

If you move projects, keep MCP configs in version control:

```bash
# In repo root:
.opencode/
  └─ mcp.json          # Checked in
  └─ agents.md         # Checked in

~/.opencode/
  └─ plugins/          # Global plugins
  └─ settings.json     # Global settings
```

This ensures your team can use the same tools.

## Advanced: Custom Plugins

OpenCode plugins are TypeScript, so you can extend Brain Dump:

```typescript
// ~/.config/opencode/plugins/my-extension.ts
export const MyExtension: Plugin = async ({ client, project }) => {
  return {
    "tool.execute.after": async (input, output) => {
      // Custom logic after any tool execution

      // Example: Auto-commit after tests pass
      if (input.tool === "Bash" && input.args.includes("test")) {
        if (!output.error) {
          await client.executeTool("Bash", {
            command: "git add -A && git commit -m 'tests: passing'",
          });
        }
      }
    },
  };
};

export default MyExtension;
```

This lets you build custom automation on top of Brain Dump.

## Comparison: OpenCode vs Others

| Feature             | OpenCode  | Claude Code | Cursor    | VS Code   |
| ------------------- | --------- | ----------- | --------- | --------- |
| Hooks               | ❌ No     | ✅ Yes      | ✅ Yes    | ❌ No     |
| Plugins             | ✅ Yes    | ❌ No       | ❌ No     | ❌ No     |
| Telemetry automatic | ✅ Plugin | ✅ Hooks    | ✅ Hooks  | ❌ Manual |
| Lifecycle events    | 40+       | Limited     | Limited   | Limited   |
| Extensibility       | ⚡ High   | Medium      | Medium    | Medium    |
| Learning curve      | Medium    | Low         | Low       | Low       |
| Cost                | 💳 Free   | 💰 Medium   | 💰 High   | 💳 Varies |
| Maturity            | 🆕 New    | ✅ Stable   | ✅ Stable | ✅ Stable |

**When to use OpenCode:**

- Want maximum extensibility
- Value plugin architecture
- Like open-source tools
- Want to contribute improvements

**When to use Claude Code:**

- Want simple, proven setup
- Prefer hooks over plugins
- Want stable, mature tool
- Don't need maximum extensibility

## Reference

- [Universal Quality Workflow](../universal-workflow.md)
- [Claude Code Integration](claude-code.md)
- [MCP Tools Reference](../mcp-tools.md)
- [OpenCode Documentation](https://opencode.ai/docs)
- [Installation Guide](../../README.md#choose-your-environment)
