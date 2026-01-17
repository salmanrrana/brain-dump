# Brain Dump

**Your backlog, worked by AI.** A kanban board where clicking a ticket launches Claude, Copilot, or OpenCode with full context — or let Ralph, the autonomous agent, implement tickets while you're away.

![Kanban board](docs/screenshots/kanban-board.png)

## Quick Start

```bash
git clone https://github.com/salmanrrana/brain-dump.git
cd brain-dump && ./install.sh
pnpm dev
```

Open [localhost:4242](http://localhost:4242). Done.

---

## Why Brain Dump?

| Feature               | What It Does                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **One-click context** | Click a ticket → AI opens with full context (description, acceptance criteria, linked files) |
| **Ralph Mode**        | Autonomous agent works your backlog while you sleep                                          |
| **MCP-powered**       | AI can update tickets, link commits, manage your board directly                              |
| **Local-first**       | SQLite on your machine. Your data stays yours.                                               |

---

## Quick Reference

### Commands

| Command          | Description                         |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Start Brain Dump (localhost:4242)   |
| `pnpm check`     | Type-check + lint + test            |
| `pnpm build`     | Build for production                |
| `pnpm db:studio` | Browse database with Drizzle Studio |

### CLI

| Command                   | Description                   |
| ------------------------- | ----------------------------- |
| `brain-dump current`      | Show current ticket           |
| `brain-dump done`         | Move current ticket to review |
| `brain-dump complete`     | Move current ticket to done   |
| `brain-dump backup`       | Create database backup        |
| `brain-dump check`        | Quick integrity check         |
| `brain-dump check --full` | Full database health check    |

[Full CLI reference →](docs/cli.md)

### Slash Commands

| Command      | Description                         |
| ------------ | ----------------------------------- |
| `/inception` | Interview-driven project creation   |
| `/breakdown` | Generate tickets from spec.md       |
| `/review`    | Run code review pipeline (3 agents) |
| `/simplify`  | Find refactoring opportunities      |

### Agents

| Agent             | What It Does                                                    |
| ----------------- | --------------------------------------------------------------- |
| **ralph**         | Autonomous backlog worker — iterates through tickets until done |
| **ticket-worker** | Interactive single-ticket implementation                        |
| **planner**       | Create plans and tickets from requirements                      |
| **code-reviewer** | Automated quality checks                                        |
| **inception**     | Start new projects from scratch                                 |

### Key MCP Tools

| Tool                    | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `start_ticket_work`     | Create branch + set status to in_progress |
| `complete_ticket_work`  | Move to review + suggest next ticket      |
| `create_ticket`         | Create new ticket                         |
| `list_tickets`          | List tickets (filter by status, project)  |
| `add_ticket_comment`    | Add work summaries or notes               |
| `link_commit_to_ticket` | Track git history                         |

[Full MCP reference →](docs/mcp-tools.md)

---

## Choose Your Environment

All environments get the same MCP tools, agents, and workflows.

| Environment     | Install                   | Best For                       |
| --------------- | ------------------------- | ------------------------------ |
| **Claude Code** | `./install.sh --claude`   | Terminal-native AI development |
| **VS Code**     | `./install.sh --vscode`   | Copilot Chat + extensions      |
| **OpenCode**    | `./install.sh --opencode` | Open-source AI coding          |
| **All**         | `./install.sh --all`      | Try everything                 |

<details>
<summary><strong>Environment-specific details</strong></summary>

### Claude Code

- Click "Start with Claude" on any ticket → Claude opens with full context
- Click "Start with Ralph" for autonomous mode
- Uses `~/.claude.json` for MCP config
- [Full setup guide →](docs/claude-code-setup.md)

### VS Code (Copilot)

- Agents available in Copilot Chat: `@ralph`, `@ticket-worker`, `@planner`
- Background Agents for autonomous work
- Uses `~/.vscode/mcp.json` for MCP config
- [Full setup guide →](docs/vscode-setup.md)

### OpenCode

- Tab to switch agents, `@agent-name` to invoke subagents
- Uses `.opencode/` directory for config
- [Full setup guide →](docs/opencode-setup.md)

</details>

---

## Key Workflows

### Starting Fresh? Use Inception

```
/inception
```

Claude interviews you with quick multiple-choice questions about your idea, then generates:

- Complete `spec.md` with requirements
- `plans/` folder with implementation structure
- Tickets ready to work on

### Have a Spec? Break It Down

```
/breakdown path/to/project
```

Reads your spec.md and creates epics + tickets in Brain Dump, sized for 1-4 hours of work.

### Ready to Work? Click a Ticket

1. Open Brain Dump at [localhost:4242](http://localhost:4242)
2. Click **"Start with Claude"** (or Ralph for autonomous)
3. AI opens with full ticket context
4. Work gets tracked automatically

### Done? Complete the Ticket

```bash
brain-dump done        # Move to review
brain-dump complete    # Move to done (skip review)
```

Or use MCP: `complete_ticket_work` adds a work summary and suggests the next ticket.

---

## Data

All data is local: SQLite database on your machine.

| OS    | Location                                    |
| ----- | ------------------------------------------- |
| macOS | `~/Library/Application Support/brain-dump/` |
| Linux | `~/.local/share/brain-dump/`                |

Run `brain-dump backup` to create backups. [Data locations & backup procedures →](docs/data-locations.md)

---

## Visual Workflow Guides

Understand exactly how Brain Dump works with visual flow diagrams:

| Flow                                                       | What You'll Learn                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| [Kanban & Tickets](docs/flows/kanban-workflow.md)          | Data model, status transitions, drag-drop board                      |
| [Ralph Autonomous Agent](docs/flows/ralph-workflow.md)     | State machine, iteration loop, how Ralph picks and completes tickets |
| [Docker Sandbox](docs/flows/docker-runtime.md)             | Container isolation, terminal detection, resource limits             |
| [Code Review Pipeline](docs/flows/code-review-pipeline.md) | Three-agent review system, hook enforcement, quality gates           |

See the [complete flows index](docs/flows/README.md) for the big picture.

---

## Learn More

| Topic                 | Link                                                         |
| --------------------- | ------------------------------------------------------------ |
| Claude Code setup     | [docs/claude-code-setup.md](docs/claude-code-setup.md)       |
| VS Code setup         | [docs/vscode-setup.md](docs/vscode-setup.md)                 |
| OpenCode setup        | [docs/opencode-setup.md](docs/opencode-setup.md)             |
| MCP Tools reference   | [docs/mcp-tools.md](docs/mcp-tools.md)                       |
| CLI reference         | [docs/cli.md](docs/cli.md)                                   |
| Ralph autonomous mode | [docs/flows/ralph-workflow.md](docs/flows/ralph-workflow.md) |
| Troubleshooting       | [docs/troubleshooting.md](docs/troubleshooting.md)           |
| Docker sandbox        | [docs/docker-sandbox-guide.md](docs/docker-sandbox-guide.md) |
| Backup & restore      | [docs/backup-restore.md](docs/backup-restore.md)             |

---

## License

MIT
