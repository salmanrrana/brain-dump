# MCP Tools Reference

Brain Dump's MCP server exposes **9 tools** with **65 total actions**. Every tool uses an `action` parameter to dispatch operations. All tools are available in Claude Code, VS Code (Copilot), Cursor, and OpenCode.

## Quick Reference

| Tool                              | Actions | Description                                |
| --------------------------------- | ------- | ------------------------------------------ |
| [workflow](#workflow-6-actions)   | 6       | Ticket/epic lifecycle, git linking         |
| [ticket](#ticket-10-actions)      | 10      | CRUD, status, criteria, attachments, files |
| [session](#session-12-actions)    | 12      | Ralph sessions, events, claude-tasks       |
| [review](#review-8-actions)       | 8       | Findings, demos, human feedback            |
| [telemetry](#telemetry-7-actions) | 7       | AI interaction metrics                     |
| [comment](#comment-2-actions)     | 2       | Ticket comments and work summaries         |
| [epic](#epic-6-actions)           | 6       | Epic CRUD, learnings                       |
| [project](#project-4-actions)     | 4       | Project CRUD                               |
| [admin](#admin-10-actions)        | 10      | Health, settings, compliance logging       |

---

## workflow (6 actions)

Manage ticket and epic work lifecycle, plus git linking.

### start-work

Start working on a ticket. Creates a git branch, sets status to `in_progress`, posts a "Starting work" comment.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |

### complete-work

Complete implementation and move ticket to `ai_review`. Posts a work summary comment and updates the PRD.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |
| `summary`  | string | no       |

### start-epic

Start working on an epic. Creates an epic-level branch shared by all tickets.

| Param      | Type    | Required |
| ---------- | ------- | -------- |
| `epicId`   | string  | yes      |
| `createPr` | boolean | no       |

### link-commit

Link a git commit to a ticket.

| Param           | Type   | Required          |
| --------------- | ------ | ----------------- |
| `ticketId`      | string | yes               |
| `commitHash`    | string | yes               |
| `commitMessage` | string | no (auto-fetched) |

### link-pr

Link a GitHub PR to a ticket. Triggers PR status sync for all project tickets.

| Param      | Type                                      | Required            |
| ---------- | ----------------------------------------- | ------------------- |
| `ticketId` | string                                    | yes                 |
| `prNumber` | number                                    | yes                 |
| `prUrl`    | string                                    | no (auto-generated) |
| `prStatus` | `draft` \| `open` \| `merged` \| `closed` | no                  |

### sync-links

Auto-discover and link commits and PRs for the active ticket.

| Param         | Type   | Required             |
| ------------- | ------ | -------------------- |
| `projectPath` | string | no (defaults to cwd) |

---

## ticket (10 actions)

Manage tickets: CRUD, status updates, acceptance criteria, attachments, and file linking.

### create

Create a new ticket in the Backlog column.

| Param         | Type                        | Required |
| ------------- | --------------------------- | -------- |
| `projectId`   | string                      | yes      |
| `title`       | string                      | yes      |
| `description` | string                      | no       |
| `priority`    | `low` \| `medium` \| `high` | no       |
| `epicId`      | string                      | no       |
| `tags`        | string[]                    | no       |

### list

List tickets with optional filters.

| Param       | Type   | Required         |
| ----------- | ------ | ---------------- |
| `projectId` | string | no               |
| `status`    | string | no               |
| `limit`     | number | no (default: 20) |

### get

Get a single ticket by ID with full details.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |

### update-status

Move a ticket between columns.

| Param      | Type                                                                             | Required |
| ---------- | -------------------------------------------------------------------------------- | -------- |
| `ticketId` | string                                                                           | yes      |
| `status`   | `backlog` \| `ready` \| `in_progress` \| `ai_review` \| `human_review` \| `done` | yes      |

### delete

Delete a ticket and all its comments. Dry run by default.

| Param      | Type    | Required            |
| ---------- | ------- | ------------------- |
| `ticketId` | string  | yes                 |
| `confirm`  | boolean | no (default: false) |

### update-criterion

Update an acceptance criterion's status.

| Param              | Type                                           | Required |
| ------------------ | ---------------------------------------------- | -------- |
| `ticketId`         | string                                         | yes      |
| `criterionId`      | string                                         | yes      |
| `criterionStatus`  | `pending` \| `passed` \| `failed` \| `skipped` | yes      |
| `verificationNote` | string                                         | no       |

### update-attachment

Update metadata for a ticket attachment.

| Param                   | Type                         | Required |
| ----------------------- | ---------------------------- | -------- |
| `ticketId`              | string                       | yes      |
| `attachmentId`          | string                       | yes      |
| `attachmentType`        | string                       | no       |
| `attachmentDescription` | string                       | no       |
| `attachmentPriority`    | `primary` \| `supplementary` | no       |
| `linkedCriteria`        | string[]                     | no       |

### list-by-epic

List all tickets in a specific epic.

| Param       | Type   | Required          |
| ----------- | ------ | ----------------- |
| `epicId`    | string | yes               |
| `projectId` | string | no                |
| `status`    | string | no                |
| `limit`     | number | no (default: 100) |

### link-files

Associate files with a ticket for context tracking.

| Param      | Type     | Required |
| ---------- | -------- | -------- |
| `ticketId` | string   | yes      |
| `files`    | string[] | yes      |

### get-files

Find tickets related to a file. Supports partial path matching.

| Param       | Type   | Required |
| ----------- | ------ | -------- |
| `filePath`  | string | yes      |
| `projectId` | string | no       |

---

## session (12 actions)

Manage Ralph sessions, events, and Claude task lists.

### create

Create a new Ralph session for a ticket. Starts in `idle` state.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |

### update-state

Transition the session through work phases: `idle` → `analyzing` → `implementing` → `testing` → `committing` → `reviewing` → `done`.

| Param           | Type   | Required |
| --------------- | ------ | -------- |
| `sessionId`     | string | yes      |
| `state`         | string | yes      |
| `stateMetadata` | object | no       |

### complete

Complete a Ralph session with an outcome.

| Param          | Type                                               | Required |
| -------------- | -------------------------------------------------- | -------- |
| `sessionId`    | string                                             | yes      |
| `outcome`      | `success` \| `failure` \| `timeout` \| `cancelled` | yes      |
| `errorMessage` | string                                             | no       |

### get

Get the current state of a session.

| Param       | Type   | Required                 |
| ----------- | ------ | ------------------------ |
| `sessionId` | string | either this or ticketId  |
| `ticketId`  | string | either this or sessionId |

### list

List all Ralph sessions for a ticket.

| Param      | Type   | Required         |
| ---------- | ------ | ---------------- |
| `ticketId` | string | yes              |
| `limit`    | number | no (default: 10) |

### emit-event

Emit a real-time event for UI streaming during Ralph sessions.

| Param       | Type                                                                                                 | Required |
| ----------- | ---------------------------------------------------------------------------------------------------- | -------- |
| `sessionId` | string                                                                                               | yes      |
| `eventType` | `thinking` \| `tool_start` \| `tool_end` \| `file_change` \| `progress` \| `state_change` \| `error` | yes      |
| `eventData` | object                                                                                               | no       |

### get-events

Get events for a Ralph session.

| Param       | Type         | Required         |
| ----------- | ------------ | ---------------- |
| `sessionId` | string       | yes              |
| `since`     | string (ISO) | no               |
| `limit`     | number       | no (default: 50) |

### clear-events

Clear events for a completed session.

| Param       | Type   | Required |
| ----------- | ------ | -------- |
| `sessionId` | string | yes      |

### save-tasks

Save Claude's task list to a ticket.

| Param            | Type    | Required           |
| ---------------- | ------- | ------------------ |
| `ticketId`       | string  | no (auto-detected) |
| `tasks`          | array   | yes                |
| `createSnapshot` | boolean | no                 |

Each task: `{ subject: string, status: "pending" | "in_progress" | "completed", activeForm?: string, description?: string }`

### get-tasks

Retrieve Claude's tasks for a ticket.

| Param            | Type    | Required           |
| ---------------- | ------- | ------------------ |
| `ticketId`       | string  | no (auto-detected) |
| `includeHistory` | boolean | no                 |

### clear-tasks

Clear all Claude tasks for a ticket. Creates a snapshot before clearing.

| Param      | Type   | Required           |
| ---------- | ------ | ------------------ |
| `ticketId` | string | no (auto-detected) |

### get-task-snapshots

Get historical snapshots of Claude's task list.

| Param      | Type   | Required         |
| ---------- | ------ | ---------------- |
| `ticketId` | string | yes              |
| `limit`    | number | no (default: 10) |

---

## review (8 actions)

Manage code review findings, demos, and human feedback.

### submit-finding

Submit a finding from a code review. Ticket must be in `ai_review` status.

| Param          | Type                                                            | Required |
| -------------- | --------------------------------------------------------------- | -------- |
| `ticketId`     | string                                                          | yes      |
| `agent`        | `code-reviewer` \| `silent-failure-hunter` \| `code-simplifier` | yes      |
| `severity`     | `critical` \| `major` \| `minor` \| `suggestion`                | yes      |
| `category`     | string                                                          | yes      |
| `description`  | string                                                          | yes      |
| `filePath`     | string                                                          | no       |
| `lineNumber`   | number                                                          | no       |
| `suggestedFix` | string                                                          | no       |

### mark-fixed

Mark a review finding as fixed, won't fix, or duplicate.

| Param            | Type                                 | Required |
| ---------------- | ------------------------------------ | -------- |
| `findingId`      | string                               | yes      |
| `fixStatus`      | `fixed` \| `wont_fix` \| `duplicate` | yes      |
| `fixDescription` | string                               | no       |

### get-findings

Get review findings for a ticket with optional filtering.

| Param      | Type                                             | Required |
| ---------- | ------------------------------------------------ | -------- |
| `ticketId` | string                                           | yes      |
| `status`   | `open` \| `fixed` \| `wont_fix` \| `duplicate`   | no       |
| `severity` | `critical` \| `major` \| `minor` \| `suggestion` | no       |
| `agent`    | string                                           | no       |

### check-complete

Check if all critical/major findings are resolved.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |

Returns `{ canProceedToHumanReview: true/false }`.

### generate-demo

Generate a demo script for human review. Moves ticket to `human_review`.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |
| `steps`    | array  | yes      |

Each step: `{ order: number, description: string, expectedOutcome: string, type: "manual" | "visual" | "automated" }`

### get-demo

Get the demo script for a ticket.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |

### update-demo-step

Update a single demo step's status during human review.

| Param          | Type                                           | Required |
| -------------- | ---------------------------------------------- | -------- |
| `demoScriptId` | string                                         | yes      |
| `stepOrder`    | number                                         | yes      |
| `stepStatus`   | `pending` \| `passed` \| `failed` \| `skipped` | yes      |
| `notes`        | string                                         | no       |

### submit-feedback

Submit final demo feedback from human reviewer.

| Param         | Type    | Required |
| ------------- | ------- | -------- |
| `ticketId`    | string  | yes      |
| `passed`      | boolean | yes      |
| `feedback`    | string  | yes      |
| `stepResults` | array   | no       |

---

## telemetry (7 actions)

Capture AI interaction metrics for observability and audit trails.

### start

Start a telemetry session for AI work on a ticket.

| Param         | Type   | Required           |
| ------------- | ------ | ------------------ |
| `ticketId`    | string | no (auto-detected) |
| `projectPath` | string | no                 |
| `environment` | string | no                 |

### log-prompt

Log a user prompt to the telemetry session.

| Param        | Type    | Required |
| ------------ | ------- | -------- |
| `sessionId`  | string  | yes      |
| `prompt`     | string  | yes      |
| `redact`     | boolean | no       |
| `tokenCount` | number  | no       |

### log-tool

Log a tool call to the telemetry session.

| Param           | Type             | Required |
| --------------- | ---------------- | -------- |
| `sessionId`     | string           | yes      |
| `event`         | `start` \| `end` | yes      |
| `toolName`      | string           | yes      |
| `correlationId` | string           | no       |
| `params`        | object           | no       |
| `result`        | string           | no       |
| `success`       | boolean          | no       |
| `durationMs`    | number           | no       |
| `error`         | string           | no       |

### log-context

Log what context was loaded when starting ticket work.

| Param                   | Type    | Required |
| ----------------------- | ------- | -------- |
| `sessionId`             | string  | yes      |
| `hasDescription`        | boolean | yes      |
| `hasAcceptanceCriteria` | boolean | yes      |
| `criteriaCount`         | number  | no       |
| `commentCount`          | number  | no       |
| `attachmentCount`       | number  | no       |
| `imageCount`            | number  | no       |

### end

End a telemetry session and compute final statistics.

| Param         | Type                                               | Required |
| ------------- | -------------------------------------------------- | -------- |
| `sessionId`   | string                                             | yes      |
| `outcome`     | `success` \| `failure` \| `timeout` \| `cancelled` | no       |
| `totalTokens` | number                                             | no       |

### get

Get telemetry data for a session.

| Param           | Type    | Required                 |
| --------------- | ------- | ------------------------ |
| `sessionId`     | string  | either this or ticketId  |
| `ticketId`      | string  | either this or sessionId |
| `includeEvents` | boolean | no (default: true)       |
| `eventLimit`    | number  | no (default: 100)        |

### list

List telemetry sessions with optional filters.

| Param       | Type         | Required         |
| ----------- | ------------ | ---------------- |
| `ticketId`  | string       | no               |
| `projectId` | string       | no               |
| `since`     | string (ISO) | no               |
| `limit`     | number       | no (default: 20) |

---

## comment (2 actions)

Manage ticket comments and work summaries.

### add

Add a comment, work summary, or test report to a ticket.

| Param         | Type                                                                        | Required |
| ------------- | --------------------------------------------------------------------------- | -------- |
| `ticketId`    | string                                                                      | yes      |
| `content`     | string                                                                      | yes      |
| `author`      | `claude` \| `ralph` \| `user` \| `opencode` \| `cursor` \| `vscode` \| `ai` | no       |
| `commentType` | `comment` \| `work_summary` \| `test_report` \| `progress`                  | no       |

### list

Get all comments for a ticket, newest first.

| Param      | Type   | Required |
| ---------- | ------ | -------- |
| `ticketId` | string | yes      |

---

## epic (6 actions)

Manage epics and cross-ticket learnings.

### create

Create a new epic to group related tickets.

| Param         | Type   | Required |
| ------------- | ------ | -------- |
| `projectId`   | string | yes      |
| `title`       | string | yes      |
| `description` | string | no       |
| `color`       | string | no       |

### list

List all epics for a project.

| Param       | Type   | Required |
| ----------- | ------ | -------- |
| `projectId` | string | yes      |

### update

Update an epic's title, description, or color.

| Param         | Type   | Required |
| ------------- | ------ | -------- |
| `epicId`      | string | yes      |
| `title`       | string | no       |
| `description` | string | no       |
| `color`       | string | no       |

### delete

Delete an epic. Tickets are unlinked but not deleted. Dry run by default.

| Param     | Type    | Required            |
| --------- | ------- | ------------------- |
| `epicId`  | string  | yes                 |
| `confirm` | boolean | no (default: false) |

### reconcile-learnings

Extract and reconcile learnings from a completed ticket.

| Param        | Type    | Required |
| ------------ | ------- | -------- |
| `ticketId`   | string  | yes      |
| `learnings`  | array   | yes      |
| `updateDocs` | boolean | no       |

Each learning: `{ type: "pattern" | "anti-pattern" | "tool-usage" | "workflow", description: string, suggestedUpdate?: { file, section, content } }`

### get-learnings

Get all accumulated learnings for an epic.

| Param    | Type   | Required |
| -------- | ------ | -------- |
| `epicId` | string | yes      |

---

## project (4 actions)

Manage project registrations.

### list

List all registered projects.

No additional params required.

### find-by-path

Find a project by filesystem path.

| Param  | Type   | Required |
| ------ | ------ | -------- |
| `path` | string | yes      |

### create

Register a new project.

| Param   | Type   | Required |
| ------- | ------ | -------- |
| `name`  | string | yes      |
| `path`  | string | yes      |
| `color` | string | no       |

### delete

Delete a project and ALL its data. Dry run by default.

| Param       | Type    | Required            |
| ----------- | ------- | ------------------- |
| `projectId` | string  | yes                 |
| `confirm`   | boolean | no (default: false) |

---

## admin (10 actions)

Database health, project settings, and compliance logging.

### health

Get comprehensive database health report: status, size, backups, integrity.

No additional params required.

### environment

Detect which environment is calling the MCP server (`claude-code`, `vscode`, or `unknown`).

No additional params required.

### settings

Get project settings including working method preference.

| Param       | Type   | Required |
| ----------- | ------ | -------- |
| `projectId` | string | yes      |

### update-settings

Update project working method preference.

| Param           | Type                                | Required |
| --------------- | ----------------------------------- | -------- |
| `projectId`     | string                              | yes      |
| `workingMethod` | `auto` \| `claude-code` \| `vscode` | yes      |

### start-conversation

Start a compliance logging session.

| Param                | Type                                                     | Required |
| -------------------- | -------------------------------------------------------- | -------- |
| `projectId`          | string                                                   | no       |
| `ticketId`           | string                                                   | no       |
| `userId`             | string                                                   | no       |
| `dataClassification` | `public` \| `internal` \| `confidential` \| `restricted` | no       |
| `metadata`           | object                                                   | no       |

### log-message

Log a message with tamper detection and secret scanning.

| Param        | Type                                        | Required |
| ------------ | ------------------------------------------- | -------- |
| `sessionId`  | string                                      | yes      |
| `role`       | `user` \| `assistant` \| `system` \| `tool` | yes      |
| `content`    | string                                      | yes      |
| `toolCalls`  | array                                       | no       |
| `tokenCount` | number                                      | no       |
| `modelId`    | string                                      | no       |

### end-conversation

End a compliance session. No more messages can be logged.

| Param       | Type   | Required |
| ----------- | ------ | -------- |
| `sessionId` | string | yes      |

### list-conversations

Query compliance sessions with filters.

| Param           | Type         | Required         |
| --------------- | ------------ | ---------------- |
| `projectId`     | string       | no               |
| `ticketId`      | string       | no               |
| `environment`   | string       | no               |
| `startDate`     | string (ISO) | no               |
| `endDate`       | string (ISO) | no               |
| `includeActive` | boolean      | no               |
| `limit`         | number       | no (default: 50) |

### export-logs

Generate JSON export for compliance auditors. Access is logged.

| Param             | Type         | Required |
| ----------------- | ------------ | -------- |
| `startDate`       | string (ISO) | yes      |
| `endDate`         | string (ISO) | yes      |
| `sessionId`       | string       | no       |
| `projectId`       | string       | no       |
| `includeContent`  | boolean      | no       |
| `verifyIntegrity` | boolean      | no       |

### archive-sessions

Delete sessions older than retention period. Dry run by default. Legal hold sessions are never deleted.

| Param           | Type    | Required            |
| --------------- | ------- | ------------------- |
| `retentionDays` | number  | no (default: 90)    |
| `confirm`       | boolean | no (default: false) |

---

## Common Workflows

### Starting a New Project

```
project  action: "create"       name: "My App"  path: "/home/user/my-app"
epic     action: "create"       projectId: "..."  title: "MVP Features"
ticket   action: "create"       projectId: "..."  title: "Add user login"  priority: "high"  epicId: "..."
```

### Working on a Ticket

```
1. ticket    action: "list"          projectId: "..."  status: "ready"
2. workflow  action: "start-work"    ticketId: "..."
3. [implement the feature]
4. workflow  action: "sync-links"
5. workflow  action: "complete-work"  ticketId: "..."  summary: "Added login with OAuth"
```

### AI Review Cycle

```
1. review  action: "submit-finding"  ticketId: "..."  agent: "code-reviewer"  severity: "major"  ...
2. [fix the issue]
3. review  action: "mark-fixed"      findingId: "..."  fixStatus: "fixed"
4. review  action: "check-complete"  ticketId: "..."
5. review  action: "generate-demo"   ticketId: "..."  steps: [...]
```

### Tracking Progress

```
comment  action: "add"   ticketId: "..."  content: "API endpoints complete"  author: "claude"  commentType: "progress"
comment  action: "list"  ticketId: "..."
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

- `Project not found` — Use `project` tool, `action: "list"` to find valid IDs
- `Ticket not found` — Use `ticket` tool, `action: "list"` to find valid IDs
- `Database is busy` — Wait a moment and retry

---

## Telemetry Hooks

Brain Dump includes optional Claude Code hooks that automatically capture telemetry:

| Hook             | Type                         | Action                                            |
| ---------------- | ---------------------------- | ------------------------------------------------- |
| SessionStart     | `start-telemetry-session.sh` | Detects active ticket, prompts to start telemetry |
| UserPromptSubmit | `log-prompt-telemetry.sh`    | Logs user prompts                                 |
| PreToolUse       | `log-tool-telemetry.sh`      | Logs tool_start events                            |
| PostToolUse      | `log-tool-telemetry.sh`      | Logs tool_end events with duration                |
| Stop             | `end-telemetry-session.sh`   | Prompts to end telemetry session                  |

To enable telemetry hooks, run `scripts/setup-claude-code.sh`.

### Privacy

- Prompts may contain sensitive data — enable `redact: true` to hash prompts
- Tool parameters are sanitized to avoid storing full file contents
- Telemetry respects existing retention settings
- Use `telemetry` tool, `action: "get"` to audit captured data
