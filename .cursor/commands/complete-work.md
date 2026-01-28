---
name: complete-work
description: Complete implementation phase for a ticket
---

Call `mcp__brain-dump__complete_ticket_work` to finish the implementation phase.

This will:
- Run validation checks (type-check, lint, test)
- Move ticket to `ai_review` status
- Add work summary to ticket comments

Prerequisites:
- All acceptance criteria must be met
- All tests must pass
- No type or lint errors

Example:
```
complete_ticket_work({
  ticketId: "abc-123-...",
  summary: "Implemented feature X with tests"
})
```
