---
description: Extract and reconcile learnings from completed work
---

# Reconcile Learnings

You are extracting learnings from completed ticket work and updating project documentation. This ensures continuous improvement of the development workflow.

## Prerequisites

- Ticket must be in `done` status (human approved)
- You have context about what was implemented
- You understand the patterns and decisions made

## Steps

### Step 1: Get Ticket Context

```
comment tool, action: "list", ticketId: "<ticket-id>"
review tool, action: "get-findings", ticketId: "<ticket-id>"
```

Review:

- Work summary comments
- Review findings (what issues were found)
- How issues were resolved
- Any patterns that emerged

### Step 2: Identify Learnings

Categorize learnings into four types:

| Type             | Description                  | Example                                          |
| ---------------- | ---------------------------- | ------------------------------------------------ |
| **pattern**      | Good patterns to repeat      | "Use Zod for input validation"                   |
| **anti-pattern** | Patterns to avoid            | "Don't use raw SQL in MCP tools"                 |
| **tool-usage**   | How to use tools effectively | "Always check review_complete before demo"       |
| **workflow**     | Process improvements         | "Run lint before type-check for faster feedback" |

### Step 3: Draft Learnings

For each learning, consider:

- **What was learned**: Clear, actionable insight
- **Why it matters**: Impact on code quality/productivity
- **Where to document**: CLAUDE.md, spec files, or ticket templates

### Step 4: Submit Learnings

```
epic tool, action: "reconcile-learnings",
  ticketId: "<ticket-id>",
  learnings: [
    {
      type: "pattern",
      description: "Use Zod schemas for all MCP tool inputs",
      suggestedUpdate: {
        file: "CLAUDE.md",
        section: "MCP Tool Implementation",
        content: "Always use Zod schemas for input validation: `{ ticketId: z.string() }`"
      }
    },
    {
      type: "anti-pattern",
      description: "Don't catch errors without logging",
      suggestedUpdate: {
        file: "CLAUDE.md",
        section: "DO/DON'T Guidelines",
        content: "DON'T: Empty catch blocks. DO: Log errors with context before handling."
      }
    },
    {
      type: "workflow",
      description: "Run validation in this order: lint → type-check → test",
      suggestedUpdate: null  // Just record, don't update docs
    }
  ],
  updateDocs: true  // Set to true to apply suggested updates
})
```

### Step 5: Review Applied Changes

If `updateDocs: true`, the tool will:

- Update specified files with suggested content
- Create a progress comment documenting what was updated
- Store learnings in epic workflow state for future reference

Verify the changes look correct:

```bash
git diff CLAUDE.md
```

### Step 6: Commit Documentation Updates

```bash
git add CLAUDE.md plans/specs/*.md
git commit -m "docs: Reconcile learnings from ticket <ticket-id>"
```

## Learning Categories

### Patterns (Good)

- Code patterns that worked well
- Testing approaches that caught bugs
- Error handling strategies

```
{
  type: "pattern",
  description: "Always create progress comments for audit trail",
  suggestedUpdate: {
    file: "CLAUDE.md",
    section: "MCP Tool Implementation",
    content: "Add: Use `comment` tool `action: \"add\"` for all workflow state changes"
  }
}
```

### Anti-Patterns (Avoid)

- Approaches that caused problems
- Code that needed to be rewritten
- Pitfalls to avoid

```
{
  type: "anti-pattern",
  description: "Don't modify workflow state without atomic transaction",
  suggestedUpdate: {
    file: "CLAUDE.md",
    section: "Database Queries",
    content: "DON'T: Update ticket status and workflow state separately"
  }
}
```

### Tool Usage

- MCP tool best practices
- Parameter combinations that work well
- Common gotchas with tools

```
{
  type: "tool-usage",
  description: "workflow start-work auto-creates epic branch if ticket has epic",
  suggestedUpdate: null
}
```

### Workflow

- Process improvements
- Order of operations
- Efficiency tips

```
{
  type: "workflow",
  description: "Run review agents before fixing issues - some may be related",
  suggestedUpdate: null
}
```

## When to Run

- After each ticket is marked `done`
- After epic completion (aggregate learnings)
- When human reviewer provides feedback
- When you notice repeated issues

## Example Session

```
User: The ticket is done. Can you reconcile learnings?

Claude: I'll analyze the completed work and extract learnings.

[Reviews work summary, findings, and fixes]

The main learnings from this ticket:

1. **Pattern**: Use comment-utils.js for all ticket comment creation
2. **Anti-pattern**: Don't hardcode author names - use constants
3. **Tool-usage**: Always call workflow sync-links after committing

[Calls epic tool reconcile-learnings with updateDocs: true]

I've updated CLAUDE.md with the new patterns and recorded the learnings
in the epic workflow state.
```

## Important

- Focus on actionable learnings, not obvious things
- Keep suggested updates concise and specific
- Test documentation changes before committing
- Learnings accumulate at epic level for holistic view
- This is the final step in the Universal Quality Workflow
