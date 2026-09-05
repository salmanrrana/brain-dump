---
name: ralph-workflow
description: Autonomous backlog processing workflow for Brain Dump using the Universal Quality Workflow. Use when working through multiple tickets autonomously or when asked to process a backlog like Ralph.
---

# Ralph Workflow Skill

This skill provides the autonomous backlog processing workflow used by Ralph, following the Universal Quality Workflow for consistent code quality.

## When to Use This Skill

- Processing multiple tickets autonomously
- Working through a product backlog
- Implementing features from a PRD file
- Running in background agent mode

<!-- BEGIN GENERATED: workflow-sequence -->

## Generated Workflow

Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`

### Step 1: Implementation

start-work -> create or reuse a session -> implement -> validate -> commit -> complete-work. Skip this phase only when the selected ticket is already in ai_review.

- `workflow({ action: "start-work", ticketId })`
- `session({ action: "create", ticketId }) or session({ action: "get", ticketId })`
- `comment({ action: "add", ticketId, content, commentType: "test_report" })`
- `workflow({ action: "complete-work", ticketId, summary })`

### Step 2: AI Review

Start with get-review-context: it returns the acceptance criteria, work history, the exact in-scope changed-file list, prior findings (never re-file resolved ones), and the blocking-findings budget. Review only the in-scope files for regressions, acceptance gaps, and maintainability (reuse existing patterns; keep junior-readable). Submit only concrete NEW blocking findings, fix critical/major findings, then check completion.

- `review({ action: "get-review-context", ticketId })`
- `review({ action: "submit-finding", ticketId, agent, severity, category, description })`
- `review({ action: "mark-fixed", findingId, fixStatus: "fixed" })`
- `review({ action: "check-complete", ticketId })`

### Step 3: Demo

Generate 3-7 test steps after review completion, including criterion coverage references plus automation specs for visual/automated UI, API, command, or file checks. Before API/UI steps, inspect the target project's docs and build/runtime config and declare app.start as spawn-safe argv (with {port}/{host} tokens and optional project-relative cwd); never assume npm or pnpm. Every acceptance criterion must be proven by executable automation — coverageRationale is rejected at generate-demo. If a required command is outside the default allowlist (make, go, npx, ...), declare its exact argv in the project's .brain-dump/verify.json commands array; if a criterion cannot be automated, reword the criterion to match what automation can prove. This moves the ticket to ai_verification for runner certification.

- `review({ action: "generate-demo", ticketId, steps }) with covers references and automation specs on visual/automated steps`

### Step 4: Stop

STOP after generate-demo. generate-demo already completed the ticket's active sessions during the verification handoff — an explicit session complete afterwards is unnecessary (though harmless if called: it returns the recorded completion). Never run verification or move the ticket to done yourself.



### Implementation Discipline

- Before editing, map each acceptance criterion to the existing production entry point and nearby tests. Search for components, helpers, services, and patterns that already own the behavior.
- Extend or reuse the established implementation instead of adding a parallel path. New shared logic must be wired through the real production caller; replace superseded ticket-owned logic rather than leaving two competing implementations.
- Keep the diff minimal and match the codebase's existing style. Prefer explicit code a junior engineer can trace; use the smallest local or established abstraction that removes concrete duplication, never a speculative framework or dependency.
- Preserve existing behavior outside the ticket and add focused regression coverage at the changed boundary. Before handoff, inspect the final diff for dead code, duplicate logic, and acceptance criteria implemented only in tests but not reachable in production.

### Validation Gates

- Before complete-work: Discover and run this project's validation commands from docs/config.
- Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.
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

### Hard Guards

- Do not use local substitutes for Brain Dump MCP/CLI workflow actions.
- Do not skip review check-complete before generate-demo.
- Do not run verification yourself.
- Do not move tickets to done yourself.
- Do not continue to another ticket after demo handoff.

<!-- END GENERATED: workflow-sequence -->

## PRD File Format

```json
{
  "projectName": "My Project",
  "projectPath": "/path/to/project",
  "epicTitle": "Feature Name",
  "userStories": [
    {
      "id": "ticket-id",
      "title": "Task title",
      "description": "What to build",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "priority": "high",
      "tags": ["frontend"],
      "passes": false
    }
  ],
  "generatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Progress File Format

```markdown
# Ralph Progress Log

# Use this to leave notes for the next iteration

## Iteration 1 - 2024-01-01 10:00

- Completed: Add login form
- Changes: Created LoginForm.tsx, added validation
- Review: 2 findings (1 major, 1 minor) - all fixed
- Notes: Auth API returns different error format than expected

## Iteration 2 - 2024-01-01 10:30

- Completed: Add auth API integration
- Changes: Updated auth.ts, added error handling
- Review: 1 finding (suggestion) - applied
- Notes: All tests passing
```

## Important Rules

1. **One task per iteration** - Keeps context focused
2. **Always validate** - Run project-specific validation before completing
3. **Use workflow "complete-work"** - Never directly set status to "done"
4. **Run all review agents** - Fix critical/major before demo
5. **Stop at ai_verification** - Wait for runner certification
6. **Document issues** - Add blockers to progress.txt
7. **Never commit to main/dev** - Always use feature branches
