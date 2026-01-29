---
name: auto-review
description: Automatic code review hook that triggers pr-review-toolkit and code-simplifier agents after task completion
---

# Auto-Review Hook

This hook automatically triggers code review agents after completing a coding task.

## How It Works

1. When Claude completes a response (Stop event), the hook evaluates whether code was written or modified
2. If code changes were made, it recommends running the review pipeline:
   - `pr-review-toolkit:code-reviewer` - Checks code against project guidelines
   - `pr-review-toolkit:silent-failure-hunter` - Finds silent failures and error handling issues
   - `code-simplifier:code-simplifier` - Simplifies and refines the code

## Usage

This hook is configured in `.claude/settings.json` or `.claude/settings.local.json`.

To enable:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Analyze if significant code changes were made in this session. If Write, Edit, or NotebookEdit tools were used to modify source code files (not config/docs), respond with {\"ok\": false, \"reason\": \"Code changes detected. Running review pipeline: Use the Task tool to launch pr-review-toolkit:code-reviewer, pr-review-toolkit:silent-failure-hunter, and code-simplifier:code-simplifier agents to review the changes.\"}. Otherwise respond {\"ok\": true}."
          }
        ]
      }
    ]
  }
}
```

To disable, remove the Stop hook from settings or set to empty array.

## Review Pipeline

The review pipeline runs these agents in sequence:

### 1. Code Reviewer (pr-review-toolkit:code-reviewer)
- Reviews code against CLAUDE.md guidelines
- Checks for style violations and best practices
- Only reports high-confidence issues (confidence >= 80)

### 2. Silent Failure Hunter (pr-review-toolkit:silent-failure-hunter)
- Identifies silent failures and error handling issues
- Checks catch blocks for specificity
- Validates error messages are user-actionable

### 3. Code Simplifier (code-simplifier:code-simplifier)
- Simplifies and refines code for clarity
- Removes redundancy and improves readability
- Preserves all functionality
