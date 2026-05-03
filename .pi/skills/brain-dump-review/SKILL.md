---
name: brain-dump-review
description: Review Brain Dump ticket work using CLI commands only. Use when implementation is finished and findings, fixes, and demo generation need to be tracked without MCP.
---

# Brain Dump Review

Use this skill after code changes are implemented and validation has run.

## Review process

### 1) Inspect changes

```bash
git diff --stat
git diff
brain-dump context --ticket <ticket-id> --pretty
```

### 2) Run validation

```bash
pnpm type-check
pnpm lint
pnpm test
```

If the repo uses a combined command, use that.

### 3) Submit findings through Brain Dump CLI

For each issue found:

```bash
brain-dump review submit-finding \
  --ticket <ticket-id> \
  --agent <code-reviewer|silent-failure-hunter|code-simplifier> \
  --severity <critical|major|minor|suggestion> \
  --category <category> \
  --description "<issue description>" \
  [--file <path>] \
  [--line <line>] \
  [--fix "<suggested fix>"] \
  --pretty
```

Capture the returned `findingId`.

### 4) Fix and mark fixed

After fixing an issue:

```bash
brain-dump review mark-fixed --finding <finding-id> --status fixed --description "<how it was fixed>" --pretty
```

### 5) Check whether review is complete

```bash
brain-dump review check-complete --ticket <ticket-id> --pretty
```

Proceed only when critical and major findings are resolved.

### 6) Generate demo steps

Write a JSON steps file, then run:

```bash
brain-dump review generate-demo --ticket <ticket-id> --steps-file <path-to-json> --pretty
```

## Severity guide

- `critical`: broken feature, crash, data loss, or severe security risk
- `major`: incorrect behavior, missing validation, serious error handling issue
- `minor`: maintainability or clarity issue without user-facing breakage
- `suggestion`: optional improvement

## Agent mapping

Use these agent names consistently:

- `code-reviewer`
- `silent-failure-hunter`
- `code-simplifier`

## Goal

Track review work in Brain Dump using CLI commands only, then hand off to human review.
