# MCP Tool Consolidation Proposal

## Problem Statement

Brain Dump currently exposes **65 MCP tools** to LLMs, which causes:

1. **Tool Selection Confusion**: LLMs struggle to choose the right tool from a large list
2. **Token Overhead**: Tool descriptions consume significant context tokens
3. **Performance Degradation**: More tools = slower tool selection decisions
4. **Maintenance Burden**: Harder to understand and maintain tool relationships
5. **Poor Discoverability**: Important tools get lost in the noise

## Current Tool Inventory

| Category        | Tool Count | Tools                                                                                                                                                                               |
| --------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects        | 4          | list_projects, find_project_by_path, create_project, delete_project                                                                                                                 |
| Epics           | 4          | list_epics, create_epic, update_epic, delete_epic                                                                                                                                   |
| Tickets         | 8          | create_ticket, list_tickets, update_ticket_status, update_acceptance_criterion, update_ticket_subtask (deprecated), delete_ticket, update_attachment_metadata, list_tickets_by_epic |
| Comments        | 2          | add_ticket_comment, list_ticket_comments                                                                                                                                            |
| Workflow        | 3          | start_ticket_work, start_epic_work, complete_ticket_work                                                                                                                            |
| Git             | 3          | link_commit_to_ticket, link_pr_to_ticket, sync_ticket_links                                                                                                                         |
| Files           | 2          | link_files_to_ticket, get_tickets_for_file                                                                                                                                          |
| Review Findings | 4          | submit_review_finding, mark_finding_fixed, check_review_complete, list_review_findings                                                                                              |
| Demo            | 4          | generate_demo_script, submit_demo_feedback, get_demo_script, list_demo_feedback                                                                                                     |
| Learnings       | 2          | extract_learnings, reconcile_learnings                                                                                                                                              |
| Claude Tasks    | 4          | create_claude_task, update_claude_task, list_claude_tasks, delete_claude_task                                                                                                       |
| Telemetry       | 7          | start_telemetry_session, log_prompt_event, log_tool_event, end_telemetry_session, get_telemetry_summary, list_telemetry_sessions, get_telemetry_session                             |
| Conversations   | 6          | start_conversation_session, log_conversation_message, end_conversation_session, list_conversation_sessions, export_compliance_logs, archive_old_sessions                            |
| Sessions        | 5          | create_ralph_session, update_session_state, complete_ralph_session, get_session_state, list_ralph_sessions                                                                          |
| Events          | 3          | create_ralph_event, list_ralph_events, get_ralph_event                                                                                                                              |
| Health          | 4          | get_database_health, get_environment_info, update_settings, get_settings                                                                                                            |
| **TOTAL**       | **65**     |                                                                                                                                                                                     |

## Solution Strategies

### Strategy 1: Context-Aware Tool Exposure (Recommended)

**Concept**: Only expose tools relevant to the current context/workflow phase.

**Implementation**:

- Create tool "profiles" or "modes" (e.g., `ticket_work`, `review`, `planning`, `admin`)
- Tools register themselves with tags/categories
- MCP server filters tools based on active context
- Context can be determined from:
  - Active ticket status
  - Ralph session state
  - User-provided mode hint

**Benefits**:

- Reduces tool count from 65 → ~10-15 per context
- Better tool discovery
- Faster LLM decisions
- Maintains all functionality

**Example**:

```javascript
// In ticket_work context, only expose:
- start_ticket_work
- complete_ticket_work
- add_ticket_comment
- link_commit_to_ticket
- link_pr_to_ticket
- update_acceptance_criterion
- submit_review_finding (if in ai_review)
- generate_demo_script (if review complete)

// Hide: telemetry tools, conversation tools, admin tools, etc.
```

### Strategy 2: Tool Consolidation

**Concept**: Merge related tools into more powerful, parameterized tools.

**Consolidation Opportunities**:

#### A. Unified CRUD Tool

Instead of separate `create_*`, `list_*`, `update_*`, `delete_*` tools:

- `manage_projects(action, ...)`
- `manage_epics(action, ...)`
- `manage_tickets(action, ...)`

**Pros**: Reduces 4 tools → 1 tool per entity  
**Cons**: Less discoverable, harder to document

#### B. Workflow Orchestration Tool

Combine workflow steps:

- `workflow(action: "start" | "complete" | "review" | "demo", ...)`

**Pros**: Single entry point for workflow  
**Cons**: Complex parameter handling

#### C. Unified Link Tool

Merge all linking operations:

- `link(entity_type, source_id, target_type, target_id, metadata)`

**Pros**: Consistent interface  
**Cons**: Less type-safe

### Strategy 3: Tool Hierarchies / Sub-Tools

**Concept**: Use tool routing/dispatching pattern.

**Example**:

