# Brain Dumpy

A local-first kanban board for AI-assisted development. Click an epic, Claude gets the context.

![Kanban board](docs/screenshots/kanban-board.png)

## Install

```bash
git clone https://github.com/salmanrrana/brain-dump.git
cd brain-dump
./install.sh --claude   # or --vscode
pnpm dev
```

Open [http://localhost:4242](http://localhost:4242). Done.

The installer handles Node.js, pnpm, dependencies, database, and MCP server setup automatically.

## How It Works

1. **Create tickets** in the web UI (or use `/inception` to have Claude interview you)
2. **Click "Start with Claude"** on a ticket
3. Claude opens with full ticket context
4. Work gets tracked automatically

That's it. No cloud, no accounts, all local.

## Start a New Project

Don't know where to begin? Run `/inception` in Claude Code:

```
> /inception
```

Claude will interview you with quick multiple-choice questions about your idea, then generate:
- A complete `spec.md` with requirements
- A `plans/` folder with implementation steps
- Tickets ready to work on

Go from "I have an idea" to "I have a backlog" in 5 minutes.

## Features

- **Kanban board** - Drag tickets between Backlog → Ready → In Progress → Review → Done
- **MCP integration** - Claude can create/update tickets from any project
- **Ralph mode** - Autonomous agent that works through your backlog
- **Full-text search** - Find anything instantly
- **File attachments** - Drag and drop onto tickets

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm test         # Run tests
pnpm db:studio    # Browse database
```

## Data

Everything stored locally:
- **macOS**: `~/Library/Application Support/brain-dump/`
- **Linux**: `~/.local/share/brain-dump/`

## More Info

- [MCP Server Tools](docs/mcp-tools.md)
- [Ralph Workflow](docs/ralph.md)
- [CLI Reference](docs/cli.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
