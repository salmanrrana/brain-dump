---
name: brain-dump-workflow
description: Use Brain Dump entirely through the brain-dump CLI. Start ticket work, implement changes, run validation, complete work, review findings, and generate a demo without MCP.
---

# Brain Dump Workflow

Use the `brain-dump` CLI directly. Do not rely on MCP. Prefer CLI commands plus pi's built-in `bash`, `read`, `edit`, and `write` tools.

<!-- BEGIN GENERATED: workflow-sequence -->

## Generated CLI Workflow

Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`

1. Inspect context: `brain-dump context --ticket <ticket-id> --pretty`.
2. Start work: `brain-dump workflow start-work --ticket <ticket-id> --pretty`.
3. Implement focused changes and run project validation discovered from docs/config.
4. Record validation before completion: `brain-dump comment add --ticket <ticket-id> --type test_report --content "<commands and results>" --pretty`. Stop if this command fails.
5. Commit with `feat(<ticket-id>): <description>`.
6. Complete work only after the test_report exists: `brain-dump workflow complete-work --ticket <ticket-id> --summary "<summary>" --pretty`.
7. Review: start with `brain-dump review get-review-context --ticket <ticket-id> --pretty` (criteria, in-scope files, prior findings, budgets), then use `brain-dump review submit-finding`, `brain-dump review mark-fixed`, and `brain-dump review check-complete --ticket <ticket-id> --pretty`.
8. Demo: `brain-dump review generate-demo --ticket <ticket-id> --steps-file <steps.json> --pretty` with 3-7 visual/automated steps. Manual steps are rejected; every acceptance criterion must be proven by executable UI, API, command, or file automation via `covers` references — `coverageRationale` is rejected. UI/API steps require `app.start` argv discovered from the project's own docs/config with `{port}`/`{host}` tokens.
9. Stop after demo handoff (sessions are completed automatically). Do not approve or move the ticket to done.

### Implementation Discipline

- Before editing, map each acceptance criterion to the existing production entry point and nearby tests. Search for components, helpers, services, and patterns that already own the behavior.
- Extend or reuse the established implementation instead of adding a parallel path. New shared logic must be wired through the real production caller; replace superseded ticket-owned logic rather than leaving two competing implementations.
- Keep the diff minimal and match the codebase's existing style. Prefer explicit code a junior engineer can trace; use the smallest local or established abstraction that removes concrete duplication, never a speculative framework or dependency.
- Preserve existing behavior outside the ticket and add focused regression coverage at the changed boundary. Before handoff, inspect the final diff for dead code, duplicate logic, and acceptance criteria implemented only in tests but not reachable in production.

### Validation Gates

- Before complete-work: Discover and run this project's validation commands from docs/config.
- Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- Discover validation and boot commands once per project checkout, then reuse them until the relevant docs, config, or dependencies change. During edits, run focused checks; run each required final validation command once after the last relevant change. Metadata-only updates (linking commits, marking findings fixed, posting progress) do not require repeating unchanged checks. After code/config changes, rerun affected checks and any mandatory project-wide gate; never present reused results as newly executed tests.
- If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.
- Fetch get-review-context once on entering AI review and reuse its ticket, acceptanceCriteria, workHistory, openFindings, resolvedFindings, and scope. Do not immediately fetch the same ticket or findings again. Refresh after an external change or if the context was lost; after your own finding updates, use their returned IDs/status and run check-complete once before handoff. A repair review examines the repair diff and its affected callers, not the whole unchanged epic.
- Keep the session ID returned by session create/get, and update progress at real phase transitions or meaningful changes. Batch independent reads or validation commands in one tool turn when safe, preserving each command's output and exit status; never run commands concurrently when they share mutable test fixtures or build output. A successful generate-demo response is the handoff: STOP instead of polling the ticket, session, findings, or verification status.
- For CLI finding repairs, use brain-dump review mark-fixed --finding <finding-id> --status fixed. Check the workflow command's exit status and read its full error response before continuing; piping into tail can hide a failed action.
- For API/UI demo steps, inspect README/AGENTS/CLAUDE docs plus native build files and declare one app.start argv that actually boots this project on {port}; do not infer every app is Node-based.
- Before authoring a demo, read the project's .brain-dump/verify.json (if present) and reuse its exact start command and declared commands; never hardcode a port or loopback origin — the runner boots on a random free port.
- The verifier requires a clean reviewed Git revision, including no untracked files. Put CLI --steps-file JSON outside the project (for example in a temporary directory), or commit intentional files before review. Check git status before generate-demo; authoring the demo must not dirty the reviewed checkout.
- Derive UI selectors from the actual rendered page or component markup. Do not guess aria-label attributes from visible labels. After a verification failure, repair its reported cause and rerun affected checks; avoid repeating unrelated checks unless the repair changes their behavior.
- For test commands, assert the exit status and stable results rather than an exact passing-test count that changes as the project grows. Derive UI counts from explicitly seeded fixtures or acceptance criteria, not a previous run's incidental data. A failed demo stops at its first failure; later steps are recorded as not run and must pass on the repaired run.
- In UI demo steps, waitFor a selector that only exists once real data has rendered (a populated row, not a static heading) before clicking or asserting; a mutation fired against a still-loading page settles every widget into an error state.
- Do not assert live third-party data (e.g. a fresh 'Last fetched' timestamp) unless the verification environment seeds it; assert the honest empty/error copy or an API-level contract instead.
- To prove a file was deleted, use a file step with a notExists assertion — never contains/notContains against a missing file; for grep-style command steps, set expectedExitCode to what the command actually returns.
- Before session completion, generate-demo must have been called and the ticket must be in ai_verification.
- If verification blocked the ticket and you have fixed and validated the cause, call review resolve-verification-failure (rootCause, classification, fixCommits, validation) to clear the blocker and return the ticket to ai_review. Then mark each open verification finding addressed by the fix as fixed before check-complete — never leave a fixed ticket blocked.

<!-- END GENERATED: workflow-sequence -->

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
