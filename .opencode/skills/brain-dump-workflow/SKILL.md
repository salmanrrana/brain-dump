# Brain Dump Workflow Skill

This skill provides guidance for working with Brain Dump tickets in OpenCode.

## When to Activate

This skill should be activated when:

- User asks to work on a ticket or task
- User mentions "Brain Dump", "ticket", or "task"
- User asks about workflow states or status
- Working in a project with Brain Dump configured

## Workflow Overview

Brain Dump uses a structured workflow with the following states:

```
backlog → ready → in_progress → ai_review → human_review → done
```

## Starting Work

Before implementing any feature:

```
Call: mcp__brain-dump__start_ticket_work({ ticketId: "<ticket-id>" })
```

This will:

- Create a git branch for the ticket
- Set the ticket to `in_progress` status
- Start a telemetry session automatically (via plugin)
- Link commits to the ticket

## Implementation Phase

During implementation:

1. **Write a micro-plan** using the built-in task tracking
2. **Make atomic commits** with format: `feat(<ticket-id>): <description>`
3. **Run validation** before completing: `pnpm type-check && pnpm lint && pnpm test`

## Completing Work

When implementation is done:

```
Call: mcp__brain-dump__complete_ticket_work({
  ticketId: "<ticket-id>",
  summary: "What was implemented"
})
```

This moves the ticket to `ai_review` status.

## AI Review Phase

After completing work, the ticket enters AI review. Review agents will:

1. Run code quality checks
2. Submit findings via `submit_review_finding`
3. You fix critical/major issues
4. Mark findings as fixed with `mark_finding_fixed`

## Human Review Phase

After AI review passes:

1. Generate demo script with `generate_demo_script`
2. Human reviewer runs the demo
3. They approve or request changes via `submit_demo_feedback`

## Key MCP Tools

### Ticket Management

- `start_ticket_work` - Begin working on a ticket
- `complete_ticket_work` - Finish implementation
- `list_tickets` - See available work
- `get_tickets_for_file` - Find related tickets

### Review & Quality

- `submit_review_finding` - Post a code review finding
- `mark_finding_fixed` - Mark an issue resolved
- `check_review_complete` - Check if all critical issues fixed
- `get_review_findings` - View current findings

### Demo & Approval

- `generate_demo_script` - Create manual test steps
- `get_demo_script` - Retrieve existing demo
- `submit_demo_feedback` - Record approval/rejection

### Telemetry

- `start_telemetry_session` - Begin tracking (auto via plugin)
- `log_tool_event` - Record tool usage (auto via plugin)
- `end_telemetry_session` - End tracking (auto via plugin)

## Code Quality Standards

Before completing work, ensure:

### Type Safety

- `pnpm type-check` passes
- No `any` types without justification
- All functions have explicit return types

### Testing

- Unit tests for new functions
- Tests verify user-facing behavior
- `pnpm test` passes

### Code Style

- `pnpm lint` passes
- Comments explain "why" not "what"
- No dead code or commented-out blocks

## Common Patterns

### Feature Implementation

1. `start_ticket_work({ ticketId })`
2. Write micro-plan
3. Implement feature
4. Add tests
5. Run `pnpm check`
6. `complete_ticket_work({ ticketId, summary })`

### Bug Fix

Same as feature, but commit message uses `fix(<id>):` format

### Refactor

1. Create ticket
2. Make changes (no behavior changes)
3. Tests must pass (no new coverage needed)
4. Commit: `refactor(<id>): What changed`

## Troubleshooting

### "Ticket not found"

- Check ticket ID spelling
- Use `list_tickets` to see available work
- Verify you're in the correct project

### "Cannot proceed - open critical findings"

- Run `get_review_findings({ ticketId })`
- Fix each critical/major finding
- Call `mark_finding_fixed` for each
- Only then can you generate demo

### "Telemetry not recording"

- Plugin activates on `session.created`
- Check OpenCode plugins directory
- Verify MCP server is configured

## References

- Workflow Spec: `plans/specs/universal-quality-workflow.md`
- MCP Tools: `mcp-server/tools/`
- Plugin: `.opencode/plugins/brain-dump-telemetry.ts`
- Workflow Rules: `.opencode/AGENTS.md`
