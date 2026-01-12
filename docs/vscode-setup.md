# VS Code Setup for Brain Dumpy

Brain Dumpy serves as "ground control" for your AI-assisted development workflow. This guide explains how to set up VS Code to use Brain Dumpy's agents, skills, and MCP tools globally across all your projects.

## Quick Start

Run the setup script to configure everything automatically:

```bash
cd /path/to/brain-dumpy
./scripts/setup-vscode.sh
```

This configures:
- Brain Dumpy MCP server (ticket management tools)
- Ralph and other agents (autonomous coding)
- Skills (ticket workflows)
- Prompts (/start-ticket, /complete-ticket, etc.)

After running, restart VS Code.

## Comparison: VS Code vs Claude Code

| Feature | VS Code (Copilot) | Claude Code (Terminal) |
|---------|-------------------|------------------------|
| **Autonomous execution** | Via Background Agents | Native (bash loop) |
| **Model** | Copilot models (GPT-4, Claude) | Claude models |
| **Git isolation** | Worktrees (automatic) | Branches (manual) |
| **Context management** | Managed by Copilot | Fresh per iteration |
| **MCP tool access** | Yes | Yes |
| **Best for** | Interactive + occasional automation | Fully autonomous backlogs |

**Recommendation:** Use Claude Code (terminal) mode for grinding through large backlogs autonomously. Use VS Code when you want interactive development with Copilot Chat and Brain Dumpy integration.

## Manual Setup

### Step 1: Configure MCP Server

Create `~/.vscode/mcp.json` (global) or `.vscode/mcp.json` (per-project):

```json
{
  "servers": {
    "brain-dumpy": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/brain-dumpy/mcp-server/index.js"]
    }
  }
}
```

### Step 2: Install Agents, Skills, and Prompts

Copy from Brain Dumpy to your VS Code user profile:

| OS | VS Code User Profile Path |
|----|---------------------------|
| Linux | `~/.config/Code/User/` |
| macOS | `~/Library/Application Support/Code/User/` |
| Windows | `%APPDATA%\Code\User\` |

```bash
# Linux example
cp -r /path/to/brain-dumpy/agents-example/.github/agents ~/.config/Code/User/
cp -r /path/to/brain-dumpy/agents-example/.github/skills ~/.config/Code/User/
cp -r /path/to/brain-dumpy/agents-example/.github/prompts ~/.config/Code/User/
```

### Step 3: Restart VS Code

Restart VS Code or reload the window (Ctrl+Shift+P → "Reload Window").

## Available Agents

After setup, these agents are available in Copilot Chat:

### @inception - New Project Kickstart

Starts new projects from scratch through a fast-paced interview, then creates project structure with spec.md.

```
@inception I want to build a new web app
@inception Help me start a CLI tool project
```

### @planner - Implementation Planner

Creates implementation plans and Brain Dumpy tickets from requirements. Does not write code.

```
@planner Plan implementation for user authentication
@planner Break down this feature into tickets: [description]
```

### @ralph - Autonomous Coding Agent

Works through Brain Dumpy backlogs autonomously. Best used with Background Agents for hands-free execution.

```
@ralph Work through the current backlog
@ralph Implement the pending tickets in this project
```

### @ticket-worker - Single Ticket Implementer

Focuses on implementing one ticket at a time with full Brain Dumpy integration.

```
@ticket-worker Implement ticket BD-123
@ticket-worker Start working on the highest priority ticket
```

## Available Prompts

Quick commands for common workflows:

| Command | Description |
|---------|-------------|
| `/start-ticket` | Start working on a ticket (creates branch, sets status) |
| `/complete-ticket` | Complete current ticket with work summary |
| `/create-tickets` | Create tickets from a feature description |

## Using Background Agents (Autonomous Mode)

VS Code's Background Agents provide autonomous execution similar to Claude Code's terminal mode:

### Enable Background Agents

1. Open VS Code Settings
2. Search for `github.copilot.chat.cli.customAgents.enabled`
3. Enable it

### Start a Background Agent Session

1. Open Copilot Chat
2. Click "New Chat" dropdown → "New Background Agent"
3. Select "Ralph" as the agent
4. Enter your task: "Work through the current backlog"

### How It Works

- Background agents run independently in CLI mode
- They use git worktrees for isolation (changes don't affect your working directory)
- When complete, review and merge the changes back
- Ralph will use Brain Dumpy MCP tools to track progress

## Brain Dumpy MCP Tools

With the MCP server configured, these tools are available in any chat:

### Project Management
- `list_projects` - List all registered projects
- `find_project_by_path` - Find project by directory
- `create_project` - Register a new project

### Ticket Operations
- `list_tickets` - List tickets (with filters)
- `create_ticket` - Create a new ticket
- `update_ticket_status` - Update status
- `start_ticket_work` - Start work (creates branch)
- `complete_ticket_work` - Complete work

### Progress Tracking
- `add_ticket_comment` - Add comments or work summaries
- `get_ticket_comments` - Get ticket comments
- `link_commit_to_ticket` - Link commits
- `link_files_to_ticket` - Link files

## Troubleshooting

### MCP server not loading

1. Check the path in `mcp.json` is correct
2. Ensure Node.js is installed and in PATH
3. Run Brain Dumpy once to initialize the database
4. Check VS Code Output panel for MCP errors

### Agents not appearing

1. Verify files are in the correct VS Code user profile folder
2. Check file extensions are `.agent.md`
3. Reload VS Code window
4. Enable `chat.useAgentSkills` setting for skills

### Background agents not available

1. Enable `github.copilot.chat.cli.customAgents.enabled`
2. Ensure you have VS Code 1.106+
3. Check that Copilot CLI is installed: `npm install -g @github/copilot`

## Architecture

```
Brain Dumpy (Ground Control)
├── MCP Server           → Ticket management tools
├── agents/              → Ralph, Ticket Worker, Planner
├── skills/              → Ticket workflows, Ralph workflow
└── prompts/             → /start-ticket, /complete-ticket

                    ↓ Setup Script ↓

VS Code User Profile
├── mcp.json             → MCP server config
├── agents/              → Copied from Brain Dumpy
├── skills/              → Copied from Brain Dumpy
└── prompts/             → Copied from Brain Dumpy

                    ↓ Available In ↓

All Your Projects
├── Project A            → Has Brain Dumpy tools & agents
├── Project B            → Has Brain Dumpy tools & agents
└── Project C            → Has Brain Dumpy tools & agents
```

## Sources

- [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [VS Code Prompt Files](https://code.visualstudio.com/docs/copilot/customization/prompt-files)
- [VS Code MCP Servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [VS Code Background Agents](https://code.visualstudio.com/docs/copilot/agents/background-agents)
