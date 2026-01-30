# OpenCode Integration Guide

## Overview

OpenCode provides specialized agents and skills that integrate with Brain Dump's MCP server:

- **Autonomous coding** with Ralph agent
- **Interactive ticket work** with Ticket Worker
- **Specialized knowledge** through skills
- **Full Brain Dump integration** via MCP tools

## Quick Start

```bash
# 1. Install OpenCode (if needed)
brew install opencode  # or visit https://opencode.ai

# 2. Configure (already done in Brain Dump)
cd brain-dump
ls .opencode/  # opencode.json, agent/, skill/

# 3. Start OpenCode
opencode
```

## Available Agents

### Primary Agents (use Tab to switch)

| Agent     | Purpose                 | Use When                         |
| --------- | ----------------------- | -------------------------------- |
| **ralph** | Autonomous backlog work | Want Ralph to work independently |
| **build** | Standard development    | Regular coding tasks             |

### Subagents (invoke with @agent-name)

| Agent              | Purpose                   | Permissions |
| ------------------ | ------------------------- | ----------- |
| **@ticket-worker** | Interactive single-ticket | Full access |
| **@planner**       | Create plans & tickets    | Read-only   |
| **@code-reviewer** | Automated quality checks  | Read-only   |
| **@inception**     | Start new projects        | Full access |

## Workflow Examples

### Autonomous (Ralph)

```bash
@ralph
# Ralph: Reads PRD, selects ticket, implements, completes
```

### Interactive (Ticket Worker)

```bash
@ticket-worker
# User: Show available tickets
# User: Work on "Add user login"
# Worker: Creates branch, implements with guidance
```

### Planning (Planner)

```bash
@planner "Add user authentication with OAuth"
# Planner: Analyzes codebase, creates 1-4hr tickets
```

## Skills

OpenCode automatically discovers Brain Dump skills:

| Skill                 | When to Use                   |
| --------------------- | ----------------------------- |
| `brain-dump-workflow` | Working with tickets/backlog  |
| `ralph-autonomous`    | Ralph working autonomously    |
| `tanstack-*`          | React Query/Forms development |
| `review-aggregation`  | Combining review findings     |

Skills load automatically based on context or by request.

## Extended Review Agents

For deeper code analysis, these specialized review agents are available:

| Agent                        | Purpose                              | Invocation                     |
| ---------------------------- | ------------------------------------ | ------------------------------ |
| @context7-library-compliance | Verify library usage against docs    | `@context7-library-compliance` |
| @react-best-practices        | React/Next.js patterns               | `@react-best-practices`        |
| @cruft-detector              | Find unnecessary code, shallow tests | `@cruft-detector`              |
| @senior-engineer             | Synthesize findings (run last)       | `@senior-engineer`             |

### Extended Review Workflow

```bash
# After standard code review, run extended agents
@context7-library-compliance Review my API changes
@react-best-practices Check component patterns
@cruft-detector Scan for cruft
@senior-engineer Provide final recommendation
```

**Note:** In OpenCode, agents must be invoked manually (no auto-chaining hooks).

## MCP Tools

Brain Dump's MCP server provides:

```bash
# Project Management
find_project_by_path()    # Identify current project
list_projects()           # Show all projects

# Ticket Operations
list_tickets()            # Show tickets with status
create_ticket()           # Create new ticket
update_ticket_status()    # Change ticket state
add_ticket_comment()      # Add comments/updates

# Workflow Tools
start_ticket_work(ticketId)     # Create branch + set in_progress
complete_ticket_work(ticketId, summary)  # Mark done + update PRD
```

## Configuration Files

- **`.opencode/opencode.json`** - MCP server settings, permissions
- **`.opencode/agent/*.md`** - Agent definitions (markdown format)
- **`.opencode/skill/*/SKILL.md`** - Skill definitions with metadata

## Quick Commands

```bash
# Start autonomous work
@ralph

# Work on specific ticket
@ticket-worker

# Plan new features
@planner "Add user authentication"

# Review changes
@code-reviewer

# Start new project
@inception
```

## Best Practices

- **Ralph**: For autonomous backlog work
- **Ticket Worker**: For collaborative development
- **Planner**: For requirements analysis and ticket creation
- **Code Reviewer**: Before completing tickets/PRs
- Always use MCP tools for ticket operations
- One ticket at a time for focused work

## Troubleshooting

```bash
# Check MCP server
npx tsx mcp-server/index.ts

# Verify configuration
cat .opencode/opencode.json

# Check agents/skills
ls .opencode/agent/ .opencode/skill/*/

# Fix permissions
chmod -R 755 .opencode/
```

## Support

- **OpenCode Docs**: https://opencode.ai/docs/
- **Brain Dump**: https://github.com/salmanrrana/brain-dump/issues
- **OpenCode Discord**: https://opencode.ai/discord
