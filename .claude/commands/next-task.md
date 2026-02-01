---
description: Pick up the next task with precondition checking
---

# Next Task

Load the `brain-dump-workflow` skill for context on the full workflow.

You are starting work on the next available task from the Brain Dump kanban board.

## Steps

1. **Find the project and next ticket:**

   ```
   find_project_by_path({ path: "<current-directory>" })
   list_tickets({ projectId: "<project-id>", status: "ready", limit: 5 })
   ```

2. **Select ticket based on priority:**
   - Pick the highest priority `ready` ticket
   - Consider dependencies (check if blocked)
   - Prefer tickets in the current epic if one is active

3. **Start work on the ticket:**

   ```
   start_ticket_work({ ticketId: "<ticket-id>" })
   ```

   - The tool will check preconditions and block if needed
   - Follow any instructions in the response (e.g., if previous ticket needs human review)

4. **If successful, create a micro-plan:**
   - Write a 5-10 bullet implementation plan
   - Use the TodoWrite tool to track tasks
   - Include: what to change, what to test, edge cases

5. **Implement the changes:**
   - Follow the ticket description and acceptance criteria
   - Make atomic commits with format: `feat(<ticket-id>): <description>`

6. **Run validation before completing:**

   ```bash
   pnpm type-check && pnpm lint && pnpm test
   ```

7. **Complete implementation:**
   ```
   complete_ticket_work({ ticketId: "<ticket-id>", summary: "..." })
   ```

## Important

- The MCP tool enforces preconditions - trust its guidance
- If blocked (e.g., previous ticket in human_review), follow the instructions to unblock
- Always write a plan before coding
- Always validate before completing
- After completing, ticket moves to `ai_review` - run `/review-ticket` next

## Status Flow

```
backlog → ready → in_progress → ai_review → human_review → done
                                ↑
                             You are here after complete_ticket_work
```

## When Blocked

If `start_ticket_work` returns a blocking message:

- **Previous ticket in human_review**: Wait for human approval or escalate
- **Validation failed**: Fix issues first
- **Branch conflict**: Resolve git conflicts
