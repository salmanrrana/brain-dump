/**
 * Command metadata registry.
 *
 * Single flat array of CommandDef objects — the machine-readable source of truth
 * for all CLI commands. Used by help output, shell completions, and docs generation.
 *
 * No decorators, no class hierarchy — just typed data.
 */

// ── Types ──────────────────────────────────────────────────────

export interface FlagDef {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  required: boolean;
  description: string;
  enum?: string[];
}

export interface CommandDef {
  resource: string;
  action: string;
  description: string;
  flags: FlagDef[];
  examples?: string[];
  aliases?: string[];
}

// ── Shared flags ───────────────────────────────────────────────

const prettyFlag: FlagDef = {
  name: "pretty",
  type: "boolean",
  required: false,
  description: "Human-readable output (default: JSON)",
};

const projectFlag: FlagDef = {
  name: "project",
  type: "string",
  required: false,
  description: "Project ID",
};

const ticketFlag: FlagDef = {
  name: "ticket",
  type: "string",
  required: true,
  description: "Ticket ID",
};

const sessionFlag: FlagDef = {
  name: "session",
  type: "string",
  required: true,
  description: "Session ID",
};

const limitFlag: FlagDef = {
  name: "limit",
  type: "number",
  required: false,
  description: "Max results",
};

const confirmFlag: FlagDef = {
  name: "confirm",
  type: "boolean",
  required: false,
  description: "Confirm destructive action",
};

// ── Registry ───────────────────────────────────────────────────

