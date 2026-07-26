---
description: Pick up the next task with precondition checking
---

# Next Task

Load the `brain-dump-workflow` skill for context on the full workflow.

You are starting work on the next available task from the Brain Dump kanban board.

## Steps

1. **Find the project and next ticket:**

   ```
   project tool, action: "find-by-path", path: "<current-directory>"
   ticket tool, action: "list", projectId: "<project-id>", status: "ready", limit: 5
   ```

2. **Select ticket based on priority:**
   - Pick the highest priority `ready` ticket
   - Consider dependencies (check if blocked)
   - Prefer tickets in the current epic if one is active

3. **Start work on the ticket:**

   ```
   workflow tool, action: "start-work", ticketId: "<ticket-id>"
   ```

   - The tool validates the transition (only backlog/ready/in_progress tickets can start; tickets past implementation are rejected to protect their review state)
   - Follow any instructions in the response

4. **If successful, create a micro-plan:**
   - Write a 5-10 bullet implementation plan
   - Use the TodoWrite tool to track tasks
   - Include: what to change, what to test, edge cases

5. **Implement the changes:**
   - Follow the ticket description and acceptance criteria
   - Make atomic commits with format: `feat(<ticket-id>): <description>`

6. **Run validation before completing:**

   Discover validation commands from the target project's docs/config before running checks. Use the project's own commands (for example package scripts, Makefile/Justfile targets, Go/Python/PHP/Rust test commands, or CI-documented gates); do not assume pnpm, npm, TypeScript, lint, or test scripts exist. If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.

7. **Complete implementation:**
   ```
   workflow tool, action: "complete-work", ticketId: "<ticket-id>", summary: "..."
   ```

## Important

- The MCP tool enforces status transitions - trust its guidance
- Tickets in `ai_verification` belong to the verification runner; leave them and pick a different workable ticket
- Always write a plan before coding
- Always run discovered project-specific validation before completing
- After completing, ticket moves to `ai_review` - run `/review-ticket` next

## Status Flow

```
backlog → ready → in_progress → ai_review → ai_verification → done
                                ↑
                             You are here after workflow "complete-work"
```

## When Blocked

If `workflow` tool `start-work` returns a blocking message:

- **Ticket already past implementation** (`ai_review`/`ai_verification`/`done`): start-work is rejected to protect review state; resume via the review workflow instead
- **Validation failed**: Fix issues first
- **Branch conflict**: Resolve git conflicts
