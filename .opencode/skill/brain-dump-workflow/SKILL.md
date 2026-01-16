---
name: brain-dump-workflow
description: Use this skill when working with Brain Dump tickets, managing backlog, or using Ralph/Ticket Worker agents. Covers ticket creation, workflow management, and Brain Dump MCP tools.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: agile
---

# Brain Dump Workflow Guide

This skill provides comprehensive guidance for working with Brain Dump tickets, managing backlogs, and using the autonomous agents effectively.

## Core Concepts

### Brain Dump Architecture

- **MCP Server**: Handles all ticket operations through structured tools
- **Local-first**: Everything stored locally, no cloud dependencies
- **Agent Integration**: Ralph and Ticket Worker use MCP tools for workflow
- **Kanban Board**: Visual interface for ticket management

### Ticket States

- **Backlog**: Ideas and future work
- **Ready**: Groomed and ready to start
- **In Progress**: Currently being worked on
- **Review**: Awaiting review/testing
- **Done**: Completed and verified

## MCP Tools Reference

### Project Management

```bash
find_project_by_path()          # Identify project from current directory
list_projects()                # Show all registered projects
```

### Ticket Operations

```bash
list_tickets()                 # Show all tickets with status
create_ticket()                # Create new ticket with metadata
update_ticket_status()          # Change ticket state
add_ticket_comment()           # Add comments or updates
```

### Workflow Tools

```bash
start_ticket_work(ticketId)     # Create branch + set in_progress
complete_ticket_work()         # Mark done + update PRD
```

## Agent Patterns

### Ralph (Autonomous Mode)

Ralph works through backlogs autonomously:

**Trigger**: Run Ralph with no specific ticket
**Pattern**:

1. Reads `plans/prd.json` for incomplete tickets
2. Checks `plans/progress.txt` for context
3. Selects optimal ticket based on priority/dependencies
4. Calls `start_ticket_work()` to begin
5. Implements, tests, commits
6. Calls `complete_ticket_work()` to finish

**Best Practices**:

- Let Ralph pick tickets (he has context)
- One ticket per Ralph session
- Check progress.txt between sessions

### Ticket Worker (Interactive Mode)

Use for specific ticket work:

**Trigger**: `@ticket-worker` or select specific ticket
**Pattern**:

1. Use `list_tickets()` to show options
2. User selects ticket to work on
3. Call `start_ticket_work(ticketId)`
4. Implement with user guidance
5. Handle user feedback iteratively

**Best Practices**:

- Ask clarifying questions before starting
- Provide progress updates
- Use `add_ticket_comment()` for decisions

## Ticket Creation Guidelines

### Good Ticket Structure

```markdown
## Title

Clear, action-oriented verb phrase

## Description

What to build and why it matters

## Acceptance Criteria

- [ ] Specific, testable requirement 1
- [ ] Specific, testable requirement 2
- [ ] Integration point with existing system

## Implementation Notes (optional)

Technical constraints, APIs to use, etc.
```

### Size Guidelines

- **Target**: 1-4 hours per ticket
- **Too large**: Break into multiple tickets
- **Too small**: Combine related work

## Workflow Commands

### Starting Work

```bash
# Interactive mode
@ticket-worker

# Autonomous mode
@ralph

# Manual ticket creation
@planner "Add user authentication"
```

### During Development

```bash
# Update progress
add_ticket_comment(ticketId, "Implemented form validation", "claude", "progress")

# Log decisions
add_ticket_comment(ticketId, "Chose Zod for validation due to runtime safety", "claude", "decision")
```

### Completing Work

```bash
# Mark complete with summary
complete_ticket_work(ticketId, "Added login form with validation and error handling")

# Update status manually
update_ticket_status(ticketId, "done")
```

## Integration Patterns

### With Git Workflows

- Tickets create feature branches automatically
- Commit messages reference ticket IDs
- Branch naming: `feature/ticket-id-description`

### With Testing

- Run tests before completing tickets
- Add test-specific acceptance criteria
- Use `pnpm test` or `npm test` commands

### With Code Review

- Move tickets to "Review" state after implementation
- Use `@code-reviewer` for automated review
- Address feedback before moving to "Done"

## Common Scenarios

### Starting New Project

1. Use `@inception` for project setup
2. Creates `spec.md` and initial backlog
3. Registers project in Brain Dump

### Getting Unstuck

1. Check `plans/progress.txt` for context
2. Use `add_ticket_comment()` to document blockers
3. Move to next ticket and return later

### Team Collaboration

- Comments visible to all team members
- Branch tracking shows who's working on what
- Progress updates prevent duplicate work

## Troubleshooting

### MCP Server Issues

- Check `mcp-server/package.json` dependencies
- Ensure Brain Dump database is accessible
- Restart MCP server if tools not available

### Ticket Not Found

- Verify project registration with `find_project_by_path()`
- Check ticket ID format (UUID)
- Use `list_tickets()` to see available tickets

### Branch Conflicts

- Pull latest changes before `start_ticket_work()`
- Resolve conflicts in feature branch
- Use `complete_ticket_work()` after resolution

## Best Practices Summary

1. **Write Clear Tickets**: Specific acceptance criteria prevent scope creep
2. **Update Progress**: Regular comments keep team informed
3. **Test Before Done**: Verify acceptance criteria
4. **Use Agents Wisely**: Ralph for autonomy, Ticket Worker for collaboration
5. **Document Decisions**: Comments explain "why" for future reference

## File Structure Reference

```
project/
├── plans/
│   ├── prd.json           # Product requirements with tickets
│   └── progress.txt        # Session history and context
├── .opencode/
│   ├── opencode.json      # OpenCode configuration
│   ├── agent/           # Agent definitions
│   └── skill/           # Skills and knowledge
├── mcp-server/          # Brain Dump MCP server
└── src/                 # Application code
```

This skill ensures effective use of Brain Dump's agent system and workflow management.