export const COMMAND_REGISTRY: CommandDef[] = [
  // ── project ────────────────────────────────────────────────
  {
    resource: "project",
    action: "list",
    description: "List all registered projects",
    flags: [prettyFlag],
    examples: ["brain-dump project list --pretty"],
  },
  {
    resource: "project",
    action: "find",
    description: "Find a project by filesystem path",
    flags: [
      { name: "path", type: "string", required: true, description: "Filesystem path" },
      prettyFlag,
    ],
    examples: ["brain-dump project find --path /home/user/my-project"],
  },
  {
    resource: "project",
    action: "create",
    description: "Register a new project directory",
    flags: [
      { name: "name", type: "string", required: true, description: "Project name" },
      { name: "path", type: "string", required: true, description: "Filesystem path" },
      { name: "color", type: "string", required: false, description: "Color hex (e.g. #3b82f6)" },
      prettyFlag,
    ],
    examples: ['brain-dump project create --name "My App" --path /home/user/my-app'],
  },
  {
    resource: "project",
    action: "delete",
    description: "Delete a project and all associated data (dry-run by default)",
    flags: [{ ...projectFlag, required: true }, confirmFlag, prettyFlag],
    examples: ["brain-dump project delete --project abc --confirm"],
  },

  // ── ticket ─────────────────────────────────────────────────
  {
    resource: "ticket",
    action: "create",
    description: "Create a new ticket",
    flags: [
      { ...projectFlag, required: true },
      { name: "title", type: "string", required: true, description: "Ticket title" },
      { name: "description", type: "string", required: false, description: "Description" },
      {
        name: "priority",
        type: "enum",
        required: false,
        description: "Priority level",
        enum: ["low", "medium", "high"],
      },
      { name: "epic", type: "string", required: false, description: "Epic ID" },
      { name: "tags", type: "string", required: false, description: "Comma-separated tags" },
      prettyFlag,
    ],
    examples: ['brain-dump ticket create --project abc --title "Fix bug" --priority high'],
  },
  {
    resource: "ticket",
    action: "list",
    description: "List tickets with optional filters",
    flags: [projectFlag, limitFlag, prettyFlag],
    examples: [
      "brain-dump ticket list --pretty",
      "brain-dump ticket list --project abc --limit 10",
    ],
  },
  {
    resource: "ticket",
    action: "get",
    description: "Get full ticket details",
    flags: [ticketFlag, prettyFlag],
    examples: ["brain-dump ticket get --ticket abc --pretty"],
  },
  {
    resource: "ticket",
    action: "update",
    description: "Update ticket fields (title, description, status, priority, tags, epic)",
    flags: [
      ticketFlag,
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "description", type: "string", required: false, description: "New description" },
      {
        name: "status",
        type: "enum",
        required: false,
        description: "Ticket status",
        enum: ["backlog", "ready", "in_progress", "ai_review", "human_review", "done"],
      },
      {
        name: "priority",
        type: "enum",
        required: false,
        description: "Priority",
        enum: ["low", "medium", "high"],
      },
      { name: "epic", type: "string", required: false, description: "Epic ID" },
      { name: "tags", type: "string", required: false, description: "Comma-separated tags" },
      prettyFlag,
    ],
    examples: [
      "brain-dump ticket update --ticket abc --status done",
      'brain-dump ticket update --ticket abc --title "New Title" --priority high',
    ],
  },
  {
    resource: "ticket",
    action: "update-status",
    description: "Update ticket status (MCP naming alias)",
    flags: [
      ticketFlag,
      {
        name: "status",
        type: "enum",
        required: true,
        description: "Ticket status",
        enum: ["backlog", "ready", "in_progress", "ai_review", "human_review", "done"],
      },
      prettyFlag,
    ],
  },
  {
    resource: "ticket",
    action: "update-criterion",
    description: "Update an acceptance criterion status",
    flags: [
      ticketFlag,
      { name: "criterion", type: "string", required: true, description: "Criterion ID" },
      {
        name: "criterion-status",
        type: "enum",
        required: true,
        description: "Criterion status",
        enum: ["pending", "passed", "failed", "skipped"],
      },
      { name: "note", type: "string", required: false, description: "Verification note" },
      prettyFlag,
    ],
  },
  {
    resource: "ticket",
    action: "update-attachment",
    description: "Update attachment metadata",
    flags: [
      ticketFlag,
      {
        name: "attachment",
        type: "string",
        required: true,
        description: "Attachment ID or filename",
      },
      { name: "attachment-type", type: "string", required: false, description: "Attachment type" },
      {
        name: "attachment-description",
        type: "string",
        required: false,
        description: "Description",
      },
      {
        name: "attachment-priority",
        type: "enum",
        required: false,
        description: "Priority",
        enum: ["primary", "supplementary"],
      },
      {
        name: "linked-criteria",
        type: "string",
        required: false,
        description: "Comma-separated criterion IDs",
      },
      prettyFlag,
    ],
  },
  {
    resource: "ticket",
    action: "list-by-epic",
    description: "List tickets in an epic",
    flags: [
      { name: "epic", type: "string", required: true, description: "Epic ID" },
      projectFlag,
      {
        name: "status",
        type: "enum",
        required: false,
        description: "Filter by status",
        enum: ["backlog", "ready", "in_progress", "ai_review", "human_review", "done"],
      },
      limitFlag,
      prettyFlag,
    ],
    examples: ["brain-dump ticket list-by-epic --epic abc --pretty"],
  },
  {
    resource: "ticket",
    action: "link-files",
    description: "Link file paths to a ticket",
    flags: [
      ticketFlag,
      { name: "files", type: "string", required: true, description: "Comma-separated file paths" },
      prettyFlag,
    ],
  },
  {
    resource: "ticket",
    action: "get-files",
    description: "Find tickets linked to a file path",
    flags: [
      { name: "file", type: "string", required: true, description: "File path" },
      projectFlag,
      prettyFlag,
    ],
  },
  {
    resource: "ticket",
    action: "delete",
    description: "Delete a ticket (dry-run by default)",
    flags: [ticketFlag, confirmFlag, prettyFlag],
    examples: ["brain-dump ticket delete --ticket abc --confirm"],
  },

  // ── epic ───────────────────────────────────────────────────
  {
    resource: "epic",
    action: "create",
    description: "Create a new epic",
    flags: [
      { ...projectFlag, required: true },
      { name: "title", type: "string", required: true, description: "Epic title" },
      { name: "description", type: "string", required: false, description: "Description" },
      { name: "color", type: "string", required: false, description: "Color hex (e.g. #3b82f6)" },
      prettyFlag,
    ],
    examples: ['brain-dump epic create --project abc --title "Auth System" --color "#3b82f6"'],
  },
  {
    resource: "epic",
    action: "list",
    description: "List epics for a project",
    flags: [{ ...projectFlag, required: true }, prettyFlag],
    examples: ["brain-dump epic list --project abc --pretty"],
  },
  {
    resource: "epic",
    action: "update",
    description: "Update epic title, description, or color",
    flags: [
      { name: "epic", type: "string", required: true, description: "Epic ID" },
      { name: "title", type: "string", required: false, description: "New title" },
      { name: "description", type: "string", required: false, description: "New description" },
      { name: "color", type: "string", required: false, description: "New color hex" },
      prettyFlag,
    ],
    examples: ['brain-dump epic update --epic abc --title "New Title"'],
  },
  {
    resource: "epic",
    action: "delete",
    description: "Delete an epic (dry-run by default)",
    flags: [
      { name: "epic", type: "string", required: true, description: "Epic ID" },
      confirmFlag,
      prettyFlag,
    ],
    examples: ["brain-dump epic delete --epic abc --confirm"],
  },
  {
    resource: "epic",
    action: "reconcile-learnings",
    description: "Extract and store learnings from a completed ticket",
    flags: [
      ticketFlag,
      {
        name: "learnings-file",
        type: "string",
        required: true,
        description: "Path to JSON file with learning objects",
      },
      {
        name: "update-docs",
        type: "boolean",
        required: false,
        description: "Apply suggested documentation updates",
      },
      prettyFlag,
    ],
    examples: [
      "brain-dump epic reconcile-learnings --ticket abc --learnings-file ./learnings.json",
    ],
  },
  {
    resource: "epic",
    action: "get-learnings",
    description: "Get accumulated learnings for an epic",
    flags: [{ name: "epic", type: "string", required: true, description: "Epic ID" }, prettyFlag],
    examples: ["brain-dump epic get-learnings --epic abc --pretty"],
  },

  // ── workflow ────────────────────────────────────────────────
  {
    resource: "workflow",
    action: "start-work",
    description: "Start work on a ticket (creates branch, updates status)",
    flags: [ticketFlag, prettyFlag],
    examples: ["brain-dump workflow start-work --ticket abc"],
  },
  {
    resource: "workflow",
    action: "complete-work",
    description: "Complete work on a ticket (moves to ai_review)",
    flags: [
      ticketFlag,
      { name: "summary", type: "string", required: false, description: "Work summary" },
      prettyFlag,
    ],
    examples: ['brain-dump workflow complete-work --ticket abc --summary "Implemented feature"'],
  },
  {
    resource: "workflow",
    action: "start-epic",
    description: "Start work on an epic (creates shared branch)",
    flags: [
      { name: "epic", type: "string", required: true, description: "Epic ID" },
      { name: "create-pr", type: "boolean", required: false, description: "Create draft PR" },
      prettyFlag,
    ],
    examples: ["brain-dump workflow start-epic --epic abc --create-pr"],
  },

  // ── comment ────────────────────────────────────────────────
  {
    resource: "comment",
    action: "add",
    description: "Add a comment to a ticket",
    flags: [
      ticketFlag,
      { name: "content", type: "string", required: true, description: "Comment content" },
      {
        name: "type",
        type: "enum",
        required: false,
        description: "Comment type",
        enum: ["comment", "work_summary", "test_report", "progress"],
      },
      {
        name: "author",
        type: "enum",
        required: false,
        description: "Comment author",
        enum: ["claude", "ralph", "user", "opencode", "cursor", "vscode", "ai"],
      },
      prettyFlag,
    ],
    examples: ['brain-dump comment add --ticket abc --content "Fixed the bug"'],
  },
  {
    resource: "comment",
    action: "list",
    description: "List comments for a ticket",
    flags: [ticketFlag, prettyFlag],
    examples: ["brain-dump comment list --ticket abc --pretty"],
  },

  // ── review ─────────────────────────────────────────────────
  {
    resource: "review",
    action: "submit-finding",
    description: "Submit a review finding for a ticket",
    flags: [
      ticketFlag,
      {
        name: "agent",
        type: "enum",
        required: true,
        description: "Review agent",
        enum: ["code-reviewer", "silent-failure-hunter", "code-simplifier"],
      },
      {
        name: "severity",
        type: "enum",
        required: true,
        description: "Finding severity",
        enum: ["critical", "major", "minor", "suggestion"],
      },
      { name: "category", type: "string", required: true, description: "Finding category" },
      { name: "description", type: "string", required: true, description: "Finding description" },
      { name: "file", type: "string", required: false, description: "File path" },
      { name: "line", type: "number", required: false, description: "Line number" },
      { name: "fix", type: "string", required: false, description: "Suggested fix" },
      prettyFlag,
    ],
  },
  {
    resource: "review",
    action: "mark-fixed",
    description: "Mark a review finding as fixed, wont_fix, or duplicate",
    flags: [
      { name: "finding", type: "string", required: true, description: "Finding ID" },
      {
        name: "status",
        type: "enum",
        required: true,
        description: "Fix status",
        enum: ["fixed", "wont_fix", "duplicate"],
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "How it was fixed",
      },
      prettyFlag,
    ],
  },
  {
    resource: "review",
    action: "check-complete",
    description: "Check if all critical/major findings are resolved",
    flags: [ticketFlag, prettyFlag],
  },
  {
    resource: "review",
    action: "generate-demo",
    description: "Generate a demo script for human review",
    flags: [
      ticketFlag,
      {
        name: "steps-file",
        type: "string",
        required: true,
        description: "JSON file with demo steps",
      },
      prettyFlag,
    ],
  },
  {
    resource: "review",
    action: "get-demo",
    description: "Get the demo script for a ticket",
    flags: [ticketFlag, prettyFlag],
  },
  {
    resource: "review",
    action: "submit-feedback",
    description: "Submit demo feedback (human reviewer only)",
    flags: [
      ticketFlag,
      { name: "passed", type: "boolean", required: true, description: "Whether demo passed" },
      { name: "feedback", type: "string", required: true, description: "Reviewer feedback" },
      prettyFlag,
    ],
  },
  {
    resource: "review",
    action: "update-demo-step",
    description: "Update a demo step status during human review",
    flags: [
      {
        name: "demo-script",
        type: "string",
        required: true,
        description: "Demo script ID",
      },
      {
        name: "step-order",
        type: "number",
        required: true,
        description: "Step order number",
      },
      {
        name: "step-status",
        type: "enum",
        required: true,
        description: "Step status",
        enum: ["pending", "passed", "failed", "skipped"],
      },
      {
        name: "step-notes",
        type: "string",
        required: false,
        description: "Reviewer notes",
      },
      prettyFlag,
    ],
    examples: [
      "brain-dump review update-demo-step --demo-script abc --step-order 1 --step-status passed",
    ],
  },
  {
    resource: "review",
    action: "get-findings",
    description: "Get review findings for a ticket",
    flags: [
      ticketFlag,
      {
        name: "status",
        type: "enum",
        required: false,
        description: "Filter by status",
        enum: ["open", "fixed", "wont_fix", "duplicate"],
      },
      {
        name: "severity",
        type: "enum",
        required: false,
        description: "Filter by severity",
        enum: ["critical", "major", "minor", "suggestion"],
      },
      {
        name: "agent",
        type: "enum",
        required: false,
        description: "Filter by agent",
        enum: ["code-reviewer", "silent-failure-hunter", "code-simplifier"],
      },
      prettyFlag,
    ],
  },

  // ── session ────────────────────────────────────────────────
  {
    resource: "session",
    action: "create",
    description: "Create a new Ralph session",
    flags: [ticketFlag, prettyFlag],
  },
  {
    resource: "session",
    action: "update",
    description: "Update session state",
    flags: [
      sessionFlag,
      {
        name: "state",
        type: "enum",
        required: true,
        description: "Session state",
        enum: ["idle", "analyzing", "implementing", "testing", "committing", "reviewing", "done"],
      },
      { name: "message", type: "string", required: false, description: "State metadata message" },
      prettyFlag,
    ],
  },
  {
    resource: "session",
    action: "complete",
    description: "Complete a Ralph session",
    flags: [
      sessionFlag,
      {
        name: "outcome",
        type: "enum",
        required: true,
        description: "Session outcome",
        enum: ["success", "failure", "timeout", "cancelled"],
      },
      { name: "error", type: "string", required: false, description: "Error message" },
      prettyFlag,
    ],
  },
  {
    resource: "session",
    action: "get",
    description: "Get session details",
    flags: [{ ...sessionFlag, required: false }, { ...ticketFlag, required: false }, prettyFlag],
  },
  {
    resource: "session",
    action: "list",
    description: "List sessions for a ticket",
    flags: [ticketFlag, limitFlag, prettyFlag],
  },
  {
    resource: "session",
    action: "update-state",
    description: "Update session state (MCP naming alias)",
    flags: [
      sessionFlag,
      {
        name: "state",
        type: "enum",
        required: true,
        description: "Session state",
        enum: ["idle", "analyzing", "implementing", "testing", "committing", "reviewing", "done"],
      },
      { name: "message", type: "string", required: false, description: "State metadata message" },
      prettyFlag,
    ],
    aliases: ["update"],
  },
  {
    resource: "session",
    action: "emit-event",
    description: "Emit a real-time event for UI streaming",
    flags: [
      sessionFlag,
      {
        name: "event-type",
        type: "enum",
        required: true,
        description: "Event type",
        enum: [
          "thinking",
          "tool_start",
          "tool_end",
          "file_change",
          "progress",
          "state_change",
          "error",
        ],
      },
      {
        name: "event-data-file",
        type: "string",
        required: false,
        description: "Path to JSON file with event data",
      },
      prettyFlag,
    ],
    examples: ["brain-dump session emit-event --session abc --event-type progress"],
  },
  {
    resource: "session",
    action: "get-events",
    description: "Get events for a session",
    flags: [
      sessionFlag,
      { name: "since", type: "string", required: false, description: "ISO timestamp filter" },
      limitFlag,
      prettyFlag,
    ],
    examples: ["brain-dump session get-events --session abc --limit 10 --pretty"],
  },
  {
    resource: "session",
    action: "clear-events",
    description: "Clear all events for a session",
    flags: [sessionFlag, prettyFlag],
  },

  // ── git ────────────────────────────────────────────────────
  {
    resource: "git",
    action: "link-commit",
    description: "Link a git commit to a ticket",
    flags: [
      ticketFlag,
      { name: "hash", type: "string", required: true, description: "Git commit hash" },
      { name: "message", type: "string", required: false, description: "Commit message" },
      prettyFlag,
    ],
  },
  {
    resource: "git",
    action: "link-pr",
    description: "Link a GitHub PR to a ticket",
    flags: [
      ticketFlag,
      { name: "pr", type: "number", required: true, description: "PR number" },
      { name: "url", type: "string", required: false, description: "PR URL" },
      {
        name: "status",
        type: "enum",
        required: false,
        description: "PR status",
        enum: ["draft", "open", "merged", "closed"],
      },
      prettyFlag,
    ],
  },
  {
    resource: "git",
    action: "sync",
    description: "Auto-discover and link commits/PRs to active ticket",
    flags: [
      { name: "project-path", type: "string", required: false, description: "Project path" },
      prettyFlag,
    ],
  },

  // ── telemetry ──────────────────────────────────────────────
  {
    resource: "telemetry",
    action: "start",
    description: "Start a telemetry session",
    flags: [
      { ...ticketFlag, required: false },
      { name: "project", type: "string", required: false, description: "Project path" },
      prettyFlag,
    ],
  },
  {
    resource: "telemetry",
    action: "end",
    description: "End a telemetry session",
    flags: [
      sessionFlag,
      {
        name: "outcome",
        type: "enum",
        required: false,
        description: "Session outcome",
        enum: ["success", "failure", "timeout", "cancelled"],
      },
      { name: "tokens", type: "number", required: false, description: "Total token count" },
      prettyFlag,
    ],
  },
  {
    resource: "telemetry",
    action: "get",
    description: "Get telemetry data for a session",
    flags: [{ ...sessionFlag, required: false }, { ...ticketFlag, required: false }, prettyFlag],
  },
  {
    resource: "telemetry",
    action: "list",
    description: "List telemetry sessions",
    flags: [
      { ...ticketFlag, required: false },
      projectFlag,
      { name: "since", type: "string", required: false, description: "ISO date filter" },
      limitFlag,
      prettyFlag,
    ],
  },
  {
    resource: "telemetry",
    action: "log-tool",
    description: "Log a tool call event",
    flags: [
      sessionFlag,
      { name: "tool", type: "string", required: true, description: "Tool name" },
      {
        name: "event",
        type: "enum",
        required: true,
        description: "Event type",
        enum: ["start", "end"],
      },
      prettyFlag,
    ],
  },
  {
    resource: "telemetry",
    action: "log-prompt",
    description: "Log a user prompt",
    flags: [
      sessionFlag,
      { name: "prompt", type: "string", required: true, description: "Prompt text" },
      prettyFlag,
    ],
  },
  {
    resource: "telemetry",
    action: "log-context",
    description: "Log ticket context loaded when AI started work",
    flags: [
      sessionFlag,
      {
        name: "has-description",
        type: "boolean",
        required: false,
        description: "Ticket had description",
      },
      {
        name: "has-criteria",
        type: "boolean",
        required: false,
        description: "Ticket had acceptance criteria",
      },
      {
        name: "criteria-count",
        type: "number",
        required: false,
        description: "Number of criteria",
      },
      {
        name: "comment-count",
        type: "number",
        required: false,
        description: "Number of comments",
      },
      {
        name: "attachment-count",
        type: "number",
        required: false,
        description: "Number of attachments",
      },
      { name: "image-count", type: "number", required: false, description: "Number of images" },
      prettyFlag,
    ],
    examples: [
      "brain-dump telemetry log-context --session abc --has-description --has-criteria --criteria-count 3",
    ],
  },

  // ── files ──────────────────────────────────────────────────
  {
    resource: "files",
    action: "link",
    description: "Link file paths to a ticket",
    flags: [
      ticketFlag,
      { name: "files", type: "string", required: true, description: "Comma-separated file paths" },
      prettyFlag,
    ],
  },
  {
    resource: "files",
    action: "get-tickets",
    description: "Find tickets linked to a file",
    flags: [
      { name: "file", type: "string", required: true, description: "File path" },
      projectFlag,
      prettyFlag,
    ],
  },

  // ── tasks ──────────────────────────────────────────────────
  {
    resource: "tasks",
    action: "save",
    description: "Save Claude task list for a ticket",
    flags: [
      { ...ticketFlag, required: false },
      { name: "tasks-file", type: "string", required: true, description: "JSON file with tasks" },
      { name: "snapshot", type: "boolean", required: false, description: "Create audit snapshot" },
      prettyFlag,
    ],
  },
  {
    resource: "tasks",
    action: "get",
    description: "Get Claude tasks for a ticket",
    flags: [
      { ...ticketFlag, required: false },
      { name: "history", type: "boolean", required: false, description: "Include status history" },
      prettyFlag,
    ],
  },
  {
    resource: "tasks",
    action: "clear",
    description: "Clear all Claude tasks for a ticket",
    flags: [{ ...ticketFlag, required: false }, prettyFlag],
  },
  {
    resource: "tasks",
    action: "snapshots",
    description: "Get historical task snapshots",
    flags: [ticketFlag, limitFlag, prettyFlag],
  },

  // ── compliance ─────────────────────────────────────────────
  {
    resource: "compliance",
    action: "start",
    description: "Start a compliance conversation session",
    flags: [
      projectFlag,
      { ...ticketFlag, required: false },
      { name: "user", type: "string", required: false, description: "User identifier" },
      {
        name: "classification",
        type: "enum",
        required: false,
        description: "Data sensitivity",
        enum: ["public", "internal", "confidential", "restricted"],
      },
      prettyFlag,
    ],
  },
  {
    resource: "compliance",
    action: "log",
    description: "Log a message to a conversation session",
    flags: [
      sessionFlag,
      {
        name: "role",
        type: "enum",
        required: true,
        description: "Message role",
        enum: ["user", "assistant", "system", "tool"],
      },
      { name: "content", type: "string", required: true, description: "Message content" },
      prettyFlag,
    ],
  },
  {
    resource: "compliance",
    action: "end",
    description: "End a conversation session",
    flags: [sessionFlag, prettyFlag],
  },
  {
    resource: "compliance",
    action: "list",
    description: "List conversation sessions",
    flags: [
      projectFlag,
      { ...ticketFlag, required: false },
      { name: "since", type: "string", required: false, description: "Start date (ISO)" },
      { name: "until", type: "string", required: false, description: "End date (ISO)" },
      limitFlag,
      prettyFlag,
    ],
  },
  {
    resource: "compliance",
    action: "export",
    description: "Export conversation logs for auditing",
    flags: [
      { name: "start", type: "string", required: true, description: "Start date (ISO)" },
      { name: "end", type: "string", required: true, description: "End date (ISO)" },
      { ...sessionFlag, required: false },
      projectFlag,
      { name: "verify", type: "boolean", required: false, description: "Verify HMAC integrity" },
      prettyFlag,
    ],
  },
  {
    resource: "compliance",
    action: "archive",
    description: "Archive old sessions (dry-run by default)",
    flags: [
      { name: "days", type: "number", required: false, description: "Retention period in days" },
      confirmFlag,
      prettyFlag,
    ],
  },

  // ── settings ───────────────────────────────────────────────
  {
    resource: "settings",
    action: "get",
    description: "Get project settings",
    flags: [{ ...projectFlag, required: true }, prettyFlag],
  },
  {
    resource: "settings",
    action: "update",
    description: "Update project settings",
    flags: [
      { ...projectFlag, required: true },
      {
        name: "working-method",
        type: "enum",
        required: true,
        description: "Working method",
        enum: ["auto", "claude-code", "vscode", "opencode", "cursor", "copilot-cli", "codex"],
      },
      prettyFlag,
    ],
  },

  // ── transfer ───────────────────────────────────────────────
  {
    resource: "transfer",
    action: "export-epic",
    description: "Export an epic as a .braindump archive",
    flags: [
      { name: "epic", type: "string", required: true, description: "Epic ID" },
      { name: "output", type: "string", required: false, description: "Output file path" },
      prettyFlag,
    ],
  },
  {
    resource: "transfer",
    action: "export-project",
    description: "Export a full project as a .braindump archive",
    flags: [
      { ...projectFlag, required: true },
      { name: "output", type: "string", required: false, description: "Output file path" },
      prettyFlag,
    ],
  },
  {
    resource: "transfer",
    action: "import",
    description: "Import a .braindump archive",
    flags: [
      { name: "file", type: "string", required: true, description: "Input .braindump file" },
      {
        name: "target-project",
        type: "string",
        required: false,
        description: "Target project ID",
      },
      {
        name: "conflict",
        type: "enum",
        required: false,
        description: "Conflict resolution",
        enum: ["create-new", "replace", "merge"],
      },
      prettyFlag,
    ],
  },
  {
    resource: "transfer",
    action: "preview",
    description: "Preview a .braindump archive without importing",
    flags: [
      { name: "file", type: "string", required: true, description: "Input .braindump file" },
      prettyFlag,
    ],
  },

  // ── admin ──────────────────────────────────────────────────
  {
    resource: "admin",
    action: "backup",
    description: "Create or list database backups",
    flags: [
      { name: "list", type: "boolean", required: false, description: "List available backups" },
      prettyFlag,
    ],
    examples: ["brain-dump admin backup", "brain-dump admin backup --list"],
  },
  {
    resource: "admin",
    action: "restore",
    description: "Restore database from a backup",
    flags: [
      { name: "latest", type: "boolean", required: false, description: "Use most recent backup" },
      { name: "file", type: "string", required: false, description: "Specific backup file" },
      prettyFlag,
    ],
  },
  {
    resource: "admin",
    action: "check",
    description: "Quick or full database integrity check",
    flags: [
      { name: "full", type: "boolean", required: false, description: "Run full health check" },
      prettyFlag,
    ],
    examples: ["brain-dump admin check", "brain-dump admin check --full"],
  },
  {
    resource: "admin",
    action: "doctor",
    description: "Diagnose configuration issues",
    flags: [prettyFlag],
    examples: ["brain-dump admin doctor"],
  },
  {
    resource: "admin",
    action: "health",
    description: "Comprehensive database health report",
    flags: [prettyFlag],
    examples: ["brain-dump admin health --pretty"],
  },

  // ── top-level power commands ────────────────────────────────
  {
    resource: "_top",
    action: "open",
    description: "Open Brain Dump UI in the browser",
    flags: [
      { name: "port", type: "number", required: false, description: "Port number (default: 4242)" },
    ],
    examples: ["brain-dump open", "brain-dump open --port 3000"],
  },
];

