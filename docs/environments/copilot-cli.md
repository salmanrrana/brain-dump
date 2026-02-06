# Copilot CLI Integration Guide

GitHub Copilot CLI (`copilot` command) is Brain Dump's 5th supported development environment. It provides a terminal-native AI coding workflow with global hooks for telemetry capture and Ralph state enforcement.

## 1. Quick Start

### Installation

Run the universal installer (auto-detects Copilot CLI):

```bash
./scripts/install.sh
```

Or run the focused setup script directly:

```bash
./scripts/setup-copilot-cli.sh
```

### What Gets Configured

| Component    | Location                       | Description                                             |
| ------------ | ------------------------------ | ------------------------------------------------------- |
| MCP Server   | `~/.copilot/mcp-config.json`   | Brain Dump MCP server with `COPILOT_CLI=1` env var      |
| Agents       | `~/.copilot/agents/*.agent.md` | 11 global agents (ralph, code-reviewer, etc.)           |
| Skills       | `~/.copilot/skills/`           | Shared with VS Code — workflow, review, TanStack skills |
| Hooks config | `~/.copilot/hooks.json`        | Event-to-script mapping for 6 hook event types          |
| Hook scripts | `~/.copilot/hooks/*.sh`        | 7 bash scripts for telemetry and state enforcement      |

### Verify Installation

```bash
brain-dump doctor
```

Or check manually:

```bash
cat ~/.copilot/mcp-config.json    # MCP server entry
ls ~/.copilot/agents/              # Agent files
ls ~/.copilot/skills/              # Skill directories
cat ~/.copilot/hooks.json          # Hook configuration
ls ~/.copilot/hooks/               # Hook scripts
```

### Using Brain Dump with Copilot CLI

1. **Start Brain Dump UI**

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. **Click "Start with Copilot CLI" on any ticket** in the Brain Dump UI

3. **In your Copilot CLI session, start work:**

   ```
   Call workflow tool, action: "start-work", ticketId: "<ticketId>"
   Call session tool, action: "create", ticketId: "<ticketId>"
   ```

4. **Or use an agent directly:**

   ```
   @ralph    # Autonomous ticket work
   ```

5. **Auto-approve Brain Dump tools** to avoid repeated prompts:

   ```bash
   copilot --allow-tool 'brain-dump(*)'
   ```

## 2. How Copilot CLI Differs

### Provider Comparison

| Feature           | Claude Code                | Cursor                     | Copilot CLI                   | VS Code                       | OpenCode                     |
| ----------------- | -------------------------- | -------------------------- | ----------------------------- | ----------------------------- | ---------------------------- |
| Hook enforcement  | User-scoped (`~/.claude/`) | User-scoped (`~/.cursor/`) | Global (`~/.copilot/`)        | None                          | Plugin-based                 |
| Telemetry capture | Hooks (automatic)          | Hooks (automatic)          | Hooks (automatic)             | Manual (MCP tool)             | Plugin-based                 |
| Agent format      | `.md`                      | `.md`                      | `.agent.md`                   | `.agent.md`                   | `.md`                        |
| MCP config format | `claude mcp add` CLI       | `~/.cursor/mcp.json`       | `~/.copilot/mcp-config.json`  | `.vscode/mcp.json`            | `opencode.json`              |
| MCP server type   | `stdio`                    | `mcpServers.{name}`        | `type: "local"`               | `type: "stdio"`               | `type: "local"`              |
| Env detection     | Ambient env patterns       | `CURSOR=1`                 | `COPILOT_CLI=1`               | VS Code env patterns          | `OPENCODE=1`                 |
| State enforcement | Automatic (hooks block)    | Automatic (hooks block)    | Automatic (hooks block)       | Manual (instructions)         | Plugin enforces              |
| Skills location   | `~/.claude/skills/`        | `~/.cursor/skills/`        | `~/.copilot/skills/` (shared) | `~/.copilot/skills/` (shared) | `~/.config/opencode/skills/` |

### Key Differences