```javascript
// Main router tool
brain_dump(action: "projects" | "tickets" | "workflow", sub_action: string, ...params)

// Internally routes to:
brain_dump("projects", "list") → list_projects()
brain_dump("tickets", "create", {...}) → create_ticket(...)
```

**Pros**: Single tool entry point  
**Cons**: Loses MCP's native tool discovery, harder to document

### Strategy 4: Tool Aliases / Shortcuts

**Concept**: Keep all tools but create "shortcut" tools that combine common operations.

**Example**:

- `quick_start_ticket(ticketId)` → calls `start_ticket_work` + `link_commit_to_ticket` + `start_telemetry_session`
- `quick_complete_ticket(ticketId, summary)` → calls `complete_ticket_work` + `end_telemetry_session` + `sync_ticket_links`

**Pros**: Maintains backward compatibility  
**Cons**: Adds more tools (temporary increase)

### Strategy 5: Tool Discovery / On-Demand Loading

**Concept**: Tools are registered but only "discovered" when needed.

**Implementation**:

- Add `list_available_tools(category?)` tool
- LLM queries for available tools in a category
- Tools are dynamically exposed based on query

**Pros**: Flexible, on-demand  
**Cons**: Requires LLM to know to query, adds latency

## Recommended Approach: Hybrid Strategy

Combine **Strategy 1 (Context-Aware)** + **Strategy 4 (Shortcuts)**:

### Phase 1: Add Context-Aware Tool Filtering

1. Add tool metadata (categories, contexts, priority)
2. Implement context detection (from ticket status, session state)
3. Filter tools based on active context
4. Add `get_available_tools(context?)` tool for discovery

**Target**: Reduce visible tools from 65 → 10-15 per context

### Phase 2: Add Workflow Shortcuts

1. Create high-level workflow tools that combine common operations
2. Keep original tools for fine-grained control
3. Document when to use shortcuts vs. individual tools

**Target**: Provide both simple (shortcuts) and advanced (individual) workflows

### Phase 3: Consolidate Low-Value Tools

1. Identify rarely-used tools
2. Merge into more general tools or remove
3. Document migration path

**Target**: Reduce total tool count from 65 → 40-45

## Implementation Plan

### Step 1: Add Tool Metadata System

```javascript
// In each tool registration:
server.tool("create_ticket", {...}, {
  categories: ["tickets", "crud"],
  contexts: ["planning", "ticket_work"],
  priority: "high",
  aliases: ["new_ticket", "add_ticket"]
});
```

### Step 2: Implement Context Detection

```javascript
function getActiveContext(db, projectPath) {
  // Check for active ticket
  const activeTicket = getActiveTicket(db, projectPath);
  if (activeTicket) {
    return {
      context: "ticket_work",
      ticketStatus: activeTicket.status,
      // Returns: "implementation" | "ai_review" | "human_review"
    };
  }

  // Check for active epic
  const activeEpic = getActiveEpic(db, projectPath);
  if (activeEpic) return { context: "epic_work" };

  return { context: "general" };
}
```

### Step 3: Filter Tools by Context

```javascript
function filterToolsByContext(tools, context) {
  return tools.filter((tool) => {
    // Always show high-priority tools
    if (tool.priority === "high") return true;

    // Show tools matching current context
    if (tool.contexts.includes(context.context)) return true;

    // Show admin tools only in admin context
    if (tool.categories.includes("admin") && context.context !== "admin") {
      return false;
    }

    return false;
  });
}
```

### Step 4: Add Tool Discovery Tool

```javascript
server.tool(
  "get_available_tools",
  {
    context: z.string().optional(),
    category: z.string().optional(),
  },
  async ({ context, category }) => {
    const activeContext = getActiveContext(db);
    const filtered = filterToolsByContext(allTools, activeContext);

    return {
      context: activeContext,
      tools: filtered.map((t) => ({
        name: t.name,
        description: t.description.substring(0, 100),
        category: t.categories[0],
      })),
    };
  }
);
```

## Migration Strategy

1. **Backward Compatible**: All existing tools remain available
2. **Opt-In**: Context filtering is opt-in via settings
3. **Gradual Rollout**: Test with specific contexts first
4. **Documentation**: Update docs with context-aware usage patterns

## Success Metrics

- **Tool Selection Time**: Measure LLM time to select correct tool (target: 50% reduction)
- **Token Usage**: Measure tokens consumed by tool descriptions (target: 60% reduction)
- **Tool Usage Patterns**: Track which tools are actually used (identify candidates for removal)
- **Error Rate**: Measure incorrect tool selections (target: 30% reduction)

## Next Steps

1. Create ticket for context-aware tool filtering implementation
2. Add tool metadata to all existing tools
3. Implement context detection system
4. Add tool filtering middleware
5. Test with real LLM workflows
6. Iterate based on usage patterns
