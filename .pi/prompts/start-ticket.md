---
description: Start a Brain Dump ticket through the CLI and load full context
argument-hint: "<ticket-id>"
---

Use the `brain-dump` CLI only. Do not use MCP.

1. Run `brain-dump workflow start-work --ticket $1 --pretty`.
2. Run `brain-dump context --ticket $1 --pretty`.
3. Summarize the ticket scope, acceptance criteria, and likely files to inspect.
4. Begin implementation using pi's built-in tools.
