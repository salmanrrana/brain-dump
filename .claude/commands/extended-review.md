---
description: Run the extended code review pipeline with library compliance, React patterns, cruft detection, and senior engineer synthesis. Use after /review or standalone for comprehensive analysis.
---

# Extended Code Review Pipeline

You are running the extended code review pipeline for Brain Dump. This pipeline provides deeper analysis after the initial pr-review-toolkit agents complete.

## Your Task

### Step 1: Identify Changed Files

First, determine what files were changed:

- Check `git diff --name-only HEAD~1` for committed changes
- Check `git diff --name-only` for uncommitted changes
- Or reference Write/Edit tool usage from conversation history

### Step 2: Detect Libraries and File Types

Analyze the changed files to determine which agents to run:

**Check for React/Next.js files:**

```bash
# Look for .tsx/.jsx files in changes
git diff --name-only | grep -E '\.(tsx|jsx)$'
```

**Check for library usage:**

```bash
# Read package.json for dependencies
cat package.json | jq '.dependencies + .devDependencies | keys'
```

### Step 3: Run Extended Review Agents

**Phase 1 - Parallel Execution (independent analysis):**

Launch applicable agents in PARALLEL using a single message with multiple Task tool calls:

```
Task 1: context7-library-compliance (ALWAYS run)
- Verify library usage against official documentation
- Check for deprecated APIs
- Validate patterns against Context7 docs

Task 2: react-best-practices (IF React/Next.js files present)
- Review component design patterns
- Check hooks usage and state management
- Verify performance patterns

Task 3: cruft-detector (ALWAYS run)
- Find unnecessary comments (what vs why)
- Detect dead/commented-out code
- Identify shallow tests
- Flag over-engineering
```

**Important:** Only include react-best-practices if .tsx or .jsx files are in the changeset.

### Step 4: Wait for Phase 1 Completion

All Phase 1 agents must complete before proceeding.

### Step 5: Run Senior Engineer Review (Phase 2)

Launch the synthesis agent AFTER Phase 1 completes:

```
Task 4: senior-engineer
- Read all prior agent findings
- Synthesize into prioritized recommendations
- Provide final merge/block recommendation
```

### Step 6: Present Results

Summarize the extended review with:

```markdown
## Extended Review Complete

### Agent Results Summary

| Agent                       | Issues | Critical | Status             |
| --------------------------- | ------ | -------- | ------------------ |
| context7-library-compliance | X      | Y        | [Complete]         |
| react-best-practices        | X      | Y        | [Complete/Skipped] |
| cruft-detector              | X      | Y        | [Complete]         |
| senior-engineer             | -      | -        | [Complete]         |

### Senior Engineer Recommendation

**[APPROVE / APPROVE WITH FIXES / REQUEST CHANGES]**

[Key summary from senior-engineer agent]

### Action Items (if any)

**Must Fix Before Merge:**

1. [Issue from senior review]

**Should Address:**

1. [Issue from senior review]

### Next Steps

- [ ] Address P0/P1 issues if any
- [ ] Run `/review` again after fixes
- [ ] Create PR when ready
```

## Important Guidelines

1. **Phase 1 agents run in PARALLEL** - Use single message with multiple Task calls
2. **Phase 2 runs AFTER Phase 1** - Senior engineer needs prior findings
3. **Skip react-best-practices** if no React files in changeset
4. **Always run context7 and cruft-detector** - They apply to all code
5. **Trust senior-engineer recommendation** - It synthesizes all findings

## Triggering

This command can be:

- Run manually via `/extended-review`
- Auto-triggered by SubagentStop hook after `/review` completes
- Run standalone for extended analysis without initial review

## Cross-Environment Support

| Environment | Execution Method                       |
| ----------- | -------------------------------------- |
| Claude Code | Full parallel execution via Task tool  |
| VS Code     | Manual - prompt user to run each agent |
| OpenCode    | Manual - prompt user to run each agent |

In non-Claude Code environments, guide the user through invoking each agent sequentially.
