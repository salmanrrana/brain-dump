# Cursor Integration

Brain Dump provides full integration with [Cursor](https://cursor.com), including telemetry hooks, MCP tools, rules, and skills.

## Overview

Cursor has nearly identical hook support to Claude Code, meaning Brain Dump can capture full telemetry and enforce workflow quality gates.

### What Gets Installed

| Component  | Location               | Purpose                                     |
| ---------- | ---------------------- | ------------------------------------------- |
| Hooks      | `~/.cursor/hooks/`     | Telemetry capture (session, tools, prompts) |
| hooks.json | `~/.cursor/hooks.json` | Hook configuration                          |
| MCP Server | `~/.cursor/mcp.json`   | Brain Dump MCP tools                        |
| Rules      | `.cursor/rules/`       | Workflow enforcement (per-project)          |
| Skills     | `.cursor/skills/`      | Reusable workflow guidance                  |

## Installation

Run the install script:

```bash
./scripts/install.sh
```

Or install Cursor specifically:

```bash
./scripts/setup-cursor.sh
```

The script will:

1. Copy hook scripts to `~/.cursor/hooks/`
2. Create `~/.cursor/hooks.json` with telemetry configuration
3. Configure `~/.cursor/mcp.json` with the Brain Dump MCP server
4. Report installed components

## Telemetry Hooks

Brain Dump captures the following events via Cursor hooks:

| Hook                 | Event            | Data Captured              |
| -------------------- | ---------------- | -------------------------- |
| `sessionStart`       | Session begins   | Session ID, ticket context |
| `sessionEnd`         | Session ends     | Duration, event count      |
| `preToolUse`         | Tool starts      | Tool name, parameters      |
| `postToolUse`        | Tool completes   | Duration, success          |
| `postToolUseFailure` | Tool fails       | Error message, duration    |
| `beforeSubmitPrompt` | Prompt submitted | Prompt text (summarized)   |

### Hook Configuration

The hooks are configured in `~/.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "~/.cursor/hooks/start-telemetry.sh" }],
    "sessionEnd": [{ "command": "~/.cursor/hooks/end-telemetry.sh" }],
    "preToolUse": [{ "command": "~/.cursor/hooks/log-tool.sh" }],
    "postToolUse": [{ "command": "~/.cursor/hooks/log-tool.sh" }],
    "postToolUseFailure": [{ "command": "~/.cursor/hooks/log-tool-failure.sh" }],
    "beforeSubmitPrompt": [{ "command": "~/.cursor/hooks/log-prompt.sh" }]
  }
}
```

## Claude Code Hook Compatibility

Cursor can load hooks directly from Claude Code configuration files:

> Priority order: Enterprise → Team → Project (.cursor/) → User (~/.cursor/) → **Claude project local** → **Claude project** → **Claude user**

This means if you have Brain Dump's Claude Code hooks installed, they will also work in Cursor.

## MCP Configuration

The MCP server is configured in `~/.cursor/mcp.json`:

```json
{
  "brain-dump": {
    "command": "npx",
    "args": ["tsx", "/path/to/brain-dump/mcp-server/index.ts"],
    "env": {}
  }
}
```

This provides access to all Brain Dump MCP tools:

- `start_ticket_work` - Begin work on a ticket
- `complete_ticket_work` - Complete implementation
- `submit_review_finding` - Report review issues
- `generate_demo_script` - Create demo steps
- And many more...

## Workflow Rules

Project-level rules are stored in `.cursor/rules/`:

- `brain-dump-workflow.md` - Quality workflow enforcement

Rules with `alwaysApply: true` are automatically included in every conversation.

## Skills

Project-level skills are stored in `.cursor/skills/`:

- `brain-dump-workflow/SKILL.md` - Workflow guidance

Skills provide structured guidance for common tasks.

## Using Brain Dump in Cursor

### Starting Ticket Work

```
Use start_ticket_work to begin working on ticket <ticket-id>
```

### Completing Work

```
Use complete_ticket_work to finish the implementation with a summary
```

### Running Reviews

```
Run the code review agents and submit any findings
```

## Troubleshooting

### Hooks Not Loading

1. Restart Cursor after installing hooks
2. Verify hooks exist: `ls ~/.cursor/hooks/`
3. Check hooks.json syntax: `cat ~/.cursor/hooks.json | jq .`

### MCP Server Not Available

1. Verify the MCP config path is correct in `~/.cursor/mcp.json`
2. Check that the MCP server runs: `npx tsx /path/to/brain-dump/mcp-server/index.ts`
3. Restart Cursor to reload MCP servers

### Telemetry Not Capturing

1. Check for telemetry session file: `ls .cursor/telemetry-session.json`
2. Check telemetry queue: `cat .cursor/telemetry-queue.jsonl`
3. Check logs: `cat .cursor/telemetry.log`

## Environment Variables

Cursor provides these environment variables to hooks:

| Variable             | Description               |
| -------------------- | ------------------------- |
| `CURSOR_PROJECT_DIR` | Current project directory |

Hooks also fall back to `CLAUDE_PROJECT_DIR` or `pwd` if not set.

## Differences from Claude Code

| Feature             | Claude Code               | Cursor                 |
| ------------------- | ------------------------- | ---------------------- |
| Hook config file    | `~/.claude/settings.json` | `~/.cursor/hooks.json` |
| MCP config file     | `~/.claude/settings.json` | `~/.cursor/mcp.json`   |
| Project dir env var | `CLAUDE_PROJECT_DIR`      | `CURSOR_PROJECT_DIR`   |
| Rules location      | `CLAUDE.md`               | `.cursor/rules/*.md`   |
| Skills location     | `.claude/skills/`         | `.cursor/skills/`      |

## Verification

Run the doctor command to verify installation:

```bash
brain-dump doctor
```

This checks:

- Hooks installed in `~/.cursor/hooks/`
- hooks.json configured correctly
- MCP server accessible
- Rules present in `.cursor/rules/`
