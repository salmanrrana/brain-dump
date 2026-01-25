---
name: Complete Ticket
description: Complete work on a Brain Dump ticket - add summary, update status, optionally create PR
tools:
  - brain-dump/*
  - execute
---

# Complete Current Ticket

Finalize work on the current ticket and update Brain Dump.

## Instructions

1. Find the current ticket using `find_project_by_path` and checking in-progress tickets
2. Summarize the work done in this session
3. Run tests if available (`pnpm test` or `npm test`)
4. Commit any uncommitted changes
5. Use `complete_ticket_work(ticketId, summary)` to:
   - Move ticket to "ai_review" status
   - Get commit history for PR
6. Add a work summary comment with `add_ticket_comment`:
   - Files changed
   - Key changes made
   - Test results
7. Ask if user wants to create a PR

## Work Summary Format

```markdown
## Work Summary

**Changes Made:**

- List files modified
- Key changes and why

**Tests:**

- Test results (passing/failing)
- Any manual testing done

**Notes:**

- Any context for reviewers
- Known issues or follow-ups
```
