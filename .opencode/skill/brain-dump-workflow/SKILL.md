---
name: brain-dump-workflow
description: >
  MANDATORY quality workflow for Brain Dump tickets. Defines the exact MCP tool
  call sequence every ticket must follow. Load this before starting any ticket work.
---

# Brain Dump Universal Quality Workflow

> **Canonical source**: `src/api/ralph.ts` → `getRalphPrompt()`.
> This skill provides a quick reference. The system prompt has the full workflow.

## MANDATORY 5-Step Sequence

Every ticket MUST go through these steps using MCP tools. Never skip any.

### Step 1: Start Work

Call `workflow "start-work"({ ticketId: "<id>" })` BEFORE writing any code.

This creates a git branch, sets status to `in_progress`, and posts a "Starting work" comment.

### Step 2: Implement + Verify

Write code, then discover and run this project's validation commands:

- Check project docs/config first: `AGENTS.md`, `CLAUDE.md`, README, CONTRIBUTING, package scripts, `pyproject.toml`, `go.mod`, Makefile/Justfile, and CI files.
- Use the project's own commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- Common examples only: package script check/test/lint, pytest/ruff when configured, `go test ./...`, `cargo test`, `dotnet test`, `mvn test`, `./gradlew test`.
- If no automated validation command is discoverable, run a targeted manual smoke check and record that no project validation command was found.
- When available, `skill/brain-dump-workflow/scripts/run-quality-checks.sh` can be used as a discovery helper.

Commit with format: `feat(<ticket-short-id>): <description>`

### Step 3: Complete Implementation

Call `workflow "complete-work"({ ticketId: "<id>", summary: "<what you did>" })`

This moves ticket to `ai_review` and posts a work summary comment.

### Step 4: AI Review (via MCP tools — NOT local review skills)

IMPORTANT: Do NOT use local `/review` skills, subagents, or code review tools.
Perform self-review by reading your own diffs, then record findings via MCP.

For each issue found, you MUST invoke the MCP tool:

`review "submit-finding"({ ticketId, agent: "code-reviewer", severity, category, description })`

Verify you receive a `findingId` in the response for each submission.

Fix critical/major issues, then invoke:

`review "mark-fixed"({ findingId, fixStatus: "fixed" })`

Verify: `review "check-complete"({ ticketId })` — response must contain `canProceedToHumanReview: true`

### Step 5: Generate Demo + STOP

Call `review "generate-demo"({ ticketId, steps: [{ order, description, expectedOutcome, type }] })`

Include 3-7 manual test steps. Ticket moves to `human_review`.

**STOP HERE. Do NOT continue. Only humans can approve tickets.**

## DO NOT

- Skip any step above
- Set ticket status to "done" directly
- Continue working after generating demo
- Write code before calling `workflow "start-work"`
- Use local review skills or subagents instead of `review "submit-finding"`
- Describe demo steps in text instead of calling `review "generate-demo"`
- Create git branches manually instead of using `workflow "start-work"`
- Use any local alternative when an MCP tool exists for the step

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
