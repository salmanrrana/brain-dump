---
description: "Brain Dump quality workflow enforcement for AI-assisted development"
alwaysApply: true
---

# Brain Dump Workflow

When working on Brain Dump tickets, follow this quality workflow to ensure consistent code quality and proper tracking.

## Required Workflow

1. **Start work**: Call `mcp__brain-dump__start_ticket_work({ ticketId })` when beginning a ticket
2. **Create session**: Call `mcp__brain-dump__create_ralph_session({ ticketId })` to enable state tracking
3. **Update state**: Use `mcp__brain-dump__update_session_state({ sessionId, state })` as you progress:
   - `analyzing` - Reading and understanding requirements
   - `implementing` - Writing or modifying code
   - `testing` - Running tests
   - `committing` - Creating git commits
   - `reviewing` - Final self-review
4. **Implement changes**: Write code, following patterns in CLAUDE.md
5. **Validate**: Run `pnpm check` (type-check, lint, test)
6. **Complete**: Call `mcp__brain-dump__complete_ticket_work({ ticketId, summary })`

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

1. Call `mcp__brain-dump__submit_review_finding()` for each issue found
2. Fix critical/major issues
3. Call `mcp__brain-dump__mark_finding_fixed()` for each fix
4. Call `mcp__brain-dump__check_review_complete()` to verify all issues resolved

## Demo Generation

When AI review passes:

1. Call `mcp__brain-dump__generate_demo_script({ ticketId, steps: [...] })`
2. Ticket moves to `human_review`
3. **STOP** - Wait for human approval

## MCP Tools

All Brain Dump MCP tools use the `mcp__brain-dump__` prefix:

- `start_ticket_work` - Begin work on a ticket
- `complete_ticket_work` - Complete implementation
- `create_ralph_session` - Create state tracking session
- `update_session_state` - Update work state
- `submit_review_finding` - Report review issues
- `mark_finding_fixed` - Mark issue as resolved
- `generate_demo_script` - Create demo steps
- `add_ticket_comment` - Add work notes

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
