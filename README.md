# Brain Dump

**Your backlog, worked by AI.** A local kanban board where clicking a ticket launches Claude, Codex, Cursor, Copilot, OpenCode, or Pi with full context — or lets Ralph, the autonomous agent, work tickets on its own.

> **⚠️ Experimental — personal tooling**
>
> Built for a single developer on a single machine. All state is local SQLite; there is no server, sync, or multi-user support. Under active development: things may change or break without notice. [Report issues](https://github.com/salmanrrana/brain-dump/issues).

## Quickstart

Requires macOS or Linux (WSL works), `git`/`bash`/`curl`, and Node.js 18+ with `pnpm`.

```bash
git clone https://github.com/salmanrrana/brain-dump.git
cd brain-dump
./install.sh --claude   # or --codex --cursor --vscode --opencode --copilot --pi --all
pnpm dev
```

Open [localhost:4242](http://localhost:4242), then confirm the wiring:

```bash
pnpm brain-dump doctor          # validate installation
pnpm brain-dump status --pretty # project dashboard
```

Run `./install.sh --help` to pick environments interactively.

### Choose your environment

| Environment          | Install                   |
| -------------------- | ------------------------- |
| **Claude Code**      | `./install.sh --claude`   |
| **VS Code**          | `./install.sh --vscode`   |
| **OpenCode**         | `./install.sh --opencode` |
| **Cursor Editor**    | `./install.sh --cursor`   |
| **Cursor Agent CLI** | `./install.sh --cursor`   |
| **Copilot CLI**      | `./install.sh --copilot`  |
| **Codex**            | `./install.sh --codex`    |
| **Pi**               | `./install.sh --pi`       |
| **All**              | `./install.sh --all`      |

Every environment shares the same MCP tools and quality workflow. Per-environment guides live in [docs/environments](docs/environments/).

## What it does

|                       |                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| **One-click context** | Click a ticket → your AI opens with the description, acceptance criteria, and linked files already loaded |
| **Quality workflow**  | AI review → fix loop → verification evidence bound to a commit, identical in every environment            |
| **Ralph mode**        | Autonomous agent picks up tickets and works them unattended                                               |
| **Multi-environment** | Claude Code, Codex, Cursor, VS Code, OpenCode, Copilot CLI, and Pi share the same MCP tools and workflow  |
| **Local-first**       | SQLite on your machine. Nothing leaves it.                                                                |

## The workflow

Every ticket moves through the same gates:

```text
ready → in_progress → ai_review → ai_verification → done
                          ↑
                     [fix loop]
```

Three review agents find issues, the fix loop repeats until no critical or major findings remain, then a runner executes the demo steps and records the evidence that moves the ticket to `done`. The agent doing the work cannot certify it.

[How the workflow works →](docs/universal-workflow.md) · [Visual flow guides →](docs/flows/README.md)

## Driving it from the terminal

The CLI mirrors every MCP tool action, so the web UI is optional:

```bash
brain-dump init                                # register this directory
brain-dump search "auth bug" --pretty          # full-text search
brain-dump workflow start-work --ticket <id>   # start work, create branch
brain-dump workflow launch-ticket --ticket <id> --provider claude-code
brain-dump workflow complete-work --ticket <id> --summary "Added caching"
```

Add `--pretty` to any command for human-readable output; the default is JSON.

[Full CLI reference →](docs/cli.md) · [MCP tools reference →](docs/mcp-tools.md)

## Development

| Command           | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `pnpm dev`        | Start the app on `localhost:4242`                                  |
| `pnpm check:fast` | Lint, cached project types, and tests related to changed files     |
| `pnpm check`      | Type-check + lint + tests (required before any ticket is complete) |
| `pnpm test:e2e`   | Playwright end-to-end tests                                        |
| `pnpm db:migrate` | Run database migrations                                            |
| `pnpm build`      | Production build                                                   |

## Data

Local SQLite — `~/.local/share/brain-dump/` on Linux, `~/Library/Application Support/brain-dump/` on macOS.

```bash
brain-dump admin backup        # create a backup
brain-dump admin check --full  # integrity check
```

[Data locations & backup →](docs/data-locations.md)

## Docs

|                                                  |                                                              |
| ------------------------------------------------ | ------------------------------------------------------------ |
| [CLI reference](docs/cli.md)                     | Every command and flag                                       |
| [MCP tools](docs/mcp-tools.md)                   | 9 tools, all actions                                         |
| [Universal workflow](docs/universal-workflow.md) | The quality gates in detail                                  |
| [Workflow skills](docs/workflow-skills.md)       | Slash commands like `/inception`, `/breakdown`, `/next-task` |
| [Flow diagrams](docs/flows/README.md)            | Kanban, Ralph, review pipeline, Docker sandbox               |
| [Architecture](docs/architecture.md)             | How the pieces fit together                                  |
| [Environment setup](docs/claude-code-setup.md)   | Claude Code, and siblings for each other environment         |
| [Troubleshooting](docs/troubleshooting.md)       | When something breaks                                        |

## License

MIT
