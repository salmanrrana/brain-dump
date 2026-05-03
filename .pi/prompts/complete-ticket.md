---
description: Complete a Brain Dump ticket through the CLI after implementation and checks
argument-hint: "<ticket-id> [summary]"
---

Use the `brain-dump` CLI only. Do not use MCP.

1. Verify implementation status from the current diff and recent changes.
2. Run relevant validation commands.
3. Run:

```bash
brain-dump workflow complete-work --ticket $1 --summary "${@:2}" --pretty
```

4. Report the resulting state and the next review steps.
