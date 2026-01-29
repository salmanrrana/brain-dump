# Cursor Integration

Brain Dump provides full integration with [Cursor](https://cursor.com), including telemetry hooks, MCP tools, rules, and skills.

## Overview

Cursor has **FULL PARITY** with Claude Code, supporting all Brain Dump features including hooks, skills, agents, commands, rules, and MCP integration.

### What Gets Installed

| Component  | Location               | Purpose                                         |
| ---------- | ---------------------- | ----------------------------------------------- |
| Hooks      | `~/.cursor/hooks/`     | Workflow enforcement + telemetry capture        |
| hooks.json | `.cursor/hooks.json`   | Hook configuration (state, review, PR gates)    |
| MCP Server | `~/.cursor/mcp.json`   | Brain Dump MCP tools                            |
| Rules      | `.cursor/rules/`       | Workflow guidance (always-apply)                |
| Skills     | `.cursor/skills/`      | Reusable workflow guidance (symlinked)          |
| Agents     | `.cursor/agents/`      | Code review agents (symlinked)                  |
| Commands   | `.cursor/commands/`    | Workflow shortcuts (start-work, complete-work)  |

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

The hooks are configured in `.cursor/hooks.json` (project-level):

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "$HOME/.cursor/hooks/start-telemetry.sh" }
    ],
    "sessionEnd": [
      { "command": "$HOME/.cursor/hooks/end-telemetry.sh" }
    ],
    "preToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "$HOME/.cursor/hooks/enforce-state-before-write.sh"
      },
      {
        "matcher": "Bash(git push:*)",
        "command": "$HOME/.cursor/hooks/enforce-review-before-push.sh"
      },
      { "command": "$HOME/.cursor/hooks/log-tool.sh" }
    ],
    "postToolUse": [
      {
        "matcher": "mcp__brain-dump__start_ticket_work",
        "command": "$HOME/.cursor/hooks/create-pr-on-ticket-start.sh"
      },
      {
        "matcher": "Bash(git commit:*)",
        "command": "$HOME/.cursor/hooks/link-commit-to-ticket.sh"
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "command": "$HOME/.cursor/hooks/spawn-after-pr.sh"
      },
      { "command": "$HOME/.cursor/hooks/log-tool.sh" }
    ],
    "postToolUseFailure": [
      { "command": "$HOME/.cursor/hooks/log-tool-failure.sh" }
    ],
    "beforeSubmitPrompt": [
      { "command": "$HOME/.cursor/hooks/log-prompt.sh" }
    ]
  }
}
```

**Workflow Enforcement Hooks:**

- `enforce-state-before-write.sh` - Blocks Write/Edit unless in implementing/testing/committing state
- `enforce-review-before-push.sh` - Blocks git push until AI review complete
- `create-pr-on-ticket-start.sh` - Auto-creates draft PR when starting ticket work
- `link-commit-to-ticket.sh` - Links commits and PRs to active ticket
- `spawn-after-pr.sh` - Optionally spawns next ticket after PR creation

## Claude Code Hook Compatibility

Cursor can load hooks directly from Claude Code configuration files:

> Priority order: Enterprise → Team → Project (.cursor/) → User (~/.cursor/) → **Claude project local** → **Claude project** → **Claude user**

This means if you have Brain Dump's Claude Code hooks installed, they will also work in Cursor.

## MCP Configuration

The MCP server is configured in `~/.cursor/mcp.json`:

```json
{
  "brain-dump": {
    "command": "node",
    "args": ["/path/to/brain-dump/mcp-server/dist/index.js"],
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

- `brain-dump-workflow.md` - Universal Quality Workflow enforcement
- `testing-philosophy.md` - Kent C. Dodds testing patterns

Rules with `alwaysApply: true` are automatically included in every conversation.

## Skills

Project-level skills are **symlinked** from `.claude/skills/` to `.cursor/skills/`:

- `review/` - Run code review pipeline
- `review-aggregation/` - Synthesize review findings
- `brain-dump-workflow/` - Workflow guidance
- `tanstack-*/` - TanStack Query/Forms/Mutations guidance

Skills provide structured guidance for common tasks and are loaded on-demand.

## Agents

Code review agents are **symlinked** from `.claude/agents/` to `.cursor/agents/`:

- `code-reviewer.md` - Code quality review
- `silent-failure-hunter.md` - Error handling review
- `cruft-detector.md` - Dead code detection
- `react-best-practices.md` - React/Next.js performance review
- `context7-library-compliance.md` - Library usage verification
- `senior-engineer.md` - Architectural review synthesis

Agents run autonomously during the AI review phase.

## Commands

Cursor-specific workflow shortcuts in `.cursor/commands/`:

- `start-work.md` - Start ticket work (creates branch, draft PR, telemetry)
- `complete-work.md` - Complete implementation (validation, moves to ai_review)
- `submit-finding.md` - Submit code review finding
- `generate-demo.md` - Generate demo script for human review

Commands provide quick access to MCP tools with usage examples.

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
2. Check that the MCP server runs: `node /path/to/brain-dump/mcp-server/dist/index.js`
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

Cursor has **FULL PARITY** with Claude Code. The only differences are configuration file locations:

| Feature                  | Claude Code               | Cursor                 |
| ------------------------ | ------------------------- | ---------------------- |
| Hook config file         | `~/.claude/settings.json` | `.cursor/hooks.json`   |
| MCP config file          | `~/.claude/settings.json` | `~/.cursor/mcp.json`   |
| Project dir env var      | `CLAUDE_PROJECT_DIR`      | `CURSOR_PROJECT_DIR`   |
| Rules location           | `CLAUDE.md`               | `.cursor/rules/*.md`   |
| Skills location          | `.claude/skills/` (source) | `.cursor/skills/` (symlinked) |
| Agents location          | `.claude/agents/` (source) | `.cursor/agents/` (symlinked) |
| Commands                 | N/A                        | `.cursor/commands/*.md` |
| **Hook Support**         | ✅ Full                    | ✅ Full                |
| **Workflow Enforcement** | ✅ Yes                     | ✅ Yes                 |
| **State Tracking**       | ✅ Yes                     | ✅ Yes                 |
| **Auto PR Creation**     | ✅ Yes                     | ✅ Yes                 |
| **Review Gates**         | ✅ Yes                     | ✅ Yes                 |

**Note:** Skills and agents are symlinked from `.claude/` to `.cursor/` to maintain a single source of truth.

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
