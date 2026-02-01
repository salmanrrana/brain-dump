# Brain Dump - OpenCode Integration

## BEFORE Starting Any Ticket

Load the `brain-dump-workflow` skill. It contains the mandatory 5-step quality
workflow with exact MCP tool calls for each step.

## Essential Tools (in order)

1. `start_ticket_work` -- creates branch, starts tracking
2. `complete_ticket_work` -- moves to review phase
3. `submit_review_finding` -- logs review issues
4. `check_review_complete` -- verifies review done
5. `generate_demo_script` -- creates human test steps

## Quality Gates

Run before completing: `pnpm type-check && pnpm lint && pnpm test`

## Rules

- NEVER skip steps in the workflow
- NEVER set ticket to "done" (only humans approve via `submit_demo_feedback`)
- STOP after generating demo script
- Always commit with format: `feat(<ticket-id>): <description>`

## Self-Review Checklist

When performing AI review (Step 4), check:

- Code follows CLAUDE.md project patterns
- No `any` types, all parameters typed
- All errors handled (no empty catch blocks)
- Tests verify user-facing behavior
- No dead code or commented-out lines

For the full checklist, see `skills/brain-dump-workflow/reference/review-guide.md`.

## Troubleshooting

For common errors like "STATE ENFORCEMENT" blocks, "Cannot proceed - open critical findings",
or "Ticket must be in ai_review", see `skills/brain-dump-workflow/reference/troubleshooting.md`.
