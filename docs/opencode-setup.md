# OpenCode Integration Guide

This guide explains how to set up and use OpenCode with Brain Dump for enhanced development workflows.

## Overview

OpenCode provides specialized agents, tools, and skills that integrate seamlessly with Brain Dump's MCP server. This gives you:

- **Autonomous coding** with Ralph agent
- **Interactive ticket work** with Ticket Worker agent
- **Specialized knowledge** through skills
- **Full Brain Dump integration** via MCP tools

## Quick Start

### 1. Install OpenCode

If you don't have OpenCode installed:

```bash
# Visit https://opencode.ai for installation instructions
# macOS example:
brew install opencode

# Or download binary from releases
```

### 2. Configure for Brain Dump

The Brain Dump repository already includes OpenCode configuration:

```bash
cd brain-dump
ls .opencode/
# .opencode/
# ├── opencode.json      # Main configuration
# ├── agent/           # Agent definitions
# └── skill/           # Skills and knowledge
```

### 3. Start OpenCode

```bash
# In the brain-dump directory
opencode
```

OpenCode will automatically discover the configuration and load Brain Dump agents, skills, and MCP server.

## Available Agents

### Primary Agents

Primary agents handle your main conversation. Use **Tab** to switch between them.

#### Ralph (`ralph`)

- **Mode**: Primary
- **Purpose**: Autonomous coding agent that works through Brain Dump backlogs
- **Use when**: You want Ralph to work independently through tickets
- **Temperature**: 0.3 (balanced creativity)

#### Build (`build`)

- **Mode**: Primary (OpenCode built-in)
- **Purpose**: Standard development work with all tools enabled
- **Use when**: Regular coding tasks outside Brain Dump workflow

### Subagents

Invoke subagents with **@agent-name**:

#### Ticket Worker (`@ticket-worker`)

- **Purpose**: Interactive single-ticket implementation
- **Use when**: You want to work on a specific ticket with guidance
- **Temperature**: 0.2 (focused)

#### Planner (`@planner`)

- **Purpose**: Creates implementation plans and Brain Dump tickets
- **Use when**: Breaking down features into tickets
- **Temperature**: 0.1 (very precise)
- **Permissions**: Read-only (no code changes)

#### Code Reviewer (`@code-reviewer`)

- **Purpose**: Automated code review and quality checks
- **Use when**: Reviewing implementation before completion
- **Temperature**: 0.1 (analytical)
- **Permissions**: Read-only

#### Inception (`@inception`)

- **Purpose**: Starts new projects through fast interview
- **Use when**: Creating new project from scratch
- **Temperature**: 0.4 (creative)

## Agent Workflows

### Autonomous Workflow (Ralph)

1. **Start**: `@ralph` or select Ralph as primary agent
2. **Analyze**: Ralph reads `plans/prd.json` and `plans/progress.txt`
3. **Select**: Chooses optimal ticket based on priority/dependencies
4. **Implement**: Writes code, runs tests, verifies acceptance criteria
5. **Complete**: Calls `complete_ticket_work()` and moves to next ticket

### Interactive Workflow (Ticket Worker)

1. **Start**: `@ticket-worker`
2. **Select**: Choose ticket from `list_tickets()` output
3. **Branch**: `start_ticket_work(ticketId)` creates feature branch
4. **Implement**: Work with user guidance and feedback
5. **Complete**: Manual completion with progress updates

### Planning Workflow (Planner)

1. **Start**: `@planner "feature description"`
2. **Analyze**: Examines existing codebase for patterns
3. **Plan**: Breaks into 1-4 hour tickets with dependencies
4. **Create**: Uses MCP tools to create tickets in Brain Dump

## Skills Integration

OpenCode automatically discovers Brain Dump skills:

### Core Skills

| Skill                 | When to Use                               |
| --------------------- | ----------------------------------------- |
| `brain-dump-workflow` | Working with tickets, backlogs, or agents |
| `ralph-autonomous`    | Ralph working autonomously                |
| `tanstack-*`          | React Query/Forms development             |

### Using Skills

Agents automatically load relevant skills when needed:

```bash
# Ralph will automatically load brain-dump-workflow skill
@ralph

# For React Query work, tanstack-query skill loads
@ticket-worker "Implement useQuery for user data"
```

You can also request specific skills:

```bash
# Load specific skill
Use the brain-dump-workflow skill to understand ticket creation

# Agent will ask permission, then load full instructions
```

## MCP Integration

Brain Dump's MCP server provides these tools to OpenCode:

### Project Management

- `find_project_by_path()` - Identify current project
- `list_projects()` - Show all registered projects

### Ticket Operations

- `list_tickets()` - Show tickets with status
- `create_ticket()` - Create new ticket
- `update_ticket_status()` - Change ticket state
- `add_ticket_comment()` - Add comments/updates

### Workflow Tools

- `start_ticket_work(ticketId)` - Create branch + set in_progress
- `complete_ticket_work(ticketId, summary)` - Mark done + update PRD

### Configuration

