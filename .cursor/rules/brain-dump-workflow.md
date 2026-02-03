---
description: "Brain Dump quality workflow enforcement for AI-assisted development"
alwaysApply: true
---

# Brain Dump Workflow

When working on Brain Dump tickets, follow this quality workflow to ensure consistent code quality and proper tracking.

## Required Workflow

1. **Start work**: Call `mcp__brain-dump__workflow` with `action: "start-work"` and `ticketId` when beginning a ticket
2. **Create session**: Call `mcp__brain-dump__session` with `action: "create"` and `ticketId` to enable state tracking
3. **Update state**: Use `mcp__brain-dump__session` with `action: "update-state"` and `sessionId`, `state` as you progress:
   - `analyzing` - Reading and understanding requirements
   - `implementing` - Writing or modifying code
   - `testing` - Running tests
   - `committing` - Creating git commits
   - `reviewing` - Final self-review
4. **Implement changes**: Write code, following patterns in CLAUDE.md
5. **Validate**: Run `pnpm check` (type-check, lint, test)
6. **Complete**: Call `mcp__brain-dump__workflow` with `action: "complete-work"`, `ticketId`, and `summary`

## Status Flow

```
ready → in_progress → ai_review → human_review → done
```

- **in_progress**: Active development
- **ai_review**: Automated quality review by code review agents
- **human_review**: Demo approval by human reviewer
- **done**: Complete and approved

## AI Review Phase

After implementation, run the review pipeline:

1. Call `mcp__brain-dump__review` with `action: "submit-finding"` for each issue found
2. Fix critical/major issues
3. Call `mcp__brain-dump__review` with `action: "mark-fixed"` for each fix
4. Call `mcp__brain-dump__review` with `action: "check-complete"` to verify all issues resolved

## Demo Generation

When AI review passes:

1. Call `mcp__brain-dump__review` with `action: "generate-demo"`, `ticketId`, and `steps: [...]`
2. Ticket moves to `human_review`
3. **STOP** - Wait for human approval

## MCP Tools

All Brain Dump MCP tools use the `mcp__brain-dump__` prefix with an `action` parameter:

- `workflow` (action: `start-work`) - Begin work on a ticket
- `workflow` (action: `complete-work`) - Complete implementation
- `session` (action: `create`) - Create state tracking session
- `session` (action: `update-state`) - Update work state
- `review` (action: `submit-finding`) - Report review issues
- `review` (action: `mark-fixed`) - Mark issue as resolved
- `review` (action: `generate-demo`) - Create demo steps
- `comment` (action: `add`) - Add work notes

## Quality Gates

Before marking a ticket complete:

- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] All acceptance criteria met
- [ ] Work summary added

## Important Notes

- Never auto-approve tickets - human review is required
- All tool usage is captured in telemetry for audit trails
- Follow the patterns in CLAUDE.md for database queries, React components, etc.
