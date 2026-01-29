---
name: brain-dump-workflow
description: Use when working with Brain Dump tickets, managing backlog, or using Ralph/Ticket Worker agents
license: MIT
compatibility: opencode
---

# Brain Dump Workflow

## Core Concepts

- **MCP Server**: Structured ticket operations via tools
- **Local-first**: No cloud dependencies
- **Agent Integration**: Ralph/Ticket Worker use MCP tools
- **Ticket States**: Backlog → Ready → In Progress → Review → Done

## Essential MCP Tools

```bash
# Project Management
find_project_by_path()    # Identify current project
list_projects()           # Show all projects

# Ticket Operations
list_tickets()            # Show tickets with status
create_ticket()           # Create new ticket
update_ticket_status()    # Change ticket state
add_ticket_comment()       # Add comments/updates

# Workflow Tools
start_ticket_work(ticketId)     # Create branch + set in_progress
complete_ticket_work()         # Mark done + update PRD
```

## Agent Patterns

### Ralph (Autonomous)

```bash
# Trigger: Run Ralph without specific ticket
1. Read plans/prd.json for incomplete tickets
2. Check plans/progress.txt for context
3. Select optimal ticket by priority/dependencies
4. Call start_ticket_work() to begin
5. Implement, test, commit
6. Call complete_ticket_work() to finish
```

### Ticket Worker (Interactive)

```bash
# Trigger: @ticket-worker or select ticket
1. Use list_tickets() to show options
2. User selects ticket to work on
3. Call start_ticket_work(ticketId)
4. Implement with user guidance
5. Update progress with add_ticket_comment()
```

## Quick Reference

### Ticket Structure

```markdown
## Title (action-oriented)

## Description (what + why)

## Acceptance Criteria

- [ ] Specific, testable requirement
- [ ] Integration point
```

### Workflow Commands

```bash
# Start work
@ticket-worker    # Interactive mode
@ralph            # Autonomous mode
@planner "feature"  # Plan and create tickets

# During development
add_ticket_comment(ticketId, "progress", "claude", "progress")
add_ticket_comment(ticketId, "decision", "claude", "decision")

# Complete work
complete_ticket_work(ticketId, "summary of changes")
update_ticket_status(ticketId, "done")
```

### Best Practices

1. **Clear tickets**: Specific acceptance criteria
2. **Progress updates**: Regular comments
3. **Test before done**: Verify criteria
4. **Use agents wisely**: Ralph for autonomy, Ticket Worker for collaboration
5. **Document decisions**: Comments explain "why"

### Size Guidelines

- Target: 1-4 hours per ticket
- Too large: Break into multiple tickets
- Too small: Combine related work
