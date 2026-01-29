# Cursor Setup for Brain Dump

Brain Dump serves as "ground control" for your AI-assisted development workflow in Cursor. This guide explains how to set up Cursor to use Brain Dump's subagents, skills, commands, and MCP tools globally across all your projects.

## Quick Start

Run the setup script to configure everything automatically:

```bash
cd /path/to/brain-dump
./scripts/setup-cursor.sh
```

This configures:

- Brain Dump MCP server (ticket management tools)
- Subagents (Ralph, Ticket Worker, Planner, Code Reviewer, etc.)
- Skills (ticket workflows, review pipeline, TanStack patterns)
- Commands (/review, /inception, /breakdown, etc.)

After running, restart Cursor to load the configurations.

## Comparison: Cursor vs VS Code vs Claude Code

| Feature                  | Cursor                          | VS Code (Copilot)                   | Claude Code (Terminal)    |
| ------------------------ | ------------------------------- | ----------------------------------- | ------------------------- |
| **Autonomous execution** | Via Subagents (background mode) | Via Background Agents               | Native (bash loop)        |
| **Model**                | Claude models                   | Copilot models (GPT-4, Claude)      | Claude models             |
| **Context isolation**    | Subagents have separate context | Managed by Copilot                  | Fresh per iteration       |
| **MCP tool access**      | Yes                             | Yes                                 | Yes                       |
| **Global availability**  | Yes (~/.cursor/)                | Yes (user profile)                  | Yes (~/.claude.json)      |
| **Best for**             | Modern AI-first IDE experience  | Interactive + occasional automation | Fully autonomous backlogs |

**Recommendation:** Use Cursor for a modern, AI-first development experience with powerful subagents and context isolation. Use Claude Code for fully autonomous backlog processing.

## Manual Setup

### Step 1: Configure MCP Server

Create or update `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["/path/to/brain-dump/mcp-server/dist/index.js"]
    }
  }
}
```

### Step 2: Install Subagents

Copy subagents from `.github/agents/*.agent.md` to `~/.cursor/agents/`, converting the extension from `.agent.md` to `.md`:

```bash
# Create directory
mkdir -p ~/.cursor/agents

# Copy and rename agents
cp /path/to/brain-dump/.github/agents/ralph.agent.md ~/.cursor/agents/ralph.md
cp /path/to/brain-dump/.github/agents/ticket-worker.agent.md ~/.cursor/agents/ticket-worker.md
# ... repeat for all agents
```

### Step 3: Install Skills

Copy skills from both `.github/skills/` and `.claude/skills/` to `~/.cursor/skills/`:

```bash
mkdir -p ~/.cursor/skills

# Copy project skills
cp -r /path/to/brain-dump/.github/skills/* ~/.cursor/skills/

# Copy review skills
cp -r /path/to/brain-dump/.claude/skills/* ~/.cursor/skills/
```

### Step 4: Install Commands

Copy commands from `.claude/commands/` to `~/.cursor/commands/`:

```bash
mkdir -p ~/.cursor/commands
cp /path/to/brain-dump/.claude/commands/*.md ~/.cursor/commands/
```

### Step 5: Restart Cursor

Restart Cursor or reload the window to load the new configurations.

## Available Subagents

After setup, these subagents are available in Cursor Agent chat:

### @ralph - Autonomous Coding Agent

Works through Brain Dump backlogs autonomously. MCP tools handle workflow - Ralph focuses on implementation.

```
@ralph Work through the current backlog
@ralph Implement all pending tickets in this project
```

**Key features:**

- Reads `plans/prd.json` to see incomplete tickets
- Picks ONE ticket per iteration (considers priority, dependencies)
- Creates git branch automatically
- Runs tests before completing
- Updates PRD and ticket status via MCP

### @ticket-worker - Single Ticket Implementer

Implements a specific Brain Dump ticket with full context. Use when you want to work on a single ticket interactively.

```
@ticket-worker Implement ticket BD-123
@ticket-worker Start working on the highest priority ticket
```

**Key features:**

- Uses `start_ticket_work` to create branch and set status
- Full ticket context (title, description, acceptance criteria)
- Interactive implementation with progress updates
- Links commits and files to tickets automatically

### @planner - Implementation Planner

Creates implementation plans and Brain Dump tickets from requirements. Does not write code - only plans and creates tickets.

```
@planner Plan implementation for user authentication
@planner Break down this feature into tickets: [description]
```

**Key features:**

- Analyzes requirements and codebase
- Creates 1-4 hour tickets with clear acceptance criteria
- Orders tickets by dependency
- Uses MCP tools to create tickets in Brain Dump