- **Global hooks**: Copilot CLI hooks live in `~/.copilot/hooks/` and apply across ALL projects, not just the Brain Dump repo. This matches the Claude Code and Cursor pattern.
- **Shared skills**: `~/.copilot/skills/` is shared between Copilot CLI and VS Code. Both install the same skill content — the setup script handles overlap idempotently.
- **MCP format**: Copilot CLI uses `type: "local"` with a `tools: ["*"]` allow-list, unlike other providers that use `stdio` type.
- **Environment detection**: The MCP server detects Copilot CLI via the `COPILOT_CLI=1` env var set in the MCP config, plus scanning for ambient `COPILOT_*` env vars (`COPILOT_TRACE_ID`, `COPILOT_SESSION`, `COPILOT_CLI_VERSION`).

## 3. Workflow

Copilot CLI follows the same Universal Quality Workflow (UQW) as all other Brain Dump environments.

### Phase 1: Start Work

```
You: Start work on ticket abc-123

Copilot CLI calls:
  workflow tool, action: "start-work", ticketId: "abc-123"
  session tool, action: "create", ticketId: "abc-123"

Result:
  - Git branch created (or epic branch checked out)
  - Ticket status set to in_progress
  - Ralph session created for state tracking
```

### Phase 2: Implementation

```
You: Implement the feature

Copilot CLI:
  session tool, action: "update-state", state: "implementing"
  # Write code, run tests, make commits
  session tool, action: "update-state", state: "testing"
  # pnpm test, pnpm type-check, pnpm lint

Commit format:
  git commit -m "feat(abc-123): Add new feature"
```

### Phase 3: Complete & Review

```
You: I'm done implementing

Copilot CLI calls:
  workflow tool, action: "complete-work", ticketId: "abc-123", summary: "What was done"
  # Ticket moves to ai_review

  # Self-review, then submit findings:
  review tool, action: "submit-finding", ticketId: "abc-123", ...
  review tool, action: "mark-fixed", findingId: "...", fixStatus: "fixed"
  review tool, action: "check-complete", ticketId: "abc-123"
```

### Phase 4: Demo & Approval

```
Copilot CLI calls:
  review tool, action: "generate-demo", ticketId: "abc-123", steps: [...]
  # Ticket moves to human_review

You: Go to Brain Dump UI
     Click "Start Demo Review"
     Run through the demo steps
     Approve or request changes
```

## 4. Using MCP Tools

Brain Dump's MCP server exposes 9 tools with 65 total actions. In Copilot CLI, you invoke them naturally by asking Copilot to perform Brain Dump operations.

### Common Operations

**Ticket management:**

```
"List my tickets"
"Show ticket abc-123"
"Create a ticket titled 'Fix login bug' in project Brain Dump"
```

**Workflow:**

```
"Start work on ticket abc-123"
"Complete work on ticket abc-123 with summary 'Added validation'"
"Link commit abc12ef to ticket abc-123"
```

**Review:**

```
"Submit a finding for ticket abc-123: major code quality issue in auth.ts"
"Check if review is complete for ticket abc-123"
"Generate a demo with 4 test steps for ticket abc-123"
```

**Session state:**

```
"Update session state to implementing"
"Complete the session with success"
```

### MCP Config Format

The MCP server is configured in `~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "brain-dump": {
      "type": "local",
      "command": "node",
      "args": ["/path/to/brain-dump/mcp-server/dist/index.js"],
      "env": { "COPILOT_CLI": "1" },
      "tools": ["*"]
    }
  }
}
```

Key fields:

- `type: "local"` — Copilot CLI convention (not `"stdio"`)
- `env.COPILOT_CLI: "1"` — Tells the MCP server this is a Copilot CLI session
- `tools: ["*"]` — Allow-list exposing all Brain Dump tools

## 5. Hook Configuration

Hooks are event-driven bash scripts that run automatically during Copilot CLI sessions. They enable telemetry capture and Ralph state enforcement without manual intervention.

### How Hooks Work

1. Copilot CLI reads `~/.copilot/hooks.json` on startup
2. When an event fires (e.g., a tool is about to be used), Copilot runs the mapped bash script(s)
3. The script receives JSON input on stdin describing the event
4. For enforcement hooks, the script returns a JSON decision: `{"decision": "allow"}` or `{"decision": "block", "message": "..."}`
5. For telemetry hooks, the script writes events to `~/.copilot/telemetry-queue.jsonl`

