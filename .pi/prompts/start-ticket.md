---
description: Start a Brain Dump ticket through the CLI and load full context
argument-hint: "<ticket-id>"
---

Use the `brain-dump` CLI only. Do not use MCP.

<!-- BEGIN GENERATED: workflow-sequence -->
## Generated Workflow Guardrails

- Use the `brain-dump` CLI only. Do not use MCP.
- Status flow: `backlog -> ready -> in_progress -> ai_review -> human_review -> done`.
- Run project validation discovered from docs/config before `workflow complete-work`.
- Use `brain-dump review check-complete --ticket <ticket-id> --pretty` before generating demo steps.
- Stop after `brain-dump review generate-demo`; do not approve or move tickets to done.
<!-- END GENERATED: workflow-sequence -->

1. Run `brain-dump workflow start-work --ticket $1 --pretty`.
2. Run `brain-dump context --ticket $1 --pretty`.
3. Summarize the ticket scope, acceptance criteria, and likely files to inspect.
4. Begin implementation using pi's built-in tools.
