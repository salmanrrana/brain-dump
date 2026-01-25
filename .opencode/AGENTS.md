# Brain Dump Workflow - OpenCode Integration

This document guides AI agents working with Brain Dump projects in OpenCode.

## Quick Start

Before implementing any feature or starting work on a task:

```
Call: mcp__brain-dump__start_ticket_work({ ticketId: "..." })
```

After completing work:

```
Call: mcp__brain-dump__complete_ticket_work({
  ticketId: "...",
  summary: "What was implemented"
})
```

## Workflow State Machine

The Brain Dump workflow follows these states:

```
backlog → ready → in_progress → ai_review → human_review → done
```

### State Responsibilities

**in_progress:** Implementation phase

- Write code
- Run tests locally
- Commit changes
- Do NOT start human review

**ai_review:** AI review phase (automatic)

- Review agents analyze code
- Submit findings via MCP
- Fix critical/major issues
- Test fixes locally

**human_review:** Awaiting human approval

- Demo script generated
- Human reviewer verifies behavior
- Either approve to move to done, or reject to restart fixes

**done:** Complete

- All acceptance criteria met
- Human has approved
- Can extract learnings for documentation

## Available MCP Tools

All tools are automatically available through the Brain Dump MCP server:

### Ticket Management

- `start_ticket_work` - Begin working on a ticket
- `complete_ticket_work` - Mark ticket ready for review
- `list_tickets` - See available work
- `get_tickets_for_file` - Find tickets related to a file

### Review & Quality

- `submit_review_finding` - Post a code review finding
- `mark_finding_fixed` - Mark a finding as resolved
- `get_review_findings` - Get review findings for a ticket
- `check_review_complete` - Verify all critical issues are fixed

### Demo & Approval

- `generate_demo_script` - Create human review demo
- `get_demo_script` - Retrieve demo for a ticket
- `update_demo_step` - Update step status during review
- `submit_demo_feedback` - Human reviewer approval/rejection

### Telemetry

- `start_telemetry_session` - Begin tracking session
- `log_tool_event` - Record tool usage
- `log_prompt_event` - Record user prompts
- `end_telemetry_session` - Finalize session

### Project Management

- `list_projects` - See your projects
- `list_tickets` - See available tickets in project
- `create_ticket` - Create a new ticket
- `list_epics` - See project epics

## Best Practices

### 1. Start Work Properly

Always call `start_ticket_work` before implementation:

```
This creates a git branch and sets up tracking
Enables automatic telemetry capture (via plugin)
Links commits to the ticket
```

### 2. Commit Frequently

Create meaningful commits with the ticket ID:

```
git commit -m "feat(abc-123): Implement user authentication"
Commits are automatically linked to the ticket
```

### 3. Run Tests Before Completing

Always verify:

```
pnpm type-check    # TypeScript
pnpm lint          # Code style
pnpm test          # Unit tests
```

### 4. Complete Work Explicitly

Call `complete_ticket_work` when done:

```
This moves ticket to ai_review status
Triggers automatic AI review via agents
```

### 5. Fix Review Findings

For critical/major findings:

```
1. Read the finding description
2. Make fixes in code
3. Commit with `feat(ticket-id): Fix <issue>`
4. Test fixes: pnpm test
5. Mark finding as fixed: mark_finding_fixed(findingId)
```

### 6. Generate Demo When Ready

After all critical/major issues are fixed:

```
1. Analyze what needs human verification
2. Create demo steps covering:
   - Setup/prerequisites
   - Core functionality
   - Edge cases
   - Visual confirmation points
3. Call generate_demo_script with steps
4. Human reviewer will run demo
```

### 7. Learn from Completed Work

When ticket reaches 'done':

```
Extract learnings and update project docs
Call: reconcile_learnings({ ticketId, learnings })
```

## Code Quality Standards

Minimum requirements before completing work:

### Type Safety

- [ ] TypeScript: `pnpm type-check` passes
- [ ] No `any` types unless justified
- [ ] All function parameters typed
- [ ] All return types explicit

### Testing

- [ ] Unit tests for new functions
- [ ] Integration tests for workflows
- [ ] Tests verify user-facing behavior (not internals)
- [ ] `pnpm test` passes fully

### Code Style

- [ ] ESLint: `pnpm lint` passes
- [ ] No console.log in production code
- [ ] Comments explain "why" not "what"
- [ ] No dead code or commented-out lines

### Database (if schema changes)

- [ ] Migration file created: `pnpm db:generate`
- [ ] Migration runs: `pnpm db:migrate`
- [ ] Backup tested: `pnpm brain-dump backup` + restore

## Common Patterns

### Pattern: Feature Implementation

1. Start ticket: `start_ticket_work(ticketId)`
2. Implement feature in code
3. Add tests
4. Run: `pnpm type-check && pnpm lint && pnpm test`
5. Commit: `git commit -m "feat(id): Feature name"`
6. Complete: `complete_ticket_work(ticketId, summary)`
7. Fix review findings
8. Generate demo
9. Wait for human approval

### Pattern: Bug Fix

Same as feature, but commit message is `fix(id):` instead of `feat(id):`

### Pattern: Refactor

1. Create ticket for refactoring work
2. Make changes (no behavior changes)
3. Commit: `refactor(id): What changed`
4. Tests must all pass (no new test coverage needed for pure refactors)
5. Complete work

### Pattern: Documentation

1. Changes are NOT code changes
2. You may skip test execution
3. Commit: `docs(id): What was documented`

## Environment Variables

If using OpenCode plugin telemetry:

```bash
# Optional: Set project path if not auto-detected
CURSOR_PROJECT_DIR=/path/to/project

# Optional: Disable telemetry
BRAIN_DUMP_TELEMETRY_ENABLED=false
```

## Troubleshooting

### "Ticket not found"

- Use `list_tickets` to see available tickets
- Check ticket ID is spelled correctly
- Verify you're in the correct project

### "Cannot proceed - open critical findings"

- Review findings: `get_review_findings(ticketId, severity: 'critical')`
- Fix code for each finding
- Mark fixed: `mark_finding_fixed(findingId)`
- Only after all critical/major are fixed can you generate demo

### "Telemetry session not active"

- If using hooks: check hooks are installed
- If using plugin: plugin is running automatically
- Call `start_telemetry_session` manually if needed

## References

- **Spec**: `plans/specs/universal-quality-workflow.md`
- **MCP Tools**: `mcp-server/tools/`
- **Project CLAUDE.md**: Contains project-specific guidelines

## Questions?

Refer to the Brain Dump documentation at the project root:

- `CLAUDE.md` - Development guidelines
- `README.md` - Project overview
- `docs/` - Detailed documentation
