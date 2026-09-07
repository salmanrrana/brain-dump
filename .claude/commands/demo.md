---
description: Generate demo script for AI verification
---

# Generate Demo Script

Load the `brain-dump-workflow` skill for context on the full workflow.

You are generating a demo script for a ticket that has passed AI review and is ready for AI verification. The verification runner executes every step **without a human**, so every step must carry an executable automation spec. Manual steps are rejected for new handoffs.

## Prerequisites

- Ticket must be in `ai_review` status
- All critical and major findings must be fixed
- `review` tool `check-complete` with `ticketId` must return `canProceedToVerification: true`

## Steps

### Step 1: Verify Ticket is Ready

```
review tool, action: "check-complete", ticketId: "<ticket-id>"
```

If not ready: fix or close (`mark-fixed`, `wont_fix` for hypotheticals) the open critical/major findings first.

### Step 2: Understand the Ticket

Use `review` tool, `action: "get-review-context"`, `ticketId` — it returns the acceptance criteria with ids. Every acceptance criterion must be proven by at least one step via `covers` references (`criterion:1`, `subtask:<id>`). `coverageRationale` is rejected: if a criterion genuinely cannot be automated, reword the criterion to match what automation can prove, or hand the ticket to a human verifier.

### Step 3: Discover the App Boot Command

For UI/API steps, inspect the target project's README, AGENTS.md/CLAUDE.md, package scripts, Makefile/Justfile, pyproject.toml, go.mod, and runtime config. Declare `app: { "start": [...argv], "cwd": "<optional-project-relative-dir>" }` using the project's real startup command with `{port}`/`{host}` tokens. Never assume npm or pnpm, and never hardcode a port.

If a step needs a command outside the default allowlist (make, go, npx, ...), declare its exact argv in the project's `.brain-dump/verify.json` `commands` array first.

### Step 4: Generate Demo Script (3-7 steps)

Each step needs `order`, `description`, `expectedOutcome`, `type` (`visual` or `automated`), `covers`, and an `automation` spec (`ui`, `api`, `command`, or `file`). Example:

```
review tool, action: "generate-demo",
  ticketId: "<ticket-id>",
  steps: [
    {
      order: 1,
      description: "Board page renders the kanban columns",
      expectedOutcome: "The board route loads and the backlog column is visible",
      type: "visual",
      covers: ["criterion:1"],
      app: { "start": ["pnpm", "dev", "--port", "{port}"] },
      automation: {
        kind: "ui",
        route: "/board",
        assert: [{ type: "visible", selector: "[data-column='backlog']" }],
        screenshot: true
      }
    },
    {
      order: 2,
      description: "Status API returns the new field",
      expectedOutcome: "GET /api/status responds 200 with enabled=true",
      type: "automated",
      covers: ["criterion:2"],
      automation: {
        kind: "api",
        request: { method: "GET", path: "/api/status" },
        assert: [
          { type: "status", expected: 200 },
          { type: "jsonPath", expected: { path: "$.enabled", value: true } }
        ]
      }
    },
    {
      order: 3,
      description: "Focused tests pass",
      expectedOutcome: "The project's test command exits 0",
      type: "automated",
      covers: ["criterion:3"],
      automation: {
        kind: "command",
        command: { argv: ["pnpm", "test", "src/feature.test.ts"], timeoutMs: 120000, expectedExitCode: 0 },
        assert: [{ type: "stdoutNotContains", expected: "FAIL" }]
      }
    }
  ]
```

### Step 5: STOP and Wait

`generate-demo` moves the ticket to `ai_verification`, enqueues the verification job, and **completes the ticket's active sessions automatically** — do not call `session complete` afterwards and do not continue working. The runner boots the project, executes the steps, captures evidence, and certifies or reports failures.

## Demo Step Guidelines

| Type      | When to Use                              | Automation kind          |
| --------- | ---------------------------------------- | ------------------------ |
| visual    | UI state a screenshot should evidence    | `ui` (screenshot true)   |
| automated | API responses, commands, file assertions | `api`, `command`, `file` |

- 3-7 steps; every acceptance criterion covered via `covers`
- `manual` steps are rejected for new handoffs — everything must be executable
- Command automation: max timeout 300000ms, argv arrays only (no shell strings)
- Make assertions specific: `"Test the feature"` is not a step; a `ui` assert on a selector is

## After Demo Generation

1. **Certified**: the runner records evidence and moves the ticket to `done`.
2. **Failed**: the runner files findings and returns the ticket to implementation, or blocks it.

If verification blocked the ticket: inspect `get-verification-history` / `get-verification-job`, fix and validate the cause, then `resolve-verification-failure` (rootCause, classification, fixCommits, validation) to return it to `ai_review`, mark the addressed findings fixed, and re-run `check-complete` → `generate-demo`.
