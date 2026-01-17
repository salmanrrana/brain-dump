---
description: Break down a spec.md into epics and tickets in Brain Dump. Creates actionable, well-sized tickets that Ralph can work through.
argument-hint: [path to project with spec.md]
---

# Spec Breakdown: Generate Tickets from Specification

You are a senior software architect breaking down a project specification into actionable tickets for Brain Dump.

## Your Mission

Read the spec.md file and create a comprehensive set of epics and tickets that break down the work into manageable chunks.

## Input

Project path: $ARGUMENTS (or current directory if not specified)

First, read the spec.md file at that location.

## Process

### Step 1: Analyze the Spec

Read and understand the entire specification. Identify:

- Core features that make up the MVP
- Supporting features that enable the core
- Nice-to-have features for later
- Technical infrastructure needs (setup, CI/CD, etc.)

### Step 2: Find the Project in Brain Dump

Use the MCP tool `find_project_by_path` to get the project ID. If not found, use `create_project` to register it first.

### Step 3: Create Epics

Group related work into epics. Common epic patterns:

- "Project Setup" - Initial scaffolding, tooling, CI/CD
- "Core Feature: [Name]" - Main features
- "User Authentication" - If applicable
- "Data Layer" - Database, APIs
- "UI Foundation" - Common components, styling system
- "Testing & QA" - Test infrastructure
- "Documentation" - README, API docs

Use Brain Dump MCP tool `create_epic` for each epic with:

- projectId: The project ID from step 2
- title: Epic title
- description: Brief description of what this epic covers

### Step 4: Create Tickets

For each epic, create granular, actionable tickets. Each ticket should:

- Be completable in 1-4 hours of focused work
- Have a clear definition of done
- Be properly prioritized (high/medium/low)
- Include acceptance criteria in the description

Use Brain Dump MCP tool `create_ticket` for each ticket with:

- projectId: The project ID
- epicId: The epic ID this ticket belongs to
- title: Short, descriptive title (action-oriented: "Add...", "Create...", "Implement...")
- description: **Use the enhanced Loom-style template below**
- priority: high, medium, or low
- tags: Relevant tags like ["setup"], ["backend"], ["frontend"], ["testing"], ["database"]

**Ticket Guidelines:**

- Start with setup/infrastructure tickets (high priority)
- Order tickets by dependency (what needs to be done first?)
- Include test tickets for each feature
- Don't forget documentation tickets
- Break large features into multiple smaller tickets
- Make tickets **self-contained** so Ralph can work in isolation (e.g., Docker)

### Enhanced Ticket Description Template

Each ticket should be self-contained. Use this Loom-style structure:

````markdown
## Overview

[2-3 sentences on WHY this exists and what problem it solves]

## Types (if applicable)

```typescript
interface YourInterface {
  // Complete interfaces the implementer needs
}
```
````

## Implementation Guide

### Step 1: [Action]

**Files:** `src/path/to/file.ts`
[What to do, with code template if helpful]

### Step 2: [Next action]

...

## Design Decisions (if applicable)

### Why [Choice] vs [Alternative]?

1. **[Reason]**: Explanation
2. **[Reason]**: Explanation

## Acceptance Criteria

- [ ] Primary functionality works
- [ ] Error cases handled
- [ ] Tests pass

## References

- Related: `src/lib/pattern.ts`
- Depends on: [ticket if applicable]

````

**When to include each section:**
- **Overview**: Always (explains WHY)
- **Types**: When creating/modifying interfaces or APIs
- **Implementation Guide**: Complex features or specific patterns to follow
- **Design Decisions**: When multiple valid approaches exist
- **Acceptance Criteria**: Always (defines "done")
- **References**: When related code or dependencies exist

### Step 5: Generate PRD

Update or create the plans/prd.json file with all tickets:

```json
{
  "projectName": "Project Name",
  "projectPath": "/full/path",
  "userStories": [
    {
      "id": "ticket-uuid-from-brain-dump",
      "title": "Ticket title",
      "description": "Ticket description",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "priority": "high",
      "tags": ["setup"],
      "passes": false
    }
  ],
  "generatedAt": "ISO timestamp"
}
````

### Step 6: Update Progress Log

Append to plans/progress.txt:

```
## Spec Breakdown Complete
Date: {timestamp}
Epics created: {count}
Tickets created: {count}
Ready for development!
```

### Step 7: Commit Changes

```bash
git add plans/
git commit -m "chore: generate PRD and tickets from spec"
```

## Output Summary

After completing breakdown, provide a summary:

- Number of epics created
- Number of tickets created (by priority)
- Suggested order to tackle the work
- Any open questions or areas that need clarification

## Important Guidelines

- Tickets should be independent where possible
- High priority = foundational/blocking work
- Medium priority = core feature work
- Low priority = polish, nice-to-have, documentation
- Each ticket should have enough context that someone unfamiliar with the project could understand what to do
