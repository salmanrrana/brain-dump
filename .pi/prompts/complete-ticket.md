---
description: Complete a Brain Dump ticket through the CLI after implementation and checks
argument-hint: "<ticket-id> [summary]"
---

Use the `brain-dump` CLI only. Do not use MCP.

<!-- BEGIN GENERATED: workflow-sequence -->
## Generated Workflow Guardrails

- Use the `brain-dump` CLI only. Do not use MCP.
- Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`.
- Run project validation discovered from docs/config before `workflow complete-work`.
- Record validation with `brain-dump comment add --ticket <ticket-id> --type test_report --content "<commands and results>" --pretty` before `workflow complete-work`; stop if the comment command fails.
- Use `brain-dump review check-complete --ticket <ticket-id> --pretty` before generating demo steps.
- Stop after `brain-dump review generate-demo`; do not approve or move tickets to done.
<!-- END GENERATED: workflow-sequence -->

1. Verify implementation status from the current diff and recent changes.
2. Run relevant validation commands.
3. Run:

```bash
brain-dump workflow complete-work --ticket $1 --summary "${@:2}" --pretty
```

4. Report the resulting state and the next review steps.
