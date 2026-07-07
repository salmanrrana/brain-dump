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

Self-review the diff, submit every finding through Brain Dump, fix critical/major findings, then check completion.

- `review({ action: "get-findings", ticketId })`
- `review({ action: "submit-finding", ticketId, agent, severity, category, description })`
- `review({ action: "mark-fixed", findingId, fixStatus: "fixed" })`
- `review({ action: "check-complete", ticketId })`

### Step 3: Demo

Generate 3-7 test steps after review completion, including criterion coverage references plus automation specs for visual/automated UI, API, command, or file checks. Use coverageRationale only for non-certifiable criteria and name each criterion id; rationale keeps the run uncertified. This moves the ticket to ai_verification for runner certification.

- `review({ action: "generate-demo", ticketId, steps }) with covers references and automation specs on visual/automated steps`

### Step 4: Stop

Complete the Ralph session and stop. Never run verification or move the ticket to done yourself.

- `session({ action: "complete", sessionId, outcome: "success" })`

### Validation Gates

- Before complete-work: Discover and run this project's validation commands from docs/config.
- Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.
- Before session completion, generate-demo must have been called and the ticket must be in ai_verification.

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
