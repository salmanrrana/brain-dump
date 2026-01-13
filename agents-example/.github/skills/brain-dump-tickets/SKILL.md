---
name: brain-dump-tickets
description: Manage Brain Dumpy tickets - create, update, track progress, and complete work items. Use when working with Brain Dumpy task management or when asked to create/update tickets.
---

# Brain Dumpy Ticket Management Skill

This skill provides the knowledge and workflows for managing Brain Dumpy tickets.

## When to Use This Skill

- Creating new tickets or epics
- Updating ticket status
- Adding work summaries or progress updates
- Starting or completing work on a ticket
- Linking commits or files to tickets

## Available MCP Tools

Brain Dumpy provides these MCP tools (prefix with `brain-dump/` if needed):

### Project Management
| Tool | Description |
|------|-------------|
| `list_projects` | List all registered projects |
| `find_project_by_path` | Find project by directory path |
| `create_project` | Register a new project |

### Ticket Operations
| Tool | Description |
|------|-------------|
| `list_tickets` | List tickets (optionally filtered) |
| `create_ticket` | Create a new ticket |
| `update_ticket_status` | Update ticket status |
| `start_ticket_work` | Start working (creates git branch) |
| `complete_ticket_work` | Complete and move to review |

### Epic Management
| Tool | Description |
|------|-------------|
| `list_epics` | List epics for a project |
| `create_epic` | Create a new epic |

### Progress Tracking
| Tool | Description |
|------|-------------|
| `add_ticket_comment` | Add comment/work summary |
| `get_ticket_comments` | Get comments for a ticket |
| `link_commit_to_ticket` | Link a git commit |
| `link_files_to_ticket` | Link files to a ticket |

## Ticket Status Flow

```
backlog → ready → in_progress → review → done
                              ↘ ai_review → human_review → done
```

## Creating Good Tickets

### Required Fields
- `projectId`: Get from `find_project_by_path` or `list_projects`
- `title`: Clear, action-oriented title

### Optional Fields
- `description`: Detailed description (markdown supported)
- `priority`: "low", "medium", or "high"
- `epicId`: Group with related tickets
- `tags`: Array of categorization tags

### Example
```javascript
create_ticket({
  projectId: "abc-123",
  title: "Add user authentication",
  description: "Implement login/logout functionality with JWT tokens",
  priority: "high",
  tags: ["backend", "auth", "security"]
})
```

## Work Summary Format

When completing a ticket, add a work summary:

```javascript
add_ticket_comment({
  ticketId: "ticket-id",
  content: `## Work Summary
**Changes Made:**
- Added LoginForm component
- Integrated with auth API
- Added validation

**Tests:**
- Unit tests passing
- E2E login flow tested

**Notes:**
- Consider adding rate limiting later`,
  author: "claude",
  type: "work_summary"
})
```

## Progress Updates

Keep users informed during work:

```javascript
add_ticket_comment({
  ticketId: "ticket-id",
  content: "Starting implementation of login form. Will add validation and error handling.",
  author: "claude",
  type: "comment"
})
```

## Linking Work

### Link Commits
```javascript
link_commit_to_ticket({
  ticketId: "ticket-id",
  commitHash: "abc123",
  message: "feat: add login form component"
})
```

### Link Files
```javascript
link_files_to_ticket({
  ticketId: "ticket-id",
  files: ["src/components/LoginForm.tsx", "src/api/auth.ts"]
})
```
