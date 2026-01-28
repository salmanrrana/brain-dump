/**
 * Tool metadata registry for context-aware tool filtering.
 * Defines metadata for all MCP tools including categories and relevant contexts.
 * @module lib/tool-metadata
 */

/**
 * Tool metadata defining tool properties, categories, and context relevance.
 *
 * @typedef {Object} ToolMetadata
 * @property {string} name - Tool name (matches MCP tool name)
 * @property {string} category - Primary tool category
 * @property {string[]} contexts - Contexts where tool is relevant (ticket_work, planning, review, admin)
 * @property {number} priority - Priority level (1=critical, 2=important, 3=useful, 4=advanced)
 * @property {string} description - Brief tool description
 */

/**
 * Complete registry of all Brain Dump MCP tools with their metadata.
 * Tools are organized by category and marked with relevant contexts.
 *
 * Context types:
 * - ticket_work: Active ticket implementation (ticket status: in_progress)
 * - planning: Ticket planning (statuses: backlog, ready)
 * - review: Code review phase (statuses: ai_review, human_review)
 * - admin: Administrative/setup tasks (no active ticket or ticket is done)
 */
export const TOOL_METADATA_REGISTRY = [
  // ===========================================================================
  // PROJECT MANAGEMENT TOOLS
  // ===========================================================================
  {
    name: "list_projects",
    category: "project_management",
    contexts: ["admin", "planning"],
    priority: 2,
    description: "List all available projects",
  },
  {
    name: "find_project_by_path",
    category: "project_management",
    contexts: ["admin"],
    priority: 3,
    description: "Find a project by its file system path",
  },
  {
    name: "create_project",
    category: "project_management",
    contexts: ["admin"],
    priority: 2,
    description: "Create a new project",
  },
  {
    name: "delete_project",
    category: "project_management",
    contexts: ["admin"],
    priority: 4,
    description: "Delete a project",
  },

  // ===========================================================================
  // EPIC MANAGEMENT TOOLS
  // ===========================================================================
  {
    name: "list_epics",
    category: "ticket_management",
    contexts: ["admin", "planning"],
    priority: 2,
    description: "List all epics in a project",
  },
  {
    name: "create_epic",
    category: "ticket_management",
    contexts: ["admin", "planning"],
    priority: 2,
    description: "Create a new epic",
  },
  {
    name: "update_epic",
    category: "ticket_management",
    contexts: ["admin", "planning"],
    priority: 3,
    description: "Update an existing epic",
  },
  {
    name: "delete_epic",
    category: "ticket_management",
    contexts: ["admin"],
    priority: 4,
    description: "Delete an epic",
  },

  // ===========================================================================
  // TICKET MANAGEMENT TOOLS
  // ===========================================================================
  {
    name: "create_ticket",
    category: "ticket_management",
    contexts: ["admin", "planning"],
    priority: 2,
    description: "Create a new ticket",
  },
  {
    name: "list_tickets",
    category: "ticket_management",
    contexts: ["admin", "planning", "ticket_work"],
    priority: 1,
    description: "List tickets in a project or epic",
  },
  {
    name: "list_tickets_by_epic",
    category: "ticket_management",
    contexts: ["admin", "planning"],
    priority: 3,
    description: "List all tickets for a specific epic",
  },
  {
    name: "update_ticket_status",
    category: "ticket_management",
    contexts: ["ticket_work", "review", "planning"],
    priority: 2,
    description: "Update ticket status",
  },
  {
    name: "update_acceptance_criterion",
    category: "ticket_management",
    contexts: ["ticket_work", "planning"],
    priority: 3,
    description: "Update acceptance criteria for a ticket",
  },
  {
    name: "delete_ticket",
    category: "ticket_management",
    contexts: ["admin"],
    priority: 4,
    description: "Delete a ticket",
  },
  {
    name: "update_attachment_metadata",
    category: "ticket_management",
    contexts: ["ticket_work"],
    priority: 3,
    description: "Update attachment metadata for a ticket",
  },

  // ===========================================================================
  // COMMENT & COLLABORATION TOOLS
  // ===========================================================================
  {
    name: "add_ticket_comment",
    category: "collaboration",
    contexts: ["ticket_work", "review"],
    priority: 2,
    description: "Add a comment to a ticket",
  },
  {
    name: "list_ticket_comments",
    category: "collaboration",
    contexts: ["ticket_work", "review", "planning"],
    priority: 3,
    description: "List comments on a ticket",
  },

  // ===========================================================================
  // WORKFLOW STATE MANAGEMENT TOOLS
  // ===========================================================================
  {
    name: "start_ticket_work",
    category: "workflow",
    contexts: ["planning"],
    priority: 1,
    description: "Start work on a ticket (move to in_progress)",
  },
  {
    name: "start_epic_work",
    category: "workflow",
    contexts: ["planning"],
    priority: 1,
    description: "Start work on an epic (with worktree/branch choice)",
  },
  {
    name: "complete_ticket_work",
    category: "workflow",
    contexts: ["ticket_work"],
    priority: 1,
    description: "Complete ticket implementation and move to ai_review",
  },

  // ===========================================================================
  // GIT & VERSION CONTROL TOOLS
  // ===========================================================================
  {
    name: "link_commit_to_ticket",
    category: "git",
    contexts: ["ticket_work"],
    priority: 2,
    description: "Link a git commit to a ticket",
  },
  {
    name: "link_pr_to_ticket",
    category: "git",
    contexts: ["ticket_work", "review"],
    priority: 2,
    description: "Link a pull request to a ticket",
  },
  {
    name: "sync_ticket_links",
    category: "git",
    contexts: ["ticket_work"],
    priority: 3,
    description: "Automatically sync ticket links from git commits",
  },

  // ===========================================================================
  // FILE & ATTACHMENT TOOLS
  // ===========================================================================
  {
    name: "link_files_to_ticket",
    category: "ticket_management",
    contexts: ["ticket_work"],
    priority: 3,
    description: "Link files to a ticket",
  },
  {
    name: "get_tickets_for_file",
    category: "ticket_management",
    contexts: ["planning"],
    priority: 3,
    description: "Get tickets linked to a file",
  },

  // ===========================================================================
  // CODE REVIEW & QUALITY TOOLS
  // ===========================================================================
  {
    name: "submit_review_finding",
    category: "review",
    contexts: ["review"],
    priority: 1,
    description: "Submit a code review finding",
  },
  {
    name: "mark_finding_fixed",
    category: "review",
    contexts: ["review", "ticket_work"],
    priority: 2,
    description: "Mark a finding as fixed",
  },
  {
    name: "check_review_complete",
    category: "review",
    contexts: ["review"],
    priority: 2,
    description: "Check if review is complete",
  },
  {
    name: "list_review_findings",
    category: "review",
    contexts: ["review"],
    priority: 3,
    description: "List review findings for a ticket",
  },

  // ===========================================================================
  // DEMO & VERIFICATION TOOLS
  // ===========================================================================
  {
    name: "generate_demo_script",
    category: "review",
    contexts: ["review"],
    priority: 1,
    description: "Generate a demo script for manual testing",
  },
  {
    name: "submit_demo_feedback",
    category: "review",
    contexts: ["admin"],
    priority: 1,
    description: "Submit demo approval/rejection feedback",
  },
  {
    name: "get_demo_script",
    category: "review",
    contexts: ["review", "admin"],
    priority: 2,
    description: "Retrieve a demo script",
  },
  {
    name: "list_demo_feedback",
    category: "review",
    contexts: ["review"],
    priority: 3,
    description: "List demo feedback",
  },

  // ===========================================================================
  // LEARNING & DOCUMENTATION TOOLS
  // ===========================================================================
  {
    name: "extract_learnings",
    category: "documentation",
    contexts: ["ticket_work", "review"],
    priority: 3,
    description: "Extract learnings from completed work",
  },
  {
    name: "reconcile_learnings",
    category: "documentation",
    contexts: ["review"],
    priority: 3,
    description: "Reconcile learnings with project documentation",
  },

  // ===========================================================================
  // CLAUDE TASKS INTEGRATION TOOLS
  // ===========================================================================
  {
    name: "create_claude_task",
    category: "admin",
    contexts: ["admin", "planning"],
    priority: 3,
    description: "Create a task for Claude",
  },
  {
    name: "update_claude_task",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Update a Claude task",
  },
  {
    name: "list_claude_tasks",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "List Claude tasks",
  },
  {
    name: "delete_claude_task",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Delete a Claude task",
  },

  // ===========================================================================
  // TELEMETRY & SESSION TRACKING TOOLS
  // ===========================================================================
  {
    name: "start_telemetry_session",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Start a telemetry tracking session",
  },
  {
    name: "log_prompt_event",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Log a prompt event for telemetry",
  },
  {
    name: "log_tool_event",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Log a tool event for telemetry",
  },
  {
    name: "end_telemetry_session",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "End a telemetry tracking session",
  },
  {
    name: "get_telemetry_summary",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Get telemetry summary",
  },
  {
    name: "list_telemetry_sessions",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "List telemetry sessions",
  },
  {
    name: "get_telemetry_session",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Get specific telemetry session",
  },

  // ===========================================================================
  // CONVERSATION & COMPLIANCE TOOLS
  // ===========================================================================
  {
    name: "start_conversation_session",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Start a conversation session for compliance logging",
  },
  {
    name: "log_conversation_message",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Log a conversation message",
  },
  {
    name: "end_conversation_session",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "End a conversation session",
  },
  {
    name: "list_conversation_sessions",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "List conversation sessions",
  },
  {
    name: "export_compliance_logs",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Export compliance logs",
  },
  {
    name: "archive_old_sessions",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Archive old conversation sessions",
  },

  // ===========================================================================
  // RALPH SESSION MANAGEMENT TOOLS
  // ===========================================================================
  {
    name: "create_ralph_session",
    category: "workflow",
    contexts: ["ticket_work"],
    priority: 2,
    description: "Create a Ralph session for autonomous work",
  },
  {
    name: "update_session_state",
    category: "workflow",
    contexts: ["ticket_work"],
    priority: 2,
    description: "Update Ralph session state",
  },
  {
    name: "complete_ralph_session",
    category: "workflow",
    contexts: ["ticket_work", "review"],
    priority: 2,
    description: "Complete a Ralph session",
  },
  {
    name: "get_session_state",
    category: "workflow",
    contexts: ["ticket_work"],
    priority: 2,
    description: "Get Ralph session state",
  },
  {
    name: "list_ralph_sessions",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "List Ralph sessions",
  },

  // ===========================================================================
  // EVENT LOGGING TOOLS
  // ===========================================================================
  {
    name: "create_ralph_event",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Create a Ralph event",
  },
  {
    name: "list_ralph_events",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "List Ralph events",
  },
  {
    name: "get_ralph_event",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Get a specific Ralph event",
  },

  // ===========================================================================
  // HEALTH & SYSTEM TOOLS
  // ===========================================================================
  {
    name: "get_database_health",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Check database health",
  },
  {
    name: "get_environment_info",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Get environment information",
  },
  {
    name: "update_settings",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Update application settings",
  },
  {
    name: "get_settings",
    category: "admin",
    contexts: ["admin", "planning"],
    priority: 3,
    description: "Get application settings",
  },

  // ===========================================================================
  // WORKTREE MANAGEMENT TOOLS
  // ===========================================================================
  {
    name: "create_worktree",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Create a git worktree for an epic",
  },
  {
    name: "remove_worktree",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Remove a git worktree",
  },
  {
    name: "list_worktrees",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "List active worktrees",
  },
  {
    name: "cleanup_worktrees",
    category: "admin",
    contexts: ["admin"],
    priority: 3,
    description: "Cleanup stale worktrees",
  },

  // ===========================================================================
  // CONTEXT DETECTION TOOLS
  // ===========================================================================
  {
    name: "detect_context",
    category: "workflow",
    contexts: ["admin", "planning", "ticket_work", "review"],
    priority: 3,
    description: "Detect the active context",
  },
  {
    name: "detect_all_contexts",
    category: "admin",
    contexts: ["admin"],
    priority: 4,
    description: "Detect all active contexts",
  },
];