The MCP server is configured in `.opencode/opencode.json`:

```json
{
  "mcp": {
    "brain-dump": {
      "type": "local",
      "command": ["node", "mcp-server/index.js"],
      "enabled": true,
      "environment": {
        "BRAIN_DUMP_PATH": "."
      }
    }
  }
}
```

## Configuration Files

### `.opencode/opencode.json`

Main OpenCode configuration including:

- MCP server settings
- Agent definitions and permissions
- Tool access controls
- Skill permissions

### `.opencode/agent/*.md`

Individual agent definitions in markdown format. Alternative to JSON configuration.

### `.opencode/skill/*/SKILL.md`

Skill definitions with frontmatter:

- `name` and `description` for discovery
- `compatibility` and `license` metadata
- Full skill instructions

## Usage Examples

### Starting Autonomous Work

```bash
opencode
# [Ralph selected as primary agent]

> Work through the backlog

# Ralph autonomously:
# 1. Reads tickets from PRD
# 2. Selects optimal ticket
# 3. Implements feature
# 4. Moves to next ticket
```

### Interactive Ticket Work

```bash
opencode
# [Build selected as primary agent]

> @ticket-worker
# [Ticket Worker loads]

> Show me available tickets
# Uses list_tickets() MCP tool

> Work on ticket "Add user login"
# Uses start_ticket_work() MCP tool
# Implements with user guidance
```

### Planning New Features

```bash
opencode

> @planner "Add user authentication with OAuth providers"
# [Planner loads and analyzes requirements]

> Create tickets for this feature
# Uses create_ticket() MCP tool multiple times
# Generates well-structured backlog
```

### Code Review

```bash
opencode

> @code-reviewer
# [Code Reviewer loads]

> Review the changes I just made
# Analyzes git diff, checks code quality
# Provides detailed feedback report
```

## Best Practices

### Agent Selection

- **Ralph**: For autonomous backlog work
- **Ticket Worker**: For collaborative, interactive development
- **Planner**: For requirements analysis and ticket creation
- **Code Reviewer**: Before completing tickets or PRs

### Skill Usage

- Let agents suggest relevant skills automatically
- Request specific skills for complex domains
- Trust skill recommendations for specialized knowledge

### MCP Integration

- Always use MCP tools for ticket operations
- This provides structured data vs. parsing output
- Enables better tracking and collaboration

### Session Management

- One ticket at a time for focused work
- Document blockers with ticket comments
- Complete tickets properly before moving on

## Troubleshooting

### MCP Server Not Available

```bash
# Check MCP server is running
node mcp-server/index.js

# Verify configuration
cat .opencode/opencode.json

# Restart OpenCode
opencode --restart
```

### Agents Not Showing

```bash
# Check agent files exist
ls .opencode/agent/

# Validate syntax
opencode validate-config

# Check permissions
opencode list-agents
```

### Skills Not Loading

```bash
# Check skill structure
ls .opencode/skill/*/SKILL.md

# Verify frontmatter format
head -10 .opencode/skill/brain-dump-workflow/SKILL.md

# Test skill loading
opencode list-skills
```

### Permission Issues

```bash
# Check file permissions
ls -la .opencode/

# Fix permissions if needed
chmod -R 755 .opencode/
```

## Advanced Configuration

### Custom Agents

Create your own agents:

```bash
# Create new agent file
cat > .opencode/agent/my-specialist.md << 'EOF'
---
description: Specialist for my specific domain
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
tools:
  write: true
  edit: true
  bash: true
---

You are a specialist agent for...
EOF
```

### Custom Skills

Add domain-specific knowledge:

```bash
mkdir .opencode/skill/my-domain
cat > .opencode/skill/my-domain/SKILL.md << 'EOF'
---
name: my-domain
description: Specialized knowledge for my domain
license: MIT
compatibility: opencode
---

# My Domain Knowledge

This skill provides expertise in...
EOF
```

### Environment Variables

Set Brain Dump specific environment:

```bash
export BRAIN_DUMP_PATH="/path/to/brain/dump"
export OPENCODE_CONFIG_PATH=".opencode/opencode.json"
opencode
```

## Migration from VS Code/Claude Code

If you're migrating from VS Code Copilot or Claude Code:

### What's the Same

- All existing skills work in OpenCode
- Brain Dump functionality unchanged
- MCP server integration identical

### What's Different

- **Agent system**: OpenCode has primary/subagent distinction
- **Tab switching**: Use Tab to cycle between primary agents
- **@-mentions**: Subagents invoked with @agent-name
- **Configuration**: JSON + markdown instead of just AGENTS.md

### Migration Steps

1. Install OpenCode
2. Configuration already included in Brain Dump
3. Start using OpenCode commands
4. Gradually learn agent workflows

## Support

- **OpenCode Documentation**: https://opencode.ai/docs/
- **Brain Dump Issues**: https://github.com/salmanrrana/brain-dump/issues
- **OpenCode Discord**: https://opencode.ai/discord
- **Brain Dump Repository**: https://github.com/salmanrrana/brain-dump