### hooks.json Format

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "bash": "~/.copilot/hooks/start-telemetry.sh" }],
    "preToolUse": [
      { "bash": "~/.copilot/hooks/log-tool-start.sh" },
      { "bash": "~/.copilot/hooks/enforce-state-before-write.sh" }
    ],
    "postToolUse": [{ "bash": "~/.copilot/hooks/log-tool-end.sh" }],
    "sessionEnd": [{ "bash": "~/.copilot/hooks/end-telemetry.sh" }],
    "userPromptSubmitted": [{ "bash": "~/.copilot/hooks/log-prompt.sh" }],
    "errorOccurred": [{ "bash": "~/.copilot/hooks/log-tool-failure.sh" }]
  }
}
```

### Hook Scripts Reference

| Script                          | Event                 | Purpose                                                                                                                        |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `start-telemetry.sh`            | `sessionStart`        | Detects active ticket from `.claude/ralph-state.json`, prompts you to start a telemetry session                                |
| `end-telemetry.sh`              | `sessionEnd`          | Prompts you to flush the telemetry queue and end the session                                                                   |
| `log-prompt.sh`                 | `userPromptSubmitted` | Records prompt metadata (length, not content) to the telemetry queue                                                           |
| `log-tool-start.sh`             | `preToolUse`          | Records tool start event with a correlation ID for duration tracking                                                           |
| `log-tool-end.sh`               | `postToolUse`         | Pairs with start event, calculates duration, records tool completion                                                           |
| `log-tool-failure.sh`           | `errorOccurred`       | Records tool failures with error details and duration                                                                          |
| `enforce-state-before-write.sh` | `preToolUse`          | **Enforcement hook** — blocks Write/Edit/Create tools unless Ralph session state is `implementing`, `testing`, or `committing` |

### State Enforcement

The `enforce-state-before-write.sh` hook enforces Ralph's workflow state machine. When you try to write or edit code:

1. **No Ralph session active** (no `.claude/ralph-state.json`): All operations allowed. Normal Copilot CLI usage is unaffected.
2. **Ralph session active, correct state** (`implementing`/`testing`/`committing`): Operation allowed.
3. **Ralph session active, wrong state** (e.g., `analyzing`): Operation **blocked** with a message telling you exactly which MCP tool to call.

Example block message:

```
STATE ENFORCEMENT: You are in 'analyzing' state but tried to write/edit code.

To write code, call the session tool:
  action: "update-state", sessionId: "xyz-789", state: "implementing"

