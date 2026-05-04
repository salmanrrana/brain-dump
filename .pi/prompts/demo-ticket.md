---
description: Generate Brain Dump demo steps for human review using the CLI
argument-hint: "<ticket-id>"
---

Use the `brain-dump` CLI only. Do not use MCP.

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