### @code-reviewer - Automated Code Review

Automated code review agent that checks for issues, silent failures, and code quality. Invoke after completing implementation work.

```
@code-reviewer Review my recent changes
@code-reviewer Check the authentication implementation
```

**Key features:**

- Reviews code against project guidelines
- Checks style, error handling, security
- Reports only high-confidence issues (confidence >= 80)
- Can hand off to other review agents

### @silent-failure-hunter - Error Handling Specialist

Specialized agent for finding silent failures, inadequate error handling, and swallowed errors in code.

```
@silent-failure-hunter Check for error handling issues
@silent-failure-hunter Find silent failures in src/api/
```

**Key features:**

- Finds empty catch blocks
- Detects fire-and-forget async calls
- Identifies missing user feedback on errors
- Reports by severity (CRITICAL, HIGH, MEDIUM, LOW)

### @code-simplifier - Code Refinement

Simplifies and refines code for clarity, consistency, and maintainability while preserving all functionality.

```
@code-simplifier Simplify the authentication code
@code-simplifier Refine the UserService class
```

**Key features:**

- Reduces unnecessary complexity
- Improves readability
- Preserves exact functionality
- Follows project coding standards

### @inception - New Project Kickstart

Starts new projects from scratch through a fast-paced interview, then creates project structure with spec.md.

```
@inception I want to build a new web app
@inception Help me start a CLI tool project
```

**Key features:**

- Fast-paced interview (2-3 questions per phase)
- Creates project structure (`src`, `tests`, `docs`, `plans`)
- Generates `spec.md` with requirements
- Registers project in Brain Dump

### Extended Review Agents

For deeper code analysis:

- **@context7-library-compliance** - Verifies library usage against official Context7 docs
- **@react-best-practices** - Reviews React/Next.js patterns and performance
- **@cruft-detector** - Finds unnecessary code, shallow tests, over-engineering
- **@senior-engineer** - Synthesizes all findings with prioritized recommendations

## Available Commands

Quick commands for common workflows:

| Command            | Description                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `/review`          | Run the initial code review pipeline (3 agents: code-reviewer → silent-failure-hunter → code-simplifier)    |
| `/extended-review` | Run extended review with library compliance, React patterns, cruft detection, and senior engineer synthesis |
| `/inception`       | Start a new project with guided interview                                                                   |
| `/breakdown`       | Break down features into tickets                                                                            |

### Using Commands

Type `/` in Cursor Agent chat to see available commands, or type the command name directly:

```
/review
/extended-review
/inception
/breakdown
```

## Available Skills

Skills provide domain-specific knowledge and workflows:

### brain-dump-tickets

Ticket management workflows for Brain Dump. Use when working with Brain Dump task management or when asked to create/update tickets.

**When to use:**

- Creating new tickets or epics
- Updating ticket status
- Adding work summaries or progress updates
- Starting or completing work on a ticket
- Linking commits or files to tickets

### ralph-workflow

Autonomous workflow patterns for Ralph. Provides knowledge about how Ralph works through backlogs.

**When to use:**

- Understanding Ralph's iteration loop
- Setting up PRD files
- Configuring progress tracking
- Understanding git workflow

### review

Code review pipeline skill. Runs the complete code review workflow after completing a coding task.

**When to use:**

- After completing a feature or fixing a bug
- Before creating a pull request
- When reviewing code quality

### review-aggregation

Combines review findings from multiple agents into a unified report.

**When to use:**

- After running multiple review agents
- When synthesizing code review results
- Creating comprehensive review reports

### tanstack-\*

TanStack library patterns for common libraries:

- **tanstack-errors** - Error handling and retry patterns
- **tanstack-forms** - Form library integration patterns
- **tanstack-mutations** - Mutation invalidation and optimistic updates
- **tanstack-query** - Query context integration and gotchas
- **tanstack-types** - Advanced TypeScript typing patterns

## Brain Dump MCP Tools

With the MCP server configured, these tools are available in any Agent chat:

### Project Management

- `list_projects` - List all registered projects
- `find_project_by_path` - Find project by directory path
- `create_project` - Register a new project

### Ticket Operations

- `list_tickets` - List tickets (with filters: status, project, limit)
- `create_ticket` - Create a new ticket
- `update_ticket_status` - Update ticket status (backlog → ready → in_progress → review → done)
- `start_ticket_work` - Start work (creates git branch, sets status)
- `complete_ticket_work` - Complete work and move to review

### Epic Management

- `list_epics` - List epics for a project
- `create_epic` - Create a new epic
- `update_epic` - Update epic title, description, or color
- `delete_epic` - Delete an epic (unlinks tickets)