Valid states for writing code: implementing, testing, committing
```

### Dual-Format Input Parsing

Hook scripts use defensive dual-format parsing with jq fallbacks. This ensures hooks work regardless of the exact JSON field names Copilot CLI uses:

```bash
# Handles: toolName, tool_name, or tool
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // .tool_name // .tool // ""')
```

### Telemetry Files

| File                                  | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `~/.copilot/telemetry-queue.jsonl`    | Pending telemetry events (JSONL format)                |
| `~/.copilot/telemetry.log`            | Debug log of hook activity                             |
| `~/.copilot/tool-correlation-*.queue` | Temporary correlation IDs for pairing start/end events |

### Customizing Hooks

To add your own hooks, edit `~/.copilot/hooks.json` and add entries to the appropriate event arrays. Each entry needs a `bash` key pointing to an executable script.

To disable a specific hook, remove its entry from `hooks.json`. To disable all hooks, delete or rename `~/.copilot/hooks.json`.

## 6. Auto-Approve Tools

By default, Copilot CLI asks for permission before using MCP tools. You can reduce prompts with auto-approve flags.

### Approve Brain Dump Tools Only

```bash
copilot --allow-tool 'brain-dump(*)'
```

This approves all Brain Dump MCP tool invocations while still prompting for other tools (file writes, bash commands, etc.).

### Approve All Tools

```bash
copilot --allow-all-tools
```

Or the shorthand:

```bash
copilot --yolo
```

This approves everything — use with caution, especially for destructive operations.

### Per-Session vs Persistent

These flags apply to the current session only. To make them persistent, add them to your shell alias:

```bash
# In ~/.bashrc or ~/.zshrc
alias copilot-bd='copilot --allow-tool "brain-dump(*)"'
```

## 7. Troubleshooting

### "MCP server not responding"

**Check 1:** Verify MCP configuration exists

```bash
cat ~/.copilot/mcp-config.json
```

Should contain `"brain-dump"` with `type: "local"`.

**Check 2:** Verify the MCP server is built

```bash
ls /path/to/brain-dump/mcp-server/dist/index.js
```

If missing, build it:

```bash
cd /path/to/brain-dump && pnpm build
```

**Check 3:** Test the MCP server directly

```bash
COPILOT_CLI=1 node /path/to/brain-dump/mcp-server/dist/index.js
```

### "Hooks not firing"

**Check 1:** Verify hooks.json exists

```bash
cat ~/.copilot/hooks.json
```

Should list 6 event types with script paths.

**Check 2:** Verify hook scripts are executable

```bash
ls -la ~/.copilot/hooks/*.sh
```

All scripts should have the `x` (execute) permission.

**Check 3:** Verify jq is installed

```bash
jq --version
```

All hook scripts require jq for JSON parsing. Install from: https://jqlang.github.io/jq/download/

**Check 4:** Check the telemetry log for errors

```bash
tail -20 ~/.copilot/telemetry.log
```

### "STATE ENFORCEMENT blocking my edits"

This means you're in a Ralph session but haven't advanced to the right workflow state.

**Fix:** Call the session tool as the error message instructs:

```
session tool, action: "update-state", sessionId: "<id>", state: "implementing"
```

Then retry your edit.

**If you're not using Ralph** and don't want enforcement, the state file may be stale. Remove it:

```bash
rm .claude/ralph-state.json
```

### "Review required before push"

The `hooks/copilot/pre-tool-use.sh` hook blocks `git push` and `gh pr create` until review is complete.

**Fix:** Run the review workflow, then mark review complete:

```bash
./.claude/hooks/mark-review-completed.sh
```

### "Agents not available"

**Check:** Verify agents are installed

```bash
ls ~/.copilot/agents/*.agent.md
```

Should show 11 agent files. If missing, re-run the setup:

```bash
./scripts/setup-copilot-cli.sh
```

### Reinstalling

If something is misconfigured, the setup script is idempotent — safe to run multiple times:

```bash
./scripts/setup-copilot-cli.sh
```

This will update existing files and skip unchanged ones.

## Comparison: Copilot CLI vs Other Environments

| Feature          | Copilot CLI            | Claude Code         | Cursor              | VS Code               | OpenCode            |
| ---------------- | ---------------------- | ------------------- | ------------------- | --------------------- | ------------------- |
| Hook enforcement | Global (`~/.copilot/`) | User (`~/.claude/`) | User (`~/.cursor/`) | None                  | Plugin              |
| Telemetry        | Automatic (hooks)      | Automatic (hooks)   | Automatic (hooks)   | Manual                | Plugin              |
| State tracking   | Full (MCP + hooks)     | Full (MCP + hooks)  | Full (MCP + hooks)  | Full (MCP only)       | Full (MCP + plugin) |
| Commit linking   | Manual (MCP tool)      | Automatic (hooks)   | Automatic (hooks)   | Manual (MCP tool)     | Manual              |
| Agents           | 11 global agents       | 11 agents           | 11 agents           | Varies                | Varies              |
| Cost             | Included with GitHub   | Separate            | Separate            | Included with Copilot | Free                |

**When to use Copilot CLI:**

- Already using GitHub Copilot
- Want terminal-native AI workflow
- Want automatic enforcement and telemetry via hooks
- Work across multiple repositories (global hooks apply everywhere)

## Reference

- [Universal Quality Workflow](../universal-workflow.md)
- [Claude Code Integration](claude-code.md)
- [Cursor Integration](cursor.md)
- [VS Code Integration](vscode.md)
- [OpenCode Integration](opencode.md)
- [MCP Tools Reference](../mcp-tools.md)
