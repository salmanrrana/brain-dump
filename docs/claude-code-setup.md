# Claude Code Setup for Brain Dump

Brain Dump integrates natively with Claude Code (Anthropic's CLI). This guide covers the full setup and available features.

## Quick Start

Run the setup script:

```bash
cd /path/to/brain-dump
./scripts/setup-claude-code.sh
```

This configures the Brain Dump MCP server in your `~/.claude.json`.

## Manual Setup

Add to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["/path/to/brain-dump/mcp-server/index.js"]
    }
  }
}
```

Then restart any running Claude Code sessions.

## Features

### Start with Claude

Click **"Start with Claude"** on any ticket in Brain Dump to:

1. Open a new terminal window in your project directory
2. Launch `claude` with full ticket context as the initial prompt
3. Automatically move the ticket to "In Progress"

The context includes:
- Ticket title and description
- Subtasks / acceptance criteria
- Epic information
- Recently completed related work

### Start with Ralph (Autonomous Mode)

Click **"Start with Ralph"** on a ticket or epic to run Claude autonomously:

1. Brain Dump generates a `plans/prd.json` with all pending tasks
2. Ralph runs in a loop:
   - Reads the PRD and progress file
   - Picks one task where `passes: false`
   - Implements the feature, runs tests
   - Updates the PRD and ticket status via MCP
   - Commits the change
   - Repeats until all tasks pass

**Key features:**
- Fresh context per iteration (no context bloat)
- Progress persisted in `plans/progress.txt`
- Automatic git branching and commits
- Creates PR when all tasks complete

### MCP Tools

With the MCP server configured, Claude can manage tickets from any project:

```
"Create a high-priority ticket to fix the authentication bug"
"Show me all in-progress tickets"
"Mark ticket abc-123 as done"
"Add a work summary to my current ticket"
```

Claude auto-detects your project and updates Brain Dump in real-time.

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all registered projects |
| `find_project_by_path` | Auto-detect project from current directory |
| `create_project` | Register a new project |
| `create_ticket` | Create a ticket |
| `list_tickets` | List tickets with filters |
| `update_ticket_status` | Move ticket between columns |
| `list_epics` | List epics for a project |
| `create_epic` | Create a new epic |
| `add_ticket_comment` | Add comments or work summaries |
| `get_ticket_comments` | Get all comments for a ticket |
| `start_ticket_work` | Start work (creates git branch) |
| `complete_ticket_work` | Complete work and move to review |
| `link_commit_to_ticket` | Link git commits |
| `link_files_to_ticket` | Associate files with a ticket |
| `get_tickets_for_file` | Find tickets related to a file |

## Terminal Emulator Selection

In Brain Dump Settings, choose your preferred terminal:

- **Ghostty** (default if detected)
- GNOME Terminal, Konsole, Alacritty, kitty
- Xfce Terminal, MATE Terminal, Terminator, Tilix, xterm

Brain Dump auto-detects installed terminals if no preference is set.

## Ralph Workflow Details

### The PRD File

Generated at `plans/prd.json`:

```json
{
  "projectName": "My Project",
  "projectPath": "/path/to/project",
  "userStories": [
    {
      "id": "ticket-id",
      "title": "Add user authentication",
      "description": "Implement login/logout",
      "acceptanceCriteria": ["Email validation", "Password hashing"],
      "priority": "high",
      "tags": ["backend", "auth"],
      "passes": false
    }
  ]
}
```

### The Progress File

Persisted at `plans/progress.txt`:

```markdown
# Ralph Progress Log

## Iteration 1 - 2024-01-01 10:00
- Completed: Add auth database schema
- Changes: Created users table, sessions table
- Notes: Using bcrypt for password hashing

## Iteration 2 - 2024-01-01 10:30
- Completed: Add auth API endpoints
- Changes: POST /login, POST /logout, GET /me
- Notes: All tests passing
```

### Git Workflow

Ralph follows this git workflow:

1. Creates feature branch: `ralph/<ticket-id>-<description>`
2. Makes focused commits: `feat(<ticket-id>): <description>`
3. Pushes and creates PR when all tasks complete

## Sandbox Mode (Docker)

For isolated execution, enable Sandbox Mode in Settings:

1. Build the sandbox image (one-time setup in Settings)
2. Enable "Use Sandbox Mode"
3. Ralph runs in a Docker container with:
   - Your project mounted at `/workspace`
   - Claude Code auth passed through
   - Git and GitHub CLI configured

## Comparison with VS Code

| Feature | Claude Code | VS Code (Copilot) |
|---------|-------------|-------------------|
| **Autonomous execution** | Native (bash loop) | Via Background Agents |
| **Model** | Claude models | Copilot models |
| **Context management** | Fresh per iteration | Managed by Copilot |
| **Best for** | Fully autonomous backlogs | Interactive development |

Both integrate with Brain Dump's MCP server for ticket management.

## Troubleshooting

### MCP server not loading

1. Check the path in `~/.claude.json` is correct
2. Ensure Node.js is installed
3. Run Brain Dump once to initialize the database
4. Restart Claude Code

### Terminal not opening

1. Check terminal emulator settings in Brain Dump
2. Ensure your terminal is installed and in PATH
3. Try selecting a different terminal

### Ralph not progressing

1. Check `plans/progress.txt` for errors
2. Ensure tests are passing
3. Check if PRD has tasks with `passes: false`
4. Review Claude's output in the terminal

## Hooks Integration

Automatically update ticket status when Claude finishes work. Add to `~/.claude.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "command": "cd /path/to/brain-dump && pnpm brain-dump done",
        "trigger": "when the task is complete"
      }
    ]
  }
}
```