/**
 * Get tool metadata by name.
 * @param {string} toolName - Name of the tool
 * @returns {Object|null} Tool metadata or null if not found
 */
export function getToolMetadata(toolName) {
  return TOOL_METADATA_REGISTRY.find((tool) => tool.name === toolName) || null;
}

/**
 * Get all tools relevant to a context.
 * @param {string} contextType - Context type (ticket_work, planning, review, admin)
 * @param {number} [maxPriority] - Maximum priority level (1=critical, 4=advanced). Default: 3 (useful)
 * @returns {string[]} Array of tool names
 */
export function getToolsForContext(contextType, maxPriority = 3) {
  return TOOL_METADATA_REGISTRY.filter((tool) => {
    const isRelevant = tool.contexts.includes(contextType);
    const isPriorityAcceptable = tool.priority <= maxPriority;
    return isRelevant && isPriorityAcceptable;
  }).map((tool) => tool.name);
}

/**
 * Get tool statistics.
 * @returns {Object} Statistics about tools
 */
export function getToolStatistics() {
  const byCategory = {};
  const byContext = {
    ticket_work: 0,
    planning: 0,
    review: 0,
    admin: 0,
  };

  for (const tool of TOOL_METADATA_REGISTRY) {
    // Count by category
    if (!byCategory[tool.category]) {
      byCategory[tool.category] = 0;
    }
    byCategory[tool.category]++;

    // Count by context
    for (const context of tool.contexts) {
      if (byContext[context] !== undefined) {
        byContext[context]++;
      }
    }
  }

  return {
    totalTools: TOOL_METADATA_REGISTRY.length,
    byCategory,
    byContext,
    categories: Object.keys(byCategory).length,
  };
}
