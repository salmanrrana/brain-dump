# MCP Tools Reference

Brain Dump's MCP server provides tools for managing projects, tickets, epics, workflows, and AI telemetry. All tools are available in Claude Code, VS Code (Copilot), and OpenCode.

## Quick Reference

| Category                      | Tools                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Projects](#project-tools)    | `list_projects`, `find_project_by_path`, `create_project`, `delete_project`                             |
| [Tickets](#ticket-tools)      | `create_ticket`, `list_tickets`, `update_ticket_status`, `update_acceptance_criterion`, `delete_ticket` |
| [Epics](#epic-tools)          | `list_epics`, `create_epic`, `update_epic`, `delete_epic`                                               |
| [Comments](#comment-tools)    | `add_ticket_comment`, `get_ticket_comments`                                                             |
| [Workflow](#workflow-tools)   | `start_ticket_work`, `complete_ticket_work`                                                             |
| [Git](#git-tools)             | `link_commit_to_ticket`, `link_pr_to_ticket`, `sync_ticket_links`                                       |
| [Files](#file-tools)          | `link_files_to_ticket`, `get_tickets_for_file`                                                          |
| [Health](#health-tools)       | `get_database_health`, `get_environment`, `get_project_settings`, `update_project_settings`             |
| [Telemetry](#telemetry-tools) | `start_telemetry_session`, `log_prompt_event`, `log_tool_event`, `end_telemetry_session`                |

---

## Project Tools

### list_projects

List all registered projects.

```
list_projects()
```

**Returns:** Array of projects with ID, name, and path.

### find_project_by_path

Find a project by filesystem path. Useful for auto-detecting which project you're working in.

```
find_project_by_path(path: string)
```

| Param  | Type   | Description                            |
| ------ | ------ | -------------------------------------- |
| `path` | string | Absolute filesystem path to search for |

### create_project

Register a new project in Brain Dump.

```
create_project(name: string, path: string, color?: string)
```

| Param   | Type    | Description                          |
| ------- | ------- | ------------------------------------ |
| `name`  | string  | Display name for the project         |
| `path`  | string  | Absolute path to project root        |
| `color` | string? | Optional hex color (e.g., `#3b82f6`) |

### delete_project

Delete a project and ALL its data (epics, tickets, comments).

```
delete_project(projectId: string, confirm?: boolean)
```

| Param       | Type     | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `projectId` | string   | Project ID to delete                                |
| `confirm`   | boolean? | Set to `true` to actually delete (default: dry run) |

**Safety:** By default, performs a dry run showing what would be deleted.

---

## Ticket Tools

### create_ticket

Create a new ticket in the Backlog column.

```
create_ticket(projectId: string, title: string, description?: string, priority?: string, epicId?: string, tags?: string[])
```

| Param         | Type      | Description                               |
| ------------- | --------- | ----------------------------------------- |
| `projectId`   | string    | Project ID                                |
| `title`       | string    | Short, descriptive title                  |
| `description` | string?   | Detailed description (markdown supported) |
| `priority`    | string?   | `low`, `medium`, or `high`                |
| `epicId`      | string?   | Epic ID to group the ticket               |
| `tags`        | string[]? | Tags for categorization                   |

### list_tickets

List tickets with optional filters.

```
list_tickets(projectId?: string, status?: string, limit?: number)
```

| Param       | Type    | Description                         |
| ----------- | ------- | ----------------------------------- |
| `projectId` | string? | Filter by project                   |
| `status`    | string? | Filter by status                    |
| `limit`     | number? | Max tickets to return (default: 20) |

**Valid statuses:** `backlog`, `ready`, `in_progress`, `review`, `ai_review`, `human_review`, `done`

### update_ticket_status

Move a ticket between columns.

```
update_ticket_status(ticketId: string, status: string)
```

| Param      | Type   | Description         |
| ---------- | ------ | ------------------- |
| `ticketId` | string | Ticket ID to update |
| `status`   | string | New status value    |

**Status flow:** `backlog` → `ready` → `in_progress` → `review` → `done`

### delete_ticket

Delete a ticket and all its comments.

```
delete_ticket(ticketId: string, confirm?: boolean)
```

| Param      | Type     | Description                                         |
| ---------- | -------- | --------------------------------------------------- |
| `ticketId` | string   | Ticket ID to delete                                 |
| `confirm`  | boolean? | Set to `true` to actually delete (default: dry run) |

---

## Epic Tools

### list_epics

List all epics for a project.

```
list_epics(projectId: string)
```

### create_epic

Create a new epic to group related tickets.

```
create_epic(projectId: string, title: string, description?: string, color?: string)
```

| Param         | Type    | Description          |
| ------------- | ------- | -------------------- |
| `projectId`   | string  | Project ID           |
| `title`       | string  | Epic title           |
| `description` | string? | Optional description |
| `color`       | string? | Optional hex color   |

### update_epic

Update an epic's title, description, or color.

```
update_epic(epicId: string, title?: string, description?: string, color?: string)
```

### delete_epic

Delete an epic. Tickets are unlinked but not deleted.

```
delete_epic(epicId: string, confirm?: boolean)
```

---

## Comment Tools

### add_ticket_comment

Add a comment, work summary, or test report to a ticket.

```
add_ticket_comment(ticketId: string, content: string, author: string, type?: string)
```

| Param      | Type    | Description                                             |
| ---------- | ------- | ------------------------------------------------------- |
| `ticketId` | string  | Ticket ID                                               |
| `content`  | string  | Comment text (markdown supported)                       |
| `author`   | string  | `claude`, `ralph`, `user`, or `opencode`                |
| `type`     | string? | `comment`, `work_summary`, `test_report`, or `progress` |

### get_ticket_comments

Get all comments for a ticket, newest first.

```
get_ticket_comments(ticketId: string)
```

---

## Workflow Tools

These are the most commonly used tools for day-to-day work.

### start_ticket_work

Start working on a ticket. This is the recommended way to begin implementation.

```
start_ticket_work(ticketId: string)
```

**What it does:**

1. Creates a git branch: `feature/{ticket-short-id}-{slug}`
2. Sets ticket status to `in_progress`
3. Auto-posts a "Starting work" comment
4. Returns ticket details with description and acceptance criteria

**Example response:**

```
## Started Work on Ticket

**Branch:** `feature/abc1234-add-user-login` (created)
**Project:** My App
**Path:** /home/user/my-app

---

## Ticket: Add user login

**Priority:** high

### Description
Implement user login with email and password...

### Acceptance Criteria
- Email validation
- Password hashing
- Session management
```

### complete_ticket_work

Complete work on a ticket and move it to review.

```
complete_ticket_work(ticketId: string, summary?: string)
```

| Param      | Type    | Description                           |
| ---------- | ------- | ------------------------------------- |
| `ticketId` | string  | Ticket ID to complete                 |
| `summary`  | string? | Work summary describing what was done |

**What it does:**

1. Sets ticket status to `review`
2. Auto-posts a formatted work summary comment
3. Updates PRD file (sets `passes: true`)
4. Suggests the next strategic ticket
5. Returns context reset guidance

---

## Git Tools

### link_commit_to_ticket

Link a git commit to a ticket for tracking.

```
link_commit_to_ticket(ticketId: string, commitHash: string, message?: string)
```

| Param        | Type    | Description                                   |
| ------------ | ------- | --------------------------------------------- |
| `ticketId`   | string  | Ticket ID                                     |
| `commitHash` | string  | Git commit hash (full or short)               |
| `message`    | string? | Commit message (auto-fetched if not provided) |

---

## File Tools

### link_files_to_ticket

Associate files with a ticket for context tracking.

```
link_files_to_ticket(ticketId: string, files: string[])
```

| Param      | Type     | Description                                |
| ---------- | -------- | ------------------------------------------ |
| `ticketId` | string   | Ticket ID                                  |
| `files`    | string[] | Array of file paths (relative or absolute) |

### get_tickets_for_file

Find tickets related to a specific file.

```
get_tickets_for_file(filePath: string, projectId?: string)
```

Useful for getting context when working on a file. Supports partial path matching.

---

## Health Tools

### get_database_health

Get comprehensive database health report.

```
get_database_health()
```

**Returns:**

- Database status (`healthy`, `warning`, `error`)
- Database path and size
- Last backup timestamp
- Integrity check result
- Lock file status
- Any detected issues

### get_environment

Detect which environment is calling the MCP server.

```
get_environment()
```

**Returns:**

- `environment`: `claude-code`, `vscode`, or `unknown`
- `workspacePath`: Current working directory
- `detectedProject`: Auto-detected project info

### get_project_settings

Get project settings including working method preference.

```
get_project_settings(projectId: string)
```

### update_project_settings

Update project working method preference.

```
update_project_settings(projectId: string, workingMethod: string)
```

| Param           | Type   | Description                        |
| --------------- | ------ | ---------------------------------- |
| `projectId`     | string | Project ID                         |
| `workingMethod` | string | `auto`, `claude-code`, or `vscode` |

---

## Common Workflows

### Starting a New Project

```
1. create_project("My App", "/home/user/my-app")
2. create_epic(projectId, "MVP Features")
3. create_ticket(projectId, "Add user login", "...", "high", epicId)
```

### Working on a Ticket

```
1. list_tickets(projectId, "ready")     # Find tickets ready to work on
2. start_ticket_work(ticketId)          # Creates branch, sets status
3. [implement the feature]
4. link_commit_to_ticket(ticketId, "abc123")
5. complete_ticket_work(ticketId, "Added login with OAuth support")
```

### Tracking Progress

```
add_ticket_comment(ticketId, "Halfway done, API endpoints complete", "claude", "progress")
get_ticket_comments(ticketId)
```

---

## Error Handling

All tools return structured responses:

**Success:**

```json
{
  "content": [{ "type": "text", "text": "Ticket created!..." }]
}
```

**Error:**

```json
{
  "content": [{ "type": "text", "text": "Project not found: abc123" }],
  "isError": true
}
```

Common errors:

- `Project not found` - Use `list_projects` to find valid IDs
- `Ticket not found` - Use `list_tickets` to find valid IDs
- `Database is busy` - Wait a moment and retry

---

## Telemetry Tools

AI telemetry tools capture full interaction data when Claude works on tickets - prompts, tool calls, timing, and more. This is essential for audit trails, debugging, cost tracking, and understanding AI work patterns.

### start_telemetry_session

Start a telemetry session for AI work on a ticket.

```
start_telemetry_session(ticketId?: string, projectPath?: string, environment?: string)
```

| Param         | Type    | Description                                           |
| ------------- | ------- | ----------------------------------------------------- |
| `ticketId`    | string? | Ticket ID (auto-detected from Ralph state if omitted) |
| `projectPath` | string? | Project path (auto-detected if omitted)               |
| `environment` | string? | Environment name (auto-detected if omitted)           |

**Returns:** Session ID for use in subsequent telemetry calls.

### log_prompt_event

Log a user prompt to the telemetry session.

```
log_prompt_event(sessionId: string, prompt: string, redact?: boolean, tokenCount?: number)
```

| Param        | Type     | Description                         |
| ------------ | -------- | ----------------------------------- |
| `sessionId`  | string   | The telemetry session ID            |
| `prompt`     | string   | The full prompt text                |
| `redact`     | boolean? | Hash the prompt for privacy         |
| `tokenCount` | number?  | Optional token count for the prompt |

### log_tool_event

Log a tool call to the telemetry session.

```
log_tool_event(sessionId: string, event: string, toolName: string, correlationId?: string, params?: object, result?: string, success?: boolean, durationMs?: number, error?: string)
```

| Param           | Type     | Description                                 |
| --------------- | -------- | ------------------------------------------- |
| `sessionId`     | string   | The telemetry session ID                    |
| `event`         | string   | `start` or `end`                            |
| `toolName`      | string   | Name of the tool (e.g., `Edit`, `Bash`)     |
| `correlationId` | string?  | ID to pair start/end events                 |
| `params`        | object?  | Parameter summary (sanitized)               |
| `result`        | string?  | Result summary (for `end` events)           |
| `success`       | boolean? | Whether the tool call succeeded             |
| `durationMs`    | number?  | Duration in milliseconds (for `end` events) |
| `error`         | string?  | Error message if failed                     |

### log_context_event

Log what context was loaded when starting ticket work.

```
log_context_event(sessionId: string, hasDescription: boolean, hasAcceptanceCriteria: boolean, criteriaCount: number, commentCount: number, attachmentCount: number, imageCount: number)
```

Creates an audit trail of what information the AI received when starting work.

### end_telemetry_session

End a telemetry session and compute final statistics.

```
end_telemetry_session(sessionId: string, outcome?: string, totalTokens?: number)
```

| Param         | Type    | Description                                     |
| ------------- | ------- | ----------------------------------------------- |
| `sessionId`   | string  | The telemetry session ID                        |
| `outcome`     | string? | `success`, `failure`, `timeout`, or `cancelled` |
| `totalTokens` | number? | Total token count for the session               |

### get_telemetry_session

Get telemetry data for a session.

```
get_telemetry_session(sessionId?: string, ticketId?: string, includeEvents?: boolean, eventLimit?: number)
```

| Param           | Type     | Description                           |
| --------------- | -------- | ------------------------------------- |
| `sessionId`     | string?  | The telemetry session ID              |
| `ticketId`      | string?  | Get recent session for a ticket       |
| `includeEvents` | boolean? | Include event details (default: true) |
| `eventLimit`    | number?  | Max events to return (default: 100)   |

### list_telemetry_sessions

List telemetry sessions with optional filters.

```
list_telemetry_sessions(ticketId?: string, projectId?: string, since?: string, limit?: number)
```

---

## Telemetry Hooks

Brain Dump includes optional Claude Code hooks that automatically capture telemetry:

| Hook             | File                         | Action                                            |
| ---------------- | ---------------------------- | ------------------------------------------------- |
| SessionStart     | `start-telemetry-session.sh` | Detects active ticket, prompts to start telemetry |
| UserPromptSubmit | `log-prompt-telemetry.sh`    | Logs user prompts                                 |
| PreToolUse       | `log-tool-telemetry.sh`      | Logs tool_start events                            |
| PostToolUse      | `log-tool-telemetry.sh`      | Logs tool_end events with duration                |
| Stop             | `end-telemetry-session.sh`   | Prompts to end telemetry session                  |

To enable telemetry hooks, run `scripts/setup-claude-code.sh` after updating.

### Privacy Considerations

- Prompts may contain sensitive data - enable `redact: true` to hash prompts
- Tool parameters are sanitized to avoid storing full file contents
- Telemetry respects existing retention settings
- Use `get_telemetry_session` to audit what data was captured
