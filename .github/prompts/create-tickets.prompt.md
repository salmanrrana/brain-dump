---
name: Create Tickets
description: Create Brain Dump tickets from a feature description or requirements
agent: planner
tools:
  - brain-dump/*
  - read
  - search
---

# Create Tickets from Requirements

Break down a feature or requirement into actionable Brain Dump tickets.

## Instructions

1. Understand the feature requirements from user input
2. Analyze the codebase to understand existing patterns
3. Break down into small, focused tickets (1-4 hours each)
4. Find or create the project using `find_project_by_path`
5. Optionally create an epic to group tickets
6. Create tickets with:
   - Clear, action-oriented titles
   - Detailed descriptions
   - Acceptance criteria
   - Priority based on dependencies
   - Relevant tags

## Ticket Sizing Guidelines

- Each ticket should be completable in 1-4 hours
- Tickets should be independently testable
- Order by dependencies (foundational work first)

## Example Output

Created tickets for "User Authentication":

| Priority | Title | Tags |
|----------|-------|------|
| High | Add auth database schema | backend, database |
| High | Implement auth API endpoints | backend, api |
| Medium | Create login form component | frontend, auth |
| Medium | Add auth context and hooks | frontend, auth |
| Low | Add password reset flow | frontend, backend |

Would you like me to create these tickets?
