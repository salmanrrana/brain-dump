---
description: "Brain Dump quality workflow enforcement for AI-assisted development"
alwaysApply: true
---

# Brain Dump Workflow

When working on Brain Dump tickets, follow this quality workflow to ensure consistent code quality and proper tracking.

<!-- BEGIN GENERATED: workflow-sequence -->

## Generated Workflow

Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`

- **Implementation**: start-work -> create or reuse a session -> implement -> validate -> commit -> complete-work. Skip this phase only when the selected ticket is already in ai_review.
- **AI Review**: Self-review the diff, submit every finding through Brain Dump, fix critical/major findings, then check completion.
- **Demo**: Generate 3-7 test steps after review completion, including criterion coverage references plus automation specs for visual/automated UI, API, command, or file checks. This moves the ticket to ai_verification for runner certification.
- **Stop**: Complete the Ralph session and stop. Never run verification or move the ticket to done yourself.

## Required MCP Actions

- `workflow({ action: "start-work", ticketId })`
- `session({ action: "create", ticketId }) or session({ action: "get", ticketId })`
- `comment({ action: "add", ticketId, content, commentType: "test_report" })`
- `workflow({ action: "complete-work", ticketId, summary })`
- `review({ action: "get-findings", ticketId })`
- `review({ action: "submit-finding", ticketId, agent, severity, category, description })`
- `review({ action: "mark-fixed", findingId, fixStatus: "fixed" })`
- `review({ action: "check-complete", ticketId })`
- `review({ action: "generate-demo", ticketId, steps }) with covers references and automation specs on visual/automated steps`
- `session({ action: "complete", sessionId, outcome: "success" })`

## Quality Gates

- [ ] Before complete-work: Discover and run this project's validation commands from docs/config.
- [ ] Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- [ ] Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- [ ] If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- [ ] Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- [ ] Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.
- [ ] Before session completion, generate-demo must have been called and the ticket must be in ai_verification.

## Stop Conditions

- Do not use local substitutes for Brain Dump MCP/CLI workflow actions.
- Do not skip review check-complete before generate-demo.
- Do not run verification yourself.
- Do not move tickets to done yourself.
- Do not continue to another ticket after demo handoff.

<!-- END GENERATED: workflow-sequence -->

Follow the patterns in CLAUDE.md for database queries, React components, and project conventions.
