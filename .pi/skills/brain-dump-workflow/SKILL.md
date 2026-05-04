---
name: brain-dump-workflow
description: Use Brain Dump entirely through the brain-dump CLI. Start ticket work, implement changes, run validation, complete work, review findings, and generate a demo without MCP.
---

# Brain Dump Workflow

Use the `brain-dump` CLI directly. Do not rely on MCP. Prefer CLI commands plus pi's built-in `bash`, `read`, `edit`, and `write` tools.

## Core rule

When working on a Brain Dump ticket, follow this sequence:

1. Inspect project/ticket context
2. Start work with the CLI
3. Implement and verify
4. Complete work with a summary
5. Review and log findings with the CLI
6. Generate demo steps for human review

## 1) Inspect context

Use these commands first:

```bash
brain-dump doctor
brain-dump status --pretty
brain-dump ticket list --pretty
brain-dump context --ticket <ticket-id> --pretty
```

If `brain-dump` is not in PATH, use:

```bash
pnpm brain-dump <command>
```

## 2) Start work

Before changing code, run:

```bash
brain-dump workflow start-work --ticket <ticket-id> --pretty
```

This should create/check out the branch and move the ticket to `in_progress`.

## 3) Implement and verify

Use pi tools to inspect and edit files. Keep changes focused.

Run quality gates when appropriate:

```bash
pnpm type-check
pnpm lint
pnpm test
```

If the project uses a different command, use the repo's standard check command.

Good commit format:

```bash
git commit -m "feat(<ticket-id>): <description>"
```

You can also sync or link git work manually if needed:

```bash
brain-dump git sync --pretty
brain-dump git link-commit --ticket <ticket-id> --hash $(git rev-parse HEAD) --pretty
brain-dump git link-pr --ticket <ticket-id> --pr <number> --pretty
```

## 4) Complete implementation

After implementation and validation, run:

```bash
brain-dump workflow complete-work --ticket <ticket-id> --summary "<what changed>" --pretty
```

This should move the ticket to `ai_review`.

## 5) Review with CLI logging

Perform self-review by reading diffs and changed files.

Useful commands:

```bash
git diff --stat
git diff
brain-dump review check-complete --ticket <ticket-id> --pretty
```

If you find issues, log them explicitly:

```bash
brain-dump review submit-finding \
  --ticket <ticket-id> \
  --agent code-reviewer \
  --severity major \
  --category error-handling \
  --description "Describe the issue" \
  --file src/example.ts \
  --line 42 \
  --fix "Describe the intended fix" \
  --pretty
```

After fixing an issue, mark it:

```bash
brain-dump review mark-fixed --finding <finding-id> --status fixed --description "Fixed by ..." --pretty
```

Re-run checks until Brain Dump reports review is complete:

```bash
brain-dump review check-complete --ticket <ticket-id> --pretty
```

## 6) Generate demo for human review

Create a JSON file with 3-7 demo steps, for example at `.pi/tmp/demo-steps.json`:

```json
[
  {
    "order": 1,
    "description": "Open the updated screen",
    "expectedOutcome": "The page loads without errors",
    "type": "manual"
  }
]
```

Then run:

```bash
brain-dump review generate-demo --ticket <ticket-id> --steps-file .pi/tmp/demo-steps.json --pretty
```

At that point, stop and wait for human review.

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
