---
description: Generate Brain Dump demo steps for human review using the CLI
argument-hint: "<ticket-id>"
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

1. Confirm review is complete with:

```bash
brain-dump review check-complete --ticket $1 --pretty
```

2. Create a JSON file with 3-7 demo steps in `.pi/tmp/demo-steps-$1.json`.
3. Run:

```bash
brain-dump review generate-demo --ticket $1 --steps-file .pi/tmp/demo-steps-$1.json --pretty
```

4. Summarize the generated demo and stop for human review.
