---
description: Run comprehensive Tracer Review on entire epic
---

# Review Epic

You are running a comprehensive "Tracer Review" across an entire epic. This provides holistic analysis of all work done in the epic before the final PR is merged.

## Prerequisites

- Epic must have all tickets completed (in `done` or `human_review` status)
- Epic branch should contain all commits from the epic's tickets
- Run this before creating or finalizing the epic's PR

## Steps

### Step 1: Get Epic Context

```
epic tool, action: "list", projectId: "<project-id>"
ticket tool, action: "list-by-epic", epicId: "<epic-id>"
```

Verify:

- All tickets are complete (`done`) or awaiting final review (`human_review`)
- No tickets are stuck in `in_progress` or `ai_review`

### Step 2: Analyze Epic Scope

```bash
# Get all commits in the epic branch
git log main..HEAD --oneline

# Get all files changed in the epic
git diff main...HEAD --name-only
```

### Step 3: Run Extended Review Pipeline

Run the extended review on ALL epic changes:

**Phase 1 - Parallel Analysis:**

```
Task 1: pr-review-toolkit:code-reviewer
- Review ALL changes in epic against CLAUDE.md
- Check cross-ticket consistency

Task 2: pr-review-toolkit:silent-failure-hunter
- Check for silent failures across the epic
- Look for error handling gaps

Task 3: pr-review-toolkit:code-simplifier
- Analyze for duplication across tickets
- Check for over-engineering

Task 4: context7-library-compliance
- Verify library usage against documentation
- Check for deprecated patterns

Task 5: react-best-practices (if React files changed)
- Review component patterns
- Check hooks and state management

Task 6: cruft-detector
- Find unnecessary comments
- Detect dead code
- Flag over-engineering
```

**Phase 2 - Synthesis:**

```
Task 7: senior-engineer
- Synthesize all Phase 1 findings
- Provide architectural assessment
- Give final merge recommendation
```

### Step 4: Submit Epic-Level Findings

For significant cross-ticket issues:

```
review tool, action: "submit-finding",
  ticketId: "<any-ticket-in-epic>",
  agent: "senior-engineer",
  severity: "major",
  category: "architecture",
  description: "Inconsistent error handling patterns across epic",
  suggestedFix: "Standardize on error boundary pattern from ticket X"
```

### Step 5: Generate Epic Summary

Create a summary for the epic PR:

```markdown
## Epic Review Summary

### Scope

- **Tickets completed**: X
- **Files changed**: Y
- **Total commits**: Z

### Review Results

| Agent                       | Issues Found | Critical | Status           |
| --------------------------- | ------------ | -------- | ---------------- |
| code-reviewer               | X            | Y        | Complete         |
| silent-failure-hunter       | X            | Y        | Complete         |
| code-simplifier             | X            | Y        | Complete         |
| context7-library-compliance | X            | Y        | Complete         |
| react-best-practices        | X            | Y        | Complete/Skipped |
| cruft-detector              | X            | Y        | Complete         |
| senior-engineer             | -            | -        | Complete         |

### Senior Engineer Recommendation

**[APPROVE / APPROVE WITH FIXES / REQUEST CHANGES]**

[Summary of key findings and recommendation]

### Cross-Ticket Patterns

- Pattern 1: [Description]
- Pattern 2: [Description]

### Learnings to Document

- [ ] Learning 1 for CLAUDE.md
- [ ] Learning 2 for spec updates
```

### Step 6: Address Critical Issues

If any critical or major cross-ticket issues were found:

1. Create a follow-up ticket for the fix
2. Or fix in the current epic branch before PR

### Step 7: Prepare PR

After epic review passes:

```bash
# Ensure all changes are committed
git status

# Push epic branch
git push origin <epic-branch>

# Create PR if not exists
gh pr create --title "Epic: <title>" --body "$(cat epic-summary.md)"
```

## Important

- Epic review is more thorough than per-ticket review
- Focus on cross-ticket consistency and patterns
- Use senior-engineer agent for final synthesis
- Document learnings for future epics
- This review happens BEFORE the PR is merged to main

## When to Run

- After all tickets in epic are complete
- Before finalizing the epic PR
- When requested by human reviewer
- As part of the Ralph workflow before epic completion

## Status Flow

```
[All tickets done] → Epic Review → PR Review → Merge to main
                          ↑
                   You are here
```
