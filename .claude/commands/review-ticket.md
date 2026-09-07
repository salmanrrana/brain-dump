---
description: Run AI review agents on current ticket work and submit findings
---

# Review Ticket

Load the `brain-dump-workflow` skill for context on the full workflow.

You are running the AI review workflow for a ticket in `ai_review` status. This is part of the Universal Quality Workflow.

## Prerequisites

- Ticket must be in `ai_review` status (set by `workflow` tool `complete-work`)
- Implementation work must be complete
- Project-specific validation must pass. Discover commands from the target project's docs/config; do not assume pnpm, npm, TypeScript, lint, or test scripts exist.

## Steps

### Step 1: Verify Ticket Status

First, confirm the ticket is in `ai_review` status:

```
ticket tool, action: "list", projectId: "<project-id>", status: "ai_review"
```

Or get the active Ralph session which includes ticket state:

```
session tool, action: "get", ticketId: "<ticket-id>"
```

If the ticket is not in `ai_review`, call `workflow` tool `complete-work` first.

### Step 1a: Get the Review Packet

```
review tool, action: "get-review-context", ticketId: "<ticket-id>"
```

This returns the acceptance criteria, work history, the exact in-scope changed-file list (`scope.changedFiles`), prior findings (never re-file resolved ones), and the blocking-findings budget. Review only the in-scope files; verify each acceptance criterion against its actual implementation.

### Step 2: Run Review Agents in Parallel

Launch ALL review agents in PARALLEL using a single message with multiple Task tool calls:

```
Task 1: pr-review-toolkit:code-reviewer
- Review code against CLAUDE.md guidelines
- Check for bugs, style violations, pattern adherence

Task 2: pr-review-toolkit:silent-failure-hunter
- Check for silent failures and inadequate error handling
- Look for empty catch blocks, swallowed errors

Task 3: pr-review-toolkit:code-simplifier
- Analyze for simplification opportunities
- Look for duplicated code, unnecessary complexity
```

### Step 3: Submit Findings via MCP

For EVERY issue found, call the `review` tool with `action: "submit-finding"`:

```
review tool, action: "submit-finding",
  ticketId: "<ticket-id>",
  agent: "code-reviewer",
  severity: "major",  // critical, major, minor, suggestion
  category: "error-handling",
  description: "Missing input validation in API handler",
  filePath: "src/api/tickets.ts",
  lineNumber: 42,
  suggestedFix: "Add Zod schema validation"
```

Severity levels (strict — a critical/major must have a concrete reproduction or failing path):

- **critical**: Crash, data loss, security failure, or a core acceptance criterion demonstrably broken
- **major**: Reproducible incorrect user-visible behavior in scope
- **minor**: Nonblocking edge case, test gap, or maintainability concern
- **suggestion**: Nice-to-have enhancements

Anti-loop gates are enforced at submit time: at most 5 blocking (critical/major) findings may be open at once, and on repair rounds blocking findings must touch a file changed since the last verification handoff. A downgraded submission is recorded as minor with a `[severity gate]` note — accept the downgrade; do not re-submit re-worded.

### Step 4: Get Findings Summary

```
review tool, action: "get-findings", ticketId: "<ticket-id>"
```

### Step 5: Fix Critical and Major Issues

For each critical/major finding:

1. Make the fix
2. Run the narrowest relevant project-specific validation command, then the repo's authoritative validation gate if the fix changes shared behavior
3. Mark as fixed:
   ```
   review tool, action: "mark-fixed",
     findingId: "<finding-id>",
     fixStatus: "fixed",
     fixDescription: "Added Zod validation schema"
   ```
4. Commit: `git commit -m "fix(<ticket-id>): <description>"`

### Step 6: Verify Review Complete

```
review tool, action: "check-complete", ticketId: "<ticket-id>"
```

Must return `canProceedToVerification: true` before continuing.

### Step 7: Generate Demo Script

When all critical/major findings are fixed, follow the `/demo` command for the full format. Requirements: 3-7 steps, `visual`/`automated` only (manual steps are rejected), every acceptance criterion covered via `covers` references, executable `automation` specs (`ui`, `api`, `command`, or `file`), and for UI/API steps an `app.start` argv discovered from the project's own docs/config with `{port}`/`{host}` tokens — never a hardcoded port. Example step:

```
review tool, action: "generate-demo",
  ticketId: "<ticket-id>",
  steps: [
    {
      order: 1,
      description: "Ticket list renders",
      expectedOutcome: "The tickets route loads with the list visible",
      type: "visual",
      covers: ["criterion:1"],
      app: { "start": ["pnpm", "dev", "--port", "{port}"] },
      automation: {
        kind: "ui",
        route: "/tickets",
        assert: [{ type: "visible", selector: "[data-testid='ticket-list']" }],
        screenshot: true
      }
    }
  ]
```

### Step 8: STOP - Wait for Verification

After generating the demo script:

- Ticket moves to `ai_verification`; active sessions are completed automatically (do not call `session complete`)
- **DO NOT run verification** - wait for the verification runner to execute the demo and capture evidence
- The runner certifies completion or returns verification findings

## Important

- Blocking findings (critical/major) must each anchor to a changed line with a concrete reproduction — the batch is capped at 5 open at once, so prioritize the defects that matter
- Genuinely minor observations are welcome as `minor`/`suggestion` (they never block); do not inflate severity for audit-trail purposes
- If you conclude an open finding is hypothetical or wrong, close it with `mark-fixed`, `fixStatus: "wont_fix"` and say why
- Fix critical and major issues before generating demo
- Never skip straight to `done` - runner certification is required

## Status Flow

```
ai_review → [fix findings] → ai_verification → [runner certification] → done
    ↑                              ↑
 You start here              You generate demo here, then STOP
```
