---
name: Start Ticket
description: Start working on a Brain Dumpy ticket - creates branch and sets status
tools:
  - brain-dump/*
  - execute
---

# Start Working on a Ticket

Use the Brain Dumpy MCP tools to start working on a ticket.

## Instructions

1. If no ticket ID provided, use `list_tickets` to show available tickets
2. Use `start_ticket_work(ticketId)` to:
   - Create a feature branch
   - Set ticket status to "in_progress"
   - Get full ticket context
3. Show the user:
   - Ticket title and description
   - Acceptance criteria (subtasks)
   - The created branch name
4. Ask if they're ready to start implementing

## Example

```
Ticket: Add user login form
Branch: feature/abc123-add-user-login
Status: in_progress

Acceptance Criteria:
- [ ] Email input with validation
- [ ] Password input with show/hide
- [ ] Submit button with loading state
- [ ] Error message display

Ready to start implementing?
```
