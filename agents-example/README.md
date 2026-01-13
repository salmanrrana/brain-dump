# Brain Dumpy - VS Code Ground Control

Brain Dumpy serves as "ground control" for your AI-assisted development workflow. This folder contains all the VS Code customizations (agents, skills, prompts) that integrate with Brain Dumpy.

## Quick Setup

Run the setup script to configure everything globally:

```bash
# From the brain-dump directory
./scripts/setup-vscode.sh
```

This will:
1. Configure the Brain Dumpy MCP server globally
2. Install agents (Ralph, Ticket Worker, Planner) to your VS Code profile
3. Install skills (ticket management, Ralph workflow)
4. Install prompts (/start-ticket, /complete-ticket, /create-tickets)

After running, Brain Dumpy tools and agents will be available in **ALL** your projects.

## Manual Setup

If you prefer to set things up manually:

### 1. Configure MCP Server

Add to `~/.vscode/mcp.json`:

```json
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/brain-dump/mcp-server/index.js"]
    }
  }
}
```

### 2. Copy Customizations to VS Code Profile

Copy the contents of `.github/` to your VS Code user profile:

| OS | Path |
|----|------|
| Linux | `~/.config/Code/User/` |
| macOS | `~/Library/Application Support/Code/User/` |
| Windows | `%APPDATA%\Code\User\` |

```bash
# Linux example
cp -r .github/agents ~/.config/Code/User/
cp -r .github/skills ~/.config/Code/User/
cp -r .github/prompts ~/.config/Code/User/
```

## What's Included

### Agents (`.github/agents/`)

| Agent | Description | Best For |
|-------|-------------|----------|
| **Inception** | New project kickstart | Starting projects from scratch with interview |
| **Planner** | Implementation planner | Breaking down features into tickets |
| **Ralph** | Autonomous backlog processor | Working through multiple tickets hands-free |
| **Ticket Worker** | Single ticket implementer | Interactive development on one ticket |

### Skills (`.github/skills/`)

| Skill | Description |
|-------|-------------|
| **brain-dump-tickets** | Ticket management workflows and MCP tool reference |
| **ralph-workflow** | Autonomous processing workflow documentation |

### Prompts (`.github/prompts/`)

| Prompt | Command | Description |
|--------|---------|-------------|
| Start Ticket | `/start-ticket` | Begin work on a ticket (creates branch) |
| Complete Ticket | `/complete-ticket` | Finish work and add summary |
| Create Tickets | `/create-tickets` | Create tickets from requirements |

## Using Background Agents

For fully autonomous execution (like Claude Code terminal mode):

1. Enable the setting: `github.copilot.chat.cli.customAgents.enabled`
2. Open Chat → New Chat dropdown → "New Background Agent"
3. Select "Ralph" as the agent
4. Describe your task or say "Work through the current backlog"

Background agents run in isolation using git worktrees, so your main workspace stays clean.

## Architecture: Ground Control Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Brain Dumpy (Ground Control)              │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Agents  │  │ Skills  │  │ Prompts │  │   MCP   │        │
│  │         │  │         │  │         │  │ Server  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │             │             │
└───────┼────────────┼────────────┼─────────────┼─────────────┘
        │            │            │             │
        └────────────┴────────────┴─────────────┘
                          │
                 VS Code User Profile
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
   │Project A│      │ Project B │     │ Project C │
   └─────────┘      └───────────┘     └───────────┘
```

Brain Dumpy is the single source of truth. All your projects get access to:
- Ralph and other agents
- Ticket management skills
- Quick prompts for common tasks
- MCP tools for creating/updating tickets

## Comparison: VS Code vs Claude Code

| Feature | VS Code (Copilot) | Claude Code (Terminal) |
|---------|-------------------|------------------------|
| Autonomous execution | Via Background Agents | Native (bash loop) |
| Git isolation | Worktrees (automatic) | Branches (manual) |
| Model | Copilot models | Claude models |
| MCP tools | Yes | Yes |
| Best for | Interactive + Background | Fully autonomous |

Both approaches work with Brain Dumpy. Choose based on your preference.
