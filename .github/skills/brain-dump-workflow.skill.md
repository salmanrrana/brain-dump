---
name: brain-dump-workflow
description: Manages ticket workflow for Brain Dump projects
applyTo: "**/*"
---

# Brain Dump Workflow Skill

When the user asks to start work on a ticket, work on a task, or implement a feature, follow this workflow:

## Selecting a Ticket

1. Call `mcp__brain-dump__list_tickets({ status: 'ready', limit: 10 })` to see available tickets
2. Consider:
   - Priority (high > medium > low)
   - Dependencies (unblocked tickets first)
   - Epic context (continue current epic if possible)
3. Present top 3 recommendations with rationale
4. Once user selects, call `mcp__brain-dump__workflow "start-work"({ ticketId })`

## Starting Work

1. Create a session: `mcp__brain-dump__session "create"({ ticketId })`
2. Read the ticket description and acceptance criteria
3. Update session state: `session "update-state"({ state: 'analyzing' })`

## Implementing

1. Analyze the requirements
2. Update session state: `session "update-state"({ state: 'implementing' })`
3. Write and modify code
4. Run tests: `pnpm test`
5. Verify acceptance criteria are met

## Testing & Review

1. Run full test suite: `pnpm test`
2. Run type check: `pnpm type-check`
3. Run linter: `pnpm lint`
4. Update session state: `session "update-state"({ state: 'testing' })`

## Completing Work

1. Create commit with format: `feat(<ticket-id>): <description>`
2. Update session state: `session "update-state"({ state: 'committing' })`
3. Call `mcp__brain-dump__workflow "complete-work"({ ticketId, summary })`
4. This moves ticket to `ai_review` status

## AI Review Phase

After `workflow "complete-work"`:

1. Run review agents to identify issues:
   - Call `review "submit-finding"` for each finding
   - Include severity (critical, major, minor, suggestion)
   - Be specific about file paths and line numbers

2. Check completion: `review "check-complete"({ ticketId })`
   - If open critical/major findings, stay in ai_review
   - If all critical/major fixed, proceed to human review

3. Verify findings are fixed using `review "mark-fixed"`

## Human Review Phase

When ready for human approval:

1. Call `review "generate-demo"({ ticketId, steps })` with demo steps
2. This transitions ticket to `human_review`
3. Update session state: `session "update-state"({ state: 'reviewing' })`
4. Wait for human to review demo and approve

## Completion

1. Once demo approved, ticket moves to `done` status
2. Optionally call `epic "reconcile-learnings"` to extract patterns
3. Complete session: `session "complete"({ sessionId, outcome: 'success' })`

## Example: Selecting Next Task

```
User: "What's next?"

Step 1: List available tickets
mcp__brain-dump__list_tickets({ status: 'ready', limit: 10 })

Step 2: Present recommendations
- **High Priority (3 options):**
  1. "Add validation to form inputs" - blocks 2 other tickets
  2. "Fix API error handling" - critical bug
  3. "Update documentation" - quick win

Step 3: Wait for selection, then start work
mcp__brain-dump__workflow "start-work"({ ticketId: "..." })
```

## Tips

- Always verify acceptance criteria before marking complete
- Use meaningful commit messages referencing the ticket ID
- Keep changes focused and minimal
- Run tests frequently during development
- Don't skip code review - it catches real bugs
- Demo scripts should cover happy path + edge cases
