# VS Code Quick Start Guide

Get Brain Dumpy working with VS Code in 5 minutes.

## Prerequisites

Before you begin, ensure you have:

- **VS Code 1.99+** with native MCP support
- **Node.js 18+** installed
- **Brain Dumpy** cloned and dependencies installed
- **GitHub Copilot** or **Continue** extension (optional, for custom agents)

## Step 1: Install Brain Dumpy

If you haven't already:

```bash
git clone https://github.com/salmanrrana/brain-dump.git
cd brain-dump
pnpm install
pnpm db:migrate
```

Run the app once to initialize the database:

```bash
pnpm dev
# Open http://localhost:4242 and create a project
# Press Ctrl+C to stop
```

## Step 2: Configure MCP Server

VS Code's native MCP support connects to Brain Dumpy via a configuration file.

### Create the Configuration

```bash
# From the brain-dumpy directory
cp .vscode/mcp.json.example .vscode/mcp.json
```

### Update the Path

Edit `.vscode/mcp.json` and update the path to your installation:

```json
{
  "servers": {
    "brain-dumpy": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/YOUR/PATH/TO/brain-dumpy/mcp-server/index.js"
      ]
    }
  }
}
```

Replace `/YOUR/PATH/TO/brain-dumpy` with your actual path.

### Verify Connection

1. Restart VS Code (or reload the window: `Cmd+Shift+P` / `Ctrl+Shift+P` > "Reload Window")
2. Open the MCP panel in VS Code
3. You should see "brain-dumpy" listed as a connected server

To test the connection, ask Copilot or your AI assistant:

```
List all Brain Dumpy projects
```

You should see a response with your projects.

## Step 3: Set Up Custom Agents (Optional)

Brain Dumpy includes custom agents for VS Code that provide specialized workflows.

### Available Agents

| Agent | Purpose |
|-------|---------|
| `@inception` | Gather requirements and create project specs |
| `@breakdown` | Break specs into atomic tickets |
| `@ralph` | Autonomous ticket implementation |
| `@simplify` | Code simplification and refactoring analysis |

### Enable Agents

The agents are in `.github/agents/`. VS Code automatically discovers them if you have GitHub Copilot installed.

To use an agent, mention it in Copilot Chat:

```
@inception I want to build a todo app with React
```

## Step 4: Your First Workflow

Here's a complete workflow from idea to implemented feature.

### 1. Start with Inception

Open Copilot Chat and start a conversation:

```
@inception I want to add user authentication to my project
```

The inception agent will:
- Ask quick multiple-choice questions about your requirements
- Create a `spec.md` file with the gathered requirements
- Register your project in Brain Dumpy (if not already)

### 2. Break Down into Tickets

When inception is done, hand off to breakdown:

```
@breakdown Analyze the spec.md and create tickets
```

The breakdown agent will:
- Read your spec file
- Create an epic for the feature
- Generate atomic tickets (1-4 hours each)
- Set priorities and tags

### 3. Start Implementation

Open Brain Dumpy UI at http://localhost:4242 to see your tickets, or use Copilot:

```
@ralph Pick up the highest priority ticket and implement it
```

Ralph will:
- Find the next ticket to work on
- Create a feature branch
- Implement the feature
- Run tests
- Mark the ticket as complete
- Provide a PR description

### 4. Review and Simplify

After implementation, optionally ask for a code review:

```
@simplify Review the authentication code for complexity
```

## Quick Reference

### Common Commands

Ask your AI assistant (Copilot, Continue, etc.):

```
# Project management
"Create a new project called 'my-app' at /path/to/my-app"
"List all tickets for my-app"
"Show me in-progress tickets"

# Ticket operations
"Create a high-priority ticket to fix the login bug"
"Start work on ticket [id]"
"Mark ticket [id] as done"
"Add a comment to ticket [id]"

# Workflow
"What should I work on next?"
"Show me the database health"
```

### MCP Tools Available

| Tool | Description |
|------|-------------|
| `list_projects` | List all registered projects |
| `find_project_by_path` | Auto-detect project from path |
| `create_project` | Register a new project |
| `create_ticket` | Create a ticket |
| `list_tickets` | List tickets with filters |
| `update_ticket_status` | Move ticket between columns |
| `start_ticket_work` | Start work (creates branch) |
| `complete_ticket_work` | Complete work (moves to review) |
| `add_ticket_comment` | Add comments or work summaries |
| `get_database_health` | Check database status |

See the [README](../README.md) for the full list.

## Troubleshooting

### MCP Server Not Connecting

1. Check that Node.js is installed: `node --version`
2. Verify the path in `.vscode/mcp.json` is correct
3. Ensure Brain Dumpy has been run once to create the database
4. Restart VS Code completely

### Agents Not Appearing

1. Ensure you have GitHub Copilot installed and enabled
2. Check that `.github/agents/` directory exists
3. Try reloading VS Code window

### Database Errors

1. Run `pnpm brain-dump check` to verify database health
2. If corrupted, restore from backup: `pnpm brain-dump restore --latest`

For more help, see [Troubleshooting](troubleshooting.md).

## Next Steps

- Explore the [Fresh Eyes Workflow](fresh-eyes-workflow.md) for context management
- Learn about [Data Locations](data-locations.md) and backups
- Check out the [Backup & Restore](backup-restore.md) guide

---

Questions? Open an issue at https://github.com/salmanrrana/brain-dump/issues
