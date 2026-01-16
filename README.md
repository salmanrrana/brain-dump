# Brain Dump

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

## OpenCode Support

Brain Dump now supports OpenCode with full agent and skill integration.

```bash
# Quick setup
./install.sh --opencode     # OpenCode only
./install.sh --all          # All IDEs (Claude + VS Code + OpenCode)
./install.sh               # Interactive selection

# Start OpenCode
cd brain-dump && opencode
```

### Available Agents

| Agent             | Mode     | Description                              |
| ----------------- | -------- | ---------------------------------------- |
| **ralph**         | Primary  | Autonomous backlog work                  |
| **ticket-worker** | Subagent | Interactive single-ticket implementation |
| **planner**       | Subagent | Create plans and tickets                 |
| **code-reviewer** | Subagent | Automated quality checks                 |
| **inception**     | Subagent | Start new projects                       |

### Quick Usage

```bash
# Switch agents with Tab
@ralph              # Autonomous work
@ticket-worker      # Interactive ticket work
@planner "feature"  # Plan new features
@code-reviewer      # Review changes
@inception          # Start new project
```

**Full guide**: [OpenCode Integration Guide](docs/opencode-setup.md)

## VS Code & Claude Code Support

Brain Dump also integrates with VS Code Copilot and Claude Code:

```bash
./install.sh --claude    # Claude Code integration
./install.sh --vscode    # VS Code integration
./install.sh --all       # All IDEs
```

### Skills Available

| Skill                 | Description                         | Source |
| --------------------- | ----------------------------------- | ------ |
| react-best-practices  | React/Next.js performance rules     | Vercel |
| web-design-guidelines | Accessibility and UX best practices | Vercel |

Skills auto-discover based on your request context. Update with:

```bash
git submodule update --remote  # Pull latest
./install.sh --claude --vscode  # Re-install
```

### Learn More

- [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code/skills)
- [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview)

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

- [OpenCode Integration Guide](docs/opencode-setup.md)
- [MCP Server Tools](docs/mcp-tools.md)
- [Ralph Workflow](docs/ralph.md)
- [CLI Reference](docs/cli.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
