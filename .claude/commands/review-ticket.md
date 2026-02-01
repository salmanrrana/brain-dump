---
description: Run AI review agents on current ticket work and submit findings
---

# Review Ticket

Load the `brain-dump-workflow` skill for context on the full workflow.

You are running the AI review workflow for a ticket in `ai_review` status. This is part of the Universal Quality Workflow.

## Prerequisites

- Ticket must be in `ai_review` status (set by `complete_ticket_work`)
- Implementation work must be complete
- Validation must pass (`pnpm check`)

## Steps

### Step 1: Verify Ticket Status

First, confirm the ticket is in `ai_review` status:

```
list_tickets({ projectId: "<project-id>", status: "ai_review" })
```

Or get the active Ralph session which includes ticket state:

```
get_session_state({ ticketId: "<ticket-id>" })
```

If the ticket is not in `ai_review`, call `complete_ticket_work` first.

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

For EVERY issue found, call `submit_review_finding`:

```
submit_review_finding({
  ticketId: "<ticket-id>",
  agent: "code-reviewer",
  severity: "major",  // critical, major, minor, suggestion
  category: "error-handling",
  description: "Missing input validation in API handler",
  filePath: "src/api/tickets.ts",
  lineNumber: 42,
  suggestedFix: "Add Zod schema validation"
})
```

Severity levels:

- **critical**: Security issues, data loss risks, crashes
- **major**: Bugs, missing error handling, logic errors
- **minor**: Style issues, naming, minor improvements
- **suggestion**: Nice-to-have enhancements

### Step 4: Get Findings Summary

```
get_review_findings({ ticketId: "<ticket-id>" })
```

### Step 5: Fix Critical and Major Issues

For each critical/major finding:

1. Make the fix
2. Run validation: `pnpm check`
3. Mark as fixed:
   ```
   mark_finding_fixed({
     findingId: "<finding-id>",
     status: "fixed",
     fixDescription: "Added Zod validation schema"
   })
   ```
4. Commit: `git commit -m "fix(<ticket-id>): <description>"`

### Step 6: Verify Review Complete

```
check_review_complete({ ticketId: "<ticket-id>" })
```

Must return `canProceedToHumanReview: true` before continuing.

### Step 7: Generate Demo Script

When all critical/major findings are fixed:

```
generate_demo_script({
  ticketId: "<ticket-id>",
  steps: [
    { order: 1, description: "Open http://localhost:4242", expectedOutcome: "App loads", type: "manual" },
    { order: 2, description: "Navigate to tickets page", expectedOutcome: "Ticket list visible", type: "visual" },
    { order: 3, description: "Click on ticket", expectedOutcome: "Modal opens with details", type: "manual" }
  ]
})
```

Step types:

- **manual**: User performs an action
- **visual**: User visually verifies something
- **automated**: System runs automated check

### Step 8: STOP - Wait for Human

After generating the demo script:

- Ticket moves to `human_review`
- **DO NOT auto-approve** - wait for human to run demo and provide feedback
- Human will use the Brain Dump UI to approve/reject

## Important

- Submit ALL findings, even minor ones (for audit trail)
- Fix critical and major issues before generating demo
- Minor issues and suggestions can be noted for future work
- The demo script helps the human reviewer verify the implementation
- Never skip straight to `done` - human approval is required

## Status Flow

```
ai_review → [fix findings] → human_review → [human approval] → done
    ↑                              ↑
 You start here              You generate demo here, then STOP
```
