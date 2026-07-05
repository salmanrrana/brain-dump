---
description: Review a Brain Dump ticket with CLI commands and log findings
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

1. Inspect the changes for ticket $1.
2. Run validation commands.
3. If issues are found, log them with `brain-dump review submit-finding` using appropriate severity, category, file, and line data.
4. After fixes, mark them with `brain-dump review mark-fixed`.
5. Run `brain-dump review check-complete --ticket $1 --pretty`.
6. If review is complete, prepare demo steps JSON and run `brain-dump review generate-demo --ticket $1 --steps-file <path> --pretty`.
