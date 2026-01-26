# Brain Dump Workflow Integration

When working on tickets in this project, follow the Brain Dump workflow:

## Starting Work

1. Call `mcp__brain-dump__start_ticket_work({ ticketId })` before writing code
2. This creates a branch and sets up tracking
3. Use `mcp__brain-dump__create_ralph_session({ ticketId })` to enable progress tracking

## During Development

- Commit frequently with `feat(<ticket-id>): <description>` format
- Call `mcp__brain-dump__link_commit_to_ticket({ ticketId, commitHash })` after commits
- Update session state as you transition between phases: `analyzing` → `implementing` → `testing` → `committing` → `reviewing`

## Completing Work

1. Call `mcp__brain-dump__complete_ticket_work({ ticketId, summary })`
2. This triggers AI review and moves ticket to ai_review status
3. Run review agents: `/review-ticket`
4. Fix any critical/major findings before proceeding
5. Generate demo script: `/demo` (moves ticket to human_review)

## Human Review

- AI will generate a demo script
- Wait for human approval before marking done
- Use `submit_demo_feedback` to provide approval/rejection

## Key MCP Tools

- `start_ticket_work` - Begin work on a ticket
- `complete_ticket_work` - Mark work complete (triggers AI review)
- `start_telemetry_session` - Enable telemetry capture
- `end_telemetry_session` - Finalize telemetry
- `submit_review_finding` - Submit code review findings
- `mark_finding_fixed` - Mark findings as fixed
- `generate_demo_script` - Create demo for human review
- `submit_demo_feedback` - Approve or reject demo
- `reconcile_learnings` - Extract learnings to update docs

## Telemetry

All tool calls are automatically captured and stored in the database for observability. Query telemetry from ticket detail view.

## Troubleshooting

Run `brain-dump doctor` to verify configuration:

```bash
pnpm brain-dump doctor
```

This will check:

- MCP server configuration
- Database connectivity
- Hooks and plugins in other environments
