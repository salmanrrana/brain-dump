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

## Universal Quality Workflow

Brain Dump enforces this status flow for all tickets:

```
backlog → ready → in_progress → ai_review → human_review → done
```

- **in_progress**: Active development (code being written)
- **ai_review**: Automated quality review by code review agents
- **human_review**: Demo approval by human reviewer
- **done**: Complete and approved

## The Ralph Workflow

### 1. Read Context Files

```
plans/prd.json     - Product requirements (auto-generated from tickets)
plans/progress.txt - Notes from previous iterations
```

### 2. Start Ticket Work

Use the MCP tool to create branch and set up tracking:

```javascript
workflow "start-work"({ ticketId: "story-id" });
```

This automatically:

- Creates a git branch: `feature/{ticket-id}-{slug}`
- Sets ticket status to `in_progress`
- Posts a "Starting work" comment

### 3. Pick ONE Task

From `prd.json`, find a user story where `passes: false`:

- Prioritize by priority field (high > medium > low)
- Only work on ONE task per iteration

### 4. Create Session for Tracking

```javascript
session "create"({ ticketId: "story-id" });
session "update-state"({ sessionId: "...", state: "analyzing" });
```

### 5. Implement Feature

```javascript
session "update-state"({ sessionId: "...", state: "implementing" });
```

- Write the code
- Run type checks: `pnpm type-check`
- Run tests: `pnpm test`
- Verify acceptance criteria

### 6. Commit Changes

```javascript
session "update-state"({ sessionId: "...", state: "committing" });
```

```bash
git add -A
git commit -m "feat(<ticket-id>): <description>"
```

### 7. Complete Implementation (Move to AI Review)

**IMPORTANT**: Do NOT directly set status to "done". Use `workflow "complete-work"`:

```javascript
workflow "complete-work"({
  ticketId: "story-id",
  summary: "Implemented login form with validation and API integration",
});
```

This:

- Validates that tests pass
- Moves ticket to `ai_review` status
- Posts work summary as comment
- Updates PRD file (`passes: true`)

### 8. Run AI Review Agents

After `workflow "complete-work"`, run the review pipeline:

```javascript
// Submit findings from each agent
review "submit-finding"({
  ticketId: "story-id",
  agent: "code-reviewer",
  severity: "major",
  category: "type-safety",
  description: "Missing null check on user input",
});
```

Review agents to run:

1. **code-reviewer** - Code quality and style
2. **silent-failure-hunter** - Error handling issues
3. **code-simplifier** - Code simplification opportunities

### 9. Fix Critical/Major Findings

If any critical or major findings:

```javascript
// Fix the issue, then mark as fixed
review "mark-fixed"({
  findingId: "finding-id",
  fixStatus: "fixed",
  fixDescription: "Added null check before accessing property",
});
```

### 10. Check Review Complete

```javascript
review "check-complete"({ ticketId: "story-id" });
// Returns { complete: true/false, openCritical: 0, openMajor: 0, ... }
```

### 11. Generate Demo Script (Move to Human Review)

Once all critical/major findings are fixed:

```javascript
review "generate-demo"({
  ticketId: "story-id",
  steps: [
    {
      order: 1,
      description: "Navigate to login page",
      expectedOutcome: "Login form displays",
      type: "manual",
    },
    {
      order: 2,
      description: "Enter valid credentials",
      expectedOutcome: "User is logged in",
      type: "manual",
    },
  ],
});
```

This moves ticket to `human_review` status.

### 12. STOP - Wait for Human Approval

**The workflow stops here**. A human must:

- Review the demo script
- Run through the steps
- Provide approval via `review "submit-feedback"`

If approved → ticket moves to `done`
If rejected → stays in `human_review` with feedback

### 13. Update Progress File

Append to `plans/progress.txt`:

```
## Iteration N - [timestamp]
- Completed: <ticket title>
- Changes: <brief summary>
- Review: <number of findings, all fixed>
- Notes: <any learnings or issues>
```

### 14. Check Completion

If ALL stories have `passes: true` and are in `done` status:

- Push branch: `git push -u origin <branch-name>`
- Create PR using `gh pr create`
- Output: `PRD_COMPLETE`

Otherwise, the next iteration picks the next task.

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
2. **Always test** - Run tests before completing
3. **Use workflow "complete-work"** - Never directly set status to "done"
4. **Run all review agents** - Fix critical/major before demo
5. **Stop at human_review** - Wait for human approval
6. **Document issues** - Add blockers to progress.txt
7. **Never commit to main/dev** - Always use feature branches
