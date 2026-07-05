---
name: brain-dump-workflow
description: Use Brain Dump entirely through the brain-dump CLI. Start ticket work, implement changes, run validation, complete work, review findings, and generate a demo without MCP.
---

# Brain Dump Workflow

Use the `brain-dump` CLI directly. Do not rely on MCP. Prefer CLI commands plus pi's built-in `bash`, `read`, `edit`, and `write` tools.

<!-- BEGIN GENERATED: workflow-sequence -->
## Generated CLI Workflow

Status flow: `backlog -> ready -> in_progress -> ai_review -> human_review -> done`

1. Inspect context: `brain-dump context --ticket <ticket-id> --pretty`.
2. Start work: `brain-dump workflow start-work --ticket <ticket-id> --pretty`.
3. Implement focused changes and run project validation discovered from docs/config.
4. Record validation before completion: `brain-dump comment add --ticket <ticket-id> --type test_report --content "<commands and results>" --pretty`. Stop if this command fails.
5. Commit with `feat(<ticket-id>): <description>`.
6. Complete work only after the test_report exists: `brain-dump workflow complete-work --ticket <ticket-id> --summary "<summary>" --pretty`.
7. Review: use `brain-dump review submit-finding`, `brain-dump review mark-fixed`, and `brain-dump review check-complete --ticket <ticket-id> --pretty`.
8. Demo: `brain-dump review generate-demo --ticket <ticket-id> --steps-file <steps.json> --pretty`.
9. Stop after demo handoff. Do not approve or move the ticket to done.

### Validation Gates

- Before complete-work: Discover and run this project's validation commands from docs/config.
- Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- Before demo, all critical/major findings must be fixed and check-complete must allow human review.
- Before session completion, generate-demo must have been called and the ticket must be in human_review.
<!-- END GENERATED: workflow-sequence -->

## Useful CLI shortcuts

```bash
brain-dump status --pretty
brain-dump log --pretty
brain-dump ticket get --ticket <ticket-id> --pretty
brain-dump review get-demo --ticket <ticket-id> --pretty
```

## CLI parity notes

Most MCP-style operations have CLI parity, sometimes under a different resource name:

- workflow `link-commit` -> `brain-dump git link-commit`
- workflow `link-pr` -> `brain-dump git link-pr`
- workflow `sync-links` -> `brain-dump git sync`
- session task actions -> `brain-dump tasks save|get|clear|snapshots`
- project `find-by-path` -> `brain-dump project find`
- admin settings actions -> `brain-dump settings get|update`
- admin conversation logging actions -> `brain-dump compliance start|log|end|list|export|archive`

## Notes

- Prefer Brain Dump CLI over handwritten status tracking.
- Prefer `brain-dump context --ticket <ticket-id> --pretty` before implementation.
- If a command fails, read the error and recover through Brain Dump CLI rather than bypassing workflow state.
