---
description: Complete a Brain Dump ticket through the CLI after implementation and checks
argument-hint: "<ticket-id> [summary]"
---

Use the `brain-dump` CLI only. Do not use MCP.

<!-- BEGIN GENERATED: workflow-sequence -->

## Generated Workflow Guardrails

- Use the `brain-dump` CLI only. Do not use MCP.
- Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`.
- Before editing, map each acceptance criterion to the existing production entry point and nearby tests. Search for components, helpers, services, and patterns that already own the behavior.
- Extend or reuse the established implementation instead of adding a parallel path. New shared logic must be wired through the real production caller; replace superseded ticket-owned logic rather than leaving two competing implementations.
- Keep the diff minimal and match the codebase's existing style. Prefer explicit code a junior engineer can trace; use the smallest local or established abstraction that removes concrete duplication, never a speculative framework or dependency.
- Preserve existing behavior outside the ticket and add focused regression coverage at the changed boundary. Before handoff, inspect the final diff for dead code, duplicate logic, and acceptance criteria implemented only in tests but not reachable in production.
- Run project validation discovered from docs/config before `workflow complete-work`.
- Record validation with `brain-dump comment add --ticket <ticket-id> --type test_report --content "<commands and results>" --pretty` before `workflow complete-work`; stop if the comment command fails.
- Use `brain-dump review check-complete --ticket <ticket-id> --pretty` before generating demo steps.
- Demo steps must be visual/automated with executable automation specs; manual steps and `coverageRationale` are rejected, every acceptance criterion needs a `covers` reference, and UI/API steps need `app.start` argv with `{port}`/`{host}` tokens from the project's own docs/config.
- Stop after `brain-dump review generate-demo` (sessions are completed automatically); do not approve or move tickets to done.

<!-- END GENERATED: workflow-sequence -->

1. Verify implementation status from the current diff and recent changes.
2. Run relevant validation commands.
3. Run:

```bash
brain-dump workflow complete-work --ticket $1 --summary "${@:2}" --pretty
```

4. Report the resulting state and the next review steps.
