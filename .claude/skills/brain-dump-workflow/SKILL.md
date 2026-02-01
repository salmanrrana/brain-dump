---
name: brain-dump-workflow
description: >
  MANDATORY quality workflow for Brain Dump tickets. Defines the exact MCP tool
  call sequence every ticket must follow. Load this before starting any ticket work.
---

# Brain Dump Universal Quality Workflow

## MANDATORY 5-Step Sequence

Every ticket MUST go through these steps. Never skip any.

### Step 1: Start Work

Call `start_ticket_work({ ticketId: "<id>" })` BEFORE writing any code.

This creates a git branch, sets status to `in_progress`, and posts a "Starting work" comment.

### Step 2: Implement + Verify

Write code, then run quality gates:

- `pnpm type-check` -- must pass
- `pnpm lint` -- must pass
- `pnpm test` -- must pass

Commit with format: `feat(<ticket-short-id>): <description>`

### Step 3: Complete Implementation

Call `complete_ticket_work({ ticketId: "<id>", summary: "<what you did>" })`

This moves ticket to `ai_review` and posts a work summary comment.

### Step 4: AI Review

Perform self-review of all changes. For each issue found:

Call `submit_review_finding({ ticketId, agent: "code-reviewer", severity, category, description })`

Fix critical/major issues, then call `mark_finding_fixed({ findingId, status: "fixed" })`

Verify: `check_review_complete({ ticketId })` -- must return `canProceedToHumanReview: true`

### Step 5: Generate Demo + STOP

Call `generate_demo_script({ ticketId, steps: [{ order, description, expectedOutcome, type }] })`

Include 3-7 manual test steps. Ticket moves to `human_review`.

**STOP HERE. Do NOT continue. Only humans can approve tickets.**

## DO NOT

- Skip any step above
- Set ticket status to "done" directly
- Continue working after generating demo
- Write code before calling `start_ticket_work`

## Severity Guide (for Step 4)

| Severity     | When to Use                                     |
| ------------ | ----------------------------------------------- |
| `critical`   | Bug that breaks functionality or causes crashes |
| `major`      | Incorrect behavior or error handling issue      |
| `minor`      | Code quality issue, not a bug                   |
| `suggestion` | Nice-to-have improvement                        |

## Demo Step Types (for Step 5)

| Type        | When to Use                      |
| ----------- | -------------------------------- |
| `manual`    | User performs an action          |
| `visual`    | User visually confirms something |
| `automated` | System runs a command/test       |

## Reference Docs

For detailed guidance on specific phases, see:

- `reference/review-guide.md` -- Self-review checklist and review agent details
- `reference/troubleshooting.md` -- Common errors and recovery steps
