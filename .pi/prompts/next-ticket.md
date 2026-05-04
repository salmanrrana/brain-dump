---
description: Recommend the best next Brain Dump ticket using CLI status and ticket data
---

Use the `brain-dump` CLI only. Do not use MCP.

1. Run `brain-dump doctor`.
2. Run `brain-dump status --pretty`.
3. Run `brain-dump ticket list --pretty`.
4. Recommend the best next 3 tickets based on readiness, priority, dependencies, and likely unblock value.
5. Explain the preferred choice briefly.
6. If the user clearly wants you to begin, run `brain-dump workflow start-work --ticket <chosen-id> --pretty` and then `brain-dump context --ticket <chosen-id> --pretty`.
