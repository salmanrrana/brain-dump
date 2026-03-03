# Hook-Based State Enforcement & Automation

## Hook-Based State Enforcement

This project uses Claude Code hooks to enforce Ralph's workflow. Hooks provide guidance through feedback loops rather than just blocking actions.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│              ENFORCEMENT THROUGH FEEDBACK                       │
├─────────────────────────────────────────────────────────────────┤
│   Claude: "I'll write the file now"                             │
│              │                                                  │
│              ▼                                                  │
│   PreToolUse Hook: "BLOCKED - You are in 'analyzing' state      │
│   but tried to write code. Call session update-state FIRST."    │
│              │                                                  │
│              ▼                                                  │
│   Claude: *calls session tool, action: "update-state"*          │
│   Claude: *retries Write* ✅                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Scripts

| Hook                          | File        | Enforces                                                                      |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------- |
| enforce-state-before-write.sh | PreToolUse  | Must be in 'implementing', 'testing', or 'committing' state before Write/Edit |
| record-state-change.sh        | PostToolUse | Logs state changes for debugging/audit                                        |

### State File

When a Ralph session is active, `.claude/ralph-state.json` contains:

```json
{
  "sessionId": "abc-123",
  "ticketId": "def-456",
  "currentState": "implementing",
  "stateHistory": ["idle", "analyzing", "implementing"],
  "startedAt": "2026-01-16T10:00:00Z",
  "updatedAt": "2026-01-16T10:15:00Z"
}
```

This file is:

- Created by `session` tool, `action: "create"`
- Updated by `session` tool, `action: "update-state"`
- Removed by `session` tool, `action: "complete"`

### When NOT in Ralph Mode

When no `.claude/ralph-state.json` exists, hooks allow all operations. Normal Claude Code usage is unaffected.

### Cross-Environment Support

| Environment   | State Tracking | Hook Enforcement | Notes                                               |
| ------------- | -------------- | ---------------- | --------------------------------------------------- |
| Claude Code   | ✅ Full        | ✅ Full          | Hooks guide behavior through feedback               |
| Copilot CLI   | ✅ Full        | ✅ Global        | Global hooks in ~/.copilot/ enforce across projects |
| OpenCode      | ✅ Full        | ❌ None          | State tracked via MCP, guidance via prompts         |
| VS Code + MCP | ✅ Full        | ❌ None          | State tracked via MCP, guidance via prompts         |
| Cursor        | ✅ Full        | ❌ None          | State tracked via MCP, guidance via prompts         |

### If You See a STATE ENFORCEMENT Message

1. **Read the message** - it contains the exact MCP tool call needed
2. **Call the specified tool** - e.g., `session` tool with `action: "update-state"`, `sessionId: "..."`, `state: "implementing"`
3. **Retry your original operation** - it will now succeed

Do NOT try to work around state enforcement.

---

## Automated PR Workflow

The following hooks provide an automated workflow for code review and PR creation:

| Hook              | File                            | Purpose                                                        |
| ----------------- | ------------------------------- | -------------------------------------------------------------- |
| Auto-PR creation  | `create-pr-on-ticket-start.sh`  | Creates draft PR immediately when `workflow` `start-work` runs |
| Commit tracking   | `link-commit-to-ticket.sh`      | Outputs commit/PR link commands after each git commit          |
| Pre-push review   | `enforce-review-before-push.sh` | Blocks `git push`/`gh pr create` until review is completed     |
| Post-ticket spawn | `spawn-next-ticket.sh`          | Spawns next ticket after `workflow` `complete-work`            |
| Post-PR spawn     | `spawn-after-pr.sh`             | Spawns next ticket after successful PR creation                |

**Auto-PR Creation**: When `workflow` tool `action: "start-work"` is called, the hook automatically:

1. Creates an empty WIP commit on the new branch
2. Pushes the branch to remote
3. Creates a draft PR with the ticket title
4. The PR is linked to the ticket for immediate tracking

**Commit Tracking**: After each `git commit`, the hook outputs:

1. The commit hash and message
2. MCP commands to link the commit to the active ticket
3. MCP commands to link the PR if one exists for the branch

**PR Status Sync**: When `workflow` tool `action: "link-pr"` is called, the MCP tool automatically syncs PR statuses for all tickets in the project.

**To enable these hooks**, run `scripts/setup-claude-code.sh` which installs hooks globally to `~/.claude/hooks/` and configures `~/.claude/settings.json`.

### Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git push:*)",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/enforce-review-before-push.sh" }
        ]
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/enforce-review-before-push.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__brain-dump__workflow",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/hooks/create-pr-on-ticket-start.sh" }
        ]
      },
      {
        "matcher": "Bash(git commit:*)",
        "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/link-commit-to-ticket.sh" }]
      },
      {
        "matcher": "Bash(gh pr create:*)",
        "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/spawn-after-pr.sh" }]
      }
    ]
  }
}
```

**Note:** Using `$HOME/.claude/hooks/` (not `$CLAUDE_PROJECT_DIR`) ensures hooks work from any directory.

---

## Auto-Spawn Next Ticket (Experimental)

When enabled, completing a ticket or creating a PR can automatically spawn a new terminal window with Claude ready to work on the next suggested ticket.

**To enable:**

```bash
export AUTO_SPAWN_NEXT_TICKET=1
```

The hooks will:

1. Parse the next ticket ID from `workflow` `complete-work` output or PRD file
2. Spawn a new terminal (Ghostty, iTerm2, Terminal.app on macOS; Ghostty, Kitty, GNOME Terminal on Linux)
3. Start Claude with a prompt to begin the next ticket

---

## Telemetry Hooks

Claude Code telemetry hooks automatically capture AI work sessions for observability and audit trails. These hooks work silently in the background.

**Telemetry Hooks:**

| Hook                    | Type               | Purpose                                             |
| ----------------------- | ------------------ | --------------------------------------------------- |
| start-telemetry-session | SessionStart       | Creates telemetry session when Claude starts        |
| end-telemetry-session   | Stop               | Flushes queue and ends telemetry when Claude exits  |
| log-tool-start          | PreToolUse         | Records tool start with parameters                  |
| log-tool-end            | PostToolUse        | Records tool completion with duration (success)     |
| log-tool-failure        | PostToolUseFailure | Records tool completion with error details (failed) |
| log-prompt              | UserPromptSubmit   | Records user prompts submitted to Claude            |

**How it works:**

1. When you start a Claude Code session, `start-telemetry-session` detects the active ticket from `.claude/ralph-state.json`
2. You call `telemetry` tool, `action: "start"`, `ticketId` (hook prompts you)
3. All subsequent tool calls are captured: PreToolUse records start event, PostToolUse/PostToolUseFailure record end
4. Events are written to `.claude/telemetry-queue.jsonl` (JSONL format for streaming)
5. Correlation IDs pair start/end events for duration tracking
6. When Claude exits, `end-telemetry-session` prompts to call `telemetry` tool, `action: "end"` to finalize
7. Events are flushed to database for analytics and audit trails

**Queue files:**

- `.claude/telemetry-queue.jsonl` - Events pending flush to database
- `.claude/telemetry-session.json` - Current session metadata
- `.claude/tool-correlation-*.txt` - Correlation IDs for pairing start/end events
- `.claude/telemetry.log` - Debug log of hook activity

**Privacy:**

- Telemetry hooks don't capture file contents (only parameters summary)
- Prompts can be hashed for privacy (`redact: true`)
- All telemetry data stays local (no external transmission)

**To enable telemetry:** Run `scripts/setup-claude-code.sh` or `~/.claude/hooks/merge-telemetry-hooks.sh`.
