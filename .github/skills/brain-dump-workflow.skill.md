---
name: brain-dump-workflow
description: Manages ticket workflow for Brain Dump projects
applyTo: "**/*"
---

# Brain Dump Workflow Skill

When the user asks to start work on a ticket, work on a task, or implement a feature, follow this workflow:

<!-- BEGIN GENERATED: workflow-sequence -->

## Generated Workflow

Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`

### Step 1: Implementation

start-work -> create or reuse a session -> implement -> validate -> commit -> complete-work. Skip this phase only when the selected ticket is already in ai_review.

- `workflow({ action: "start-work", ticketId })`
- `session({ action: "create", ticketId }) or session({ action: "get", ticketId })`
- `comment({ action: "add", ticketId, content, commentType: "test_report" })`
- `workflow({ action: "complete-work", ticketId, summary })`

### Step 2: AI Review

Self-review the diff, submit every finding through Brain Dump, fix critical/major findings, then check completion.

- `review({ action: "get-findings", ticketId })`
- `review({ action: "submit-finding", ticketId, agent, severity, category, description })`
- `review({ action: "mark-fixed", findingId, fixStatus: "fixed" })`
- `review({ action: "check-complete", ticketId })`

### Step 3: Demo

Generate 3-7 test steps after review completion, including automation specs for visual/automated UI or API checks. This moves the ticket to ai_verification for runner certification.

- `review({ action: "generate-demo", ticketId, steps }) with automation specs on visual/automated steps`

### Step 4: Stop

Complete the Ralph session and stop. Never run verification or move the ticket to done yourself.

- `session({ action: "complete", sessionId, outcome: "success" })`

### Validation Gates

- Before complete-work: Discover and run this project's validation commands from docs/config.
- Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.
- Before session completion, generate-demo must have been called and the ticket must be in ai_verification.

### Hard Guards

- Do not use local substitutes for Brain Dump MCP/CLI workflow actions.
- Do not skip review check-complete before generate-demo.
- Do not run verification yourself.
- Do not move tickets to done yourself.
- Do not continue to another ticket after demo handoff.
<!-- END GENERATED: workflow-sequence -->

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
- Run project-specific validation frequently during development
- Don't skip code review - it catches real bugs
- Demo scripts should cover happy path + edge cases