// ── Lookup helpers ─────────────────────────────────────────────

/** Get all unique resource names. */
export function getResources(): string[] {
  const seen = new Set<string>();
  for (const cmd of COMMAND_REGISTRY) {
    seen.add(cmd.resource);
  }
  return [...seen];
}

/** Get all commands for a resource. */
export function getCommandsForResource(resource: string): CommandDef[] {
  return COMMAND_REGISTRY.filter((c) => c.resource === resource);
}

/** Get a specific command definition. */
export function getCommand(resource: string, action: string): CommandDef | undefined {
  return COMMAND_REGISTRY.find((c) => c.resource === resource && c.action === action);
}

/** Get a one-line description for a resource (from its first command's resource name). */
export function getResourceDescription(resource: string): string {
  const descriptions: Record<string, string> = {
    project: "List, find, create, delete projects",
    ticket: "Create, list, get, update, delete tickets",
    epic: "Create, list, update, delete epics",
    workflow: "Start work, complete work, start epic",
    comment: "Add and list ticket comments",
    review: "Submit findings, generate demos, manage reviews",
    session: "Create, update, complete Ralph sessions",
    git: "Link commits, PRs, sync ticket links",
    telemetry: "Start, end, get, list telemetry sessions",
    files: "Link files to tickets, find tickets by file",
    tasks: "Save, get, clear Claude task lists",
    compliance: "Conversation logging for compliance auditing",
    settings: "Get and update project settings",
    transfer: "Export and import .braindump archives",
    admin: "Backup, restore, check, doctor, health",
  };
  return descriptions[resource] ?? "";
}
