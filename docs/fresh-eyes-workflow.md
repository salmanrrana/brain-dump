# Fresh Eyes Workflow

The "Fresh Eyes" workflow is a key feature of Brain Dump that ensures each ticket gets worked on with clean context, leading to better code quality and fewer bugs.

## What is Fresh Eyes?

When working with AI assistants on multiple tickets, context can accumulate that doesn't apply to the current task:
- Assumptions from previous tickets that don't hold
- Mental models from earlier code that has changed
- Variable names, function signatures, or patterns from unrelated work

The Fresh Eyes workflow ensures each ticket starts with a clean slate.

## How It Works

### Automatic Context Reset Signal

When you complete a ticket using the `complete_ticket_work` MCP tool, Brain Dump automatically:

1. **Detects your environment** (Claude Code, VS Code, or unknown)
2. **Returns context reset guidance** specific to your environment
3. **Signals `clearContext: true`** to indicate the AI should reset

### Environment-Specific Guidance

#### Claude Code

After completing a ticket:
```
/clear
```
This clears the conversation context while preserving tool access.

#### VS Code

After completing a ticket:
- Click "New Chat" in the sidebar
- Or press `Cmd/Ctrl+L` to start a fresh conversation
- Or close the current chat panel and open a new one

#### Other Environments

Start a new conversation or chat session before working on the next ticket.

## Why Fresh Context Matters

### Prevents Accumulated Assumptions

Without fresh context:
- AI might assume a function still exists when it was refactored
- Variable naming conventions from one module might leak to another
- Error handling patterns from one feature might be incorrectly applied elsewhere

### Improves Code Quality

Each ticket benefits from:
- Fresh analysis of the codebase
- No preconceptions about how things "should" work
- Clean evaluation of requirements without bias

### Reduces Bugs

Context bleeding between tasks can cause:
- Copy-paste errors from similar-looking code
- Incorrect imports or dependencies
- Inconsistent patterns within the same PR

## Workflow Example

### Step 1: Start Work on Ticket

```
# Use Brain Dump MCP to start
start_ticket_work(ticketId: "abc123")
```

This:
- Creates a feature branch
- Sets ticket status to "in_progress"
- Provides full ticket context

### Step 2: Implement the Feature

Work on the implementation with your AI assistant. Make commits as needed.

### Step 3: Complete the Ticket

```
# Use Brain Dump MCP to complete
complete_ticket_work(ticketId: "abc123", summary: "Implemented user auth")
```

This returns:
- Ticket moved to review
- Git commits summary
- Suggested PR description
- **Context reset guidance for your environment**

### Step 4: Reset Context

Follow the environment-specific guidance to clear context:
- Claude Code: Run `/clear`
- VS Code: Start new chat session

### Step 5: Pick Up Next Ticket

Start fresh on the next task with clean context!

## Integration with Ralph

Ralph, Brain Dump's autonomous agent mode, follows the Fresh Eyes workflow automatically:

1. Each iteration reads the PRD fresh
2. Picks ONE task to work on
3. Completes the task and outputs a summary
4. The next iteration starts with fresh context

This is why Ralph's prompt instructs working on only ONE feature per iteration.

## Best Practices

1. **Always use `complete_ticket_work`** - Don't manually mark tickets as complete; use the MCP tool to get context reset guidance.

2. **Don't skip the reset** - Even if the next ticket seems related, starting fresh prevents subtle bugs.

3. **Review before resetting** - Make sure you've:
   - Committed all changes
   - Pushed to remote
   - Created a PR if needed
   - Added any necessary documentation

4. **Trust the fresh start** - The AI will re-read necessary files when starting the next ticket. This is a feature, not a bug.

## Troubleshooting

### Context Not Clearing

If context seems to persist after `/clear`:
- Start a completely new conversation
- Close and reopen your IDE
- Check for any cached state in your tools

### Missing Context After Reset

If you need information from a previous ticket:
- Read the ticket's work summary comments in Brain Dump
- Check the git commit messages
- Look at the linked files in the ticket

### When to NOT Reset

There are rare cases where maintaining context is appropriate:
- Fixing a bug in code you just wrote (before completing the ticket)
- Working on subtasks of the same ticket
- Responding to PR review feedback on the same ticket

In these cases, don't mark the ticket as complete until all work is done.
