---
name: start-work
description: Start work on a ticket
---

Call `mcp__brain-dump__start_ticket_work` with the ticket ID to begin work.

This will:
- Create a new git branch
- Set ticket status to `in_progress`
- Start telemetry session
- Create a draft PR (if auto-PR hook is enabled)

Example:
```
start_ticket_work({ ticketId: "abc-123-..." })
```
