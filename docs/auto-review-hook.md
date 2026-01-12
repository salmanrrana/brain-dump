# Auto-Review Hook for Claude Code

Brain Dumpy includes an automatic code review hook that triggers after task completion. This hook runs the `pr-review-toolkit` and `code-simplifier` agents to ensure code quality.

## Overview

When Claude completes a coding task, the hook:

1. Evaluates whether significant source code changes were made
2. If code was written/modified, triggers the review pipeline:
   - **code-reviewer**: Checks code against CLAUDE.md guidelines
   - **silent-failure-hunter**: Identifies silent failures and error handling issues
   - **code-simplifier**: Simplifies and refines the code

## Prerequisites

You must have these plugins installed:

```bash
# Install required plugins
claude plugins install pr-review-toolkit
claude plugins install code-simplifier
```

## Enabling the Hook

The hook is configured in `.claude/settings.local.json`. To enable:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether to trigger automatic code review..."
          }
        ]
      }
    ]
  }
}
```

The full hook configuration is already included in this project's settings.

## Disabling the Hook

To disable the hook, either:

### Option 1: Remove the hooks section
```json
{
  "hooks": {}
}
```

### Option 2: Set Stop to empty array
```json
{
  "hooks": {
    "Stop": []
  }
}
```

## What Triggers the Review

The hook triggers when Claude uses Write, Edit, or NotebookEdit tools to modify source code files:

**Triggers review:**
- `.ts`, `.tsx`, `.js`, `.jsx` files
- `.py`, `.go`, `.rs` files
- Test files (`*.test.ts`, `*.spec.ts`, etc.)

**Does NOT trigger review:**
- Documentation files (`.md`, README)
- Configuration files (`package.json`, `tsconfig.json`)
- Git operations only
- Reading/searching files
- Conversation-only responses

## Review Pipeline

### 1. Code Reviewer (`pr-review-toolkit:code-reviewer`)

Reviews code against project guidelines in CLAUDE.md:
- Checks for style violations
- Verifies best practices
- Reports only high-confidence issues (confidence >= 80)

### 2. Silent Failure Hunter (`pr-review-toolkit:silent-failure-hunter`)

Identifies error handling issues:
- Empty catch blocks
- Silent failures
- Inadequate error messages
- Unjustified fallback behavior

### 3. Code Simplifier (`code-simplifier:code-simplifier`)

Refines code for clarity:
- Removes redundancy
- Simplifies complex logic
- Improves readability
- Preserves all functionality

## Customization

### Adjusting the Prompt

You can modify the hook prompt in `.claude/settings.local.json` to:
- Change which file types trigger review
- Adjust the sensitivity
- Add additional conditions

### Running Individual Agents

You can also run the review agents manually:

```
# Run just the code reviewer
> Use the Task tool to launch pr-review-toolkit:code-reviewer

# Run just the silent failure hunter
> Use the Task tool to launch pr-review-toolkit:silent-failure-hunter

# Run just the code simplifier
> Use the Task tool to launch code-simplifier:code-simplifier
```

## Troubleshooting

### Hook not triggering

1. Check that plugins are installed: `claude plugins list`
2. Verify settings.local.json has valid JSON
3. Ensure the hooks section is at the top level of the settings object

### Hook triggering too often

Modify the prompt to be more specific about which changes should trigger review:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Only trigger review if more than 50 lines of code were added or modified..."
          }
        ]
      }
    ]
  }
}
```

### Performance concerns

The review pipeline adds processing time after each response. If this is too slow:
- Disable specific agents in the prompt
- Use the hook only for PR reviews, not during development
- Consider using a SubagentStop hook instead of Stop

## Related Files

- `.claude/settings.local.json` - Hook configuration
- `.claude/hooks/auto-review.md` - Hook documentation
- `.claude/hooks/auto-review.config.json` - Configuration schema
- `.claude/hooks/hooks.json` - Portable hook definition