### Progress Tracking

- `add_ticket_comment` - Add comments or work summaries
- `get_ticket_comments` - Get all comments for a ticket
- `link_commit_to_ticket` - Link git commits to tickets
- `link_files_to_ticket` - Associate files with a ticket
- `get_tickets_for_file` - Find tickets related to a file

### Usage Examples

Agent automatically uses MCP tools when relevant. You can also ask directly:

```
"List all my projects"
"Create a high-priority ticket to fix the authentication bug"
"Show me all in-progress tickets"
"Mark ticket abc-123 as done"
"Add a work summary to my current ticket"
```

## Using Subagents

### Invoking Subagents

You can invoke subagents in several ways:

1. **Using @ mention:**

   ```
   @ralph Work through the backlog
   @ticket-worker Implement ticket BD-123
   @planner Break down this feature
   ```

2. **Using /name syntax:**

   ```
   /ralph Work through the backlog
   /ticket-worker Implement ticket BD-123
   ```

3. **Natural language:**
   ```
   Use the ralph subagent to work through the backlog
   Have the ticket-worker subagent implement ticket BD-123
   ```

### Parallel Execution

Launch multiple subagents concurrently for maximum throughput:

```
Review the API changes and update the documentation in parallel
```

Agent sends multiple Task tool calls in a single message, so subagents run simultaneously.

### Resuming Subagents

Subagents can be resumed to continue previous conversations:

```
Resume agent abc123 and analyze the remaining test failures
```

Each subagent execution returns an agent ID. Pass this ID to resume with full context preserved.

## Troubleshooting

### MCP server not loading

1. Check the path in `~/.cursor/mcp.json` is correct
2. Ensure Node.js is installed and in PATH
3. Run Brain Dump once to initialize the database
4. Check Cursor Output panel for MCP errors (View → Output → MCP Logs)
5. Restart Cursor

### Subagents not appearing

1. Verify files are in `~/.cursor/agents/` with `.md` extension (not `.agent.md`)
2. Check YAML frontmatter is correct (name, description fields)
3. Reload Cursor window
4. Check Cursor Settings → Rules to see if subagents are listed

### Skills not available

1. Verify skill directories are in `~/.cursor/skills/`
2. Ensure each skill has a `SKILL.md` file
3. Check skill YAML frontmatter (name, description)
4. Skills are loaded on-demand - mention the skill name to trigger loading

### Commands not working

1. Verify command files are in `~/.cursor/commands/` with `.md` extension
2. Type `/` in chat to see available commands
3. Check command YAML frontmatter
4. Commands should appear in the autocomplete dropdown

### Agent not using MCP tools

1. Verify MCP server is configured and running
2. Check MCP logs in Output panel
3. Ensure Brain Dump database is initialized
4. Try explicitly asking: "Use the brain-dump MCP tools to list my projects"

## Architecture

```
Brain Dump (Ground Control)
├── MCP Server           → Ticket management tools
├── .github/agents/      → Subagent definitions (.agent.md)
├── .github/skills/      → Project-specific skills
├── .claude/skills/      → Review and workflow skills
└── .claude/commands/    → Slash commands

                    ↓ Setup Script ↓

~/.cursor/ (Global Configuration)
├── mcp.json             → MCP server config
├── agents/              → Subagents (.md files)
├── skills/              → Skills (directories with SKILL.md)
└── commands/            → Commands (.md files)

                    ↓ Available In ↓

All Your Projects
├── Project A            → Has Brain Dump tools & subagents
├── Project B            → Has Brain Dump tools & subagents
└── Project C            → Has Brain Dump tools & subagents
```

## Key Differences from VS Code

1. **Global by default** - Everything goes to `~/.cursor/` (not per-project)
2. **Subagents** - Uses `.md` files (not `.agent.md`), but YAML frontmatter is compatible
3. **MCP format** - Uses `mcpServers` (not `servers`)
4. **No prompts** - Cursor doesn't have a separate prompts system like VS Code
5. **Agent Skills standard** - Uses open Agent Skills standard for portability
6. **Context isolation** - Subagents have their own context windows for long-running tasks

## Sources

- [Cursor Subagents Documentation](https://cursor.com/docs/context/subagents)
- [Cursor Agent Skills Documentation](https://cursor.com/docs/context/skills)
- [Cursor Commands Documentation](https://cursor.com/docs/context/commands)
- [Cursor MCP Documentation](https://cursor.com/docs/context/mcp)
- [Agent Skills Standard](https://agentskills.io)
