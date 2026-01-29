# MCP SDK Compliance Analysis

**Date**: January 29, 2026
**Scope**: Brain Dump MCP Server vs Official SDK Best Practices
**Status**: Comprehensive audit complete - migration roadmap ready

---

## Executive Summary

Brain Dump's MCP server implements 84 tools across 14 modules but lacks several critical features recommended by official MCP examples. This analysis compares our implementation against four official reference servers and the SDK documentation.

**Key Findings**:

- ✅ Core functionality: Tool registration, input validation with Zod
- ⚠️ **CRITICAL (84 tools)**: No output schemas, missing annotations, no structured content
- ⚠️ **MEDIUM (all modules)**: Using legacy `server.tool()` instead of `server.registerTool()`
- ℹ️ **OPTIONAL**: Not implementing Resources, Prompts, or Sampling (advanced features)

---

## Official Example Server Patterns

### 1. Filesystem MCP Server

**What It Implements**:

- 9 read-only tools (list, search, read operations)
- 4 write tools (create, edit, move, delete)
- **Full annotation support**: `readOnlyHint`, `destructiveHint`, `idempotentHint`

**Annotation Examples**:

```typescript
// Read operation
{
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true  // safe to retry
}

// Write operation
{
  readOnlyHint: false,
  destructiveHint: true,  // can delete/overwrite data
  idempotentHint: false   // double-apply might break things
}

// Create directory
{
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true    // re-creating same dir is no-op
}
```

**Pattern**: Clients use these annotations to:

- Disable/enable certain operations in UI
- Understand retry safety
- Warn users before destructive operations
- Route operations to appropriate handlers

### 2. Fetch MCP Server

**What It Implements**:

- 1 primary tool with flexible configuration
- Optional parameters with defaults
- **Chunked reading**: Allows pagination via `start_index` and `max_length`
- **Context-aware behavior**: Different user-agents for model vs user requests
- **Safety compliance**: Respects robots.txt files

**Pattern**: Demonstrates practical considerations:

- Simple tool that does one thing well
- Flexible parameter handling
- Security/compliance built-in
- User control over behavior

### 3. Git MCP Server

**What It Implements**:

- 12 Git operations (status, diff, commit, branch, log, show, etc.)
- Consistent parameter documentation
- Clear input/output contracts
- Optional parameters with sensible defaults

**Pattern**: Shows how to organize related operations:

- Group related functionality
- Consistent naming conventions
- Predictable parameter structure
- Error handling with helpful messages

### 4. Everything MCP Server (Advanced Features)

**What It Implements**:

- **Tools**: Standard operations
- **Resources**: Expose configuration, README, structured data
- **Prompts**: Reusable interaction templates
- **Sampling**: AI-generated content (Claude-specific)
- **Multiple Transports**: stdio (default), SSE (deprecated), Streamable HTTP

**Pattern**: Demonstrates full MCP capability matrix:

- Tools for actions
- Resources for passive data/content
- Prompts for multi-turn patterns
- Sampling for Claude-specific features

---

## Brain Dump Current Implementation

### Current Pattern (tickets.ts example)

```typescript
server.tool(
  "create_ticket",
  "Create a new ticket...",
  {
    projectId: z.string().describe("Project ID"),
    title: z.string().describe("Ticket title"),
    // ... more params
  },
  async ({ projectId, title, ... }) => {
    // Implementation
    return {
      content: [{ type: "text", text: `Created: ${ticket}` }],
    };
  }
);
```

**What's Correct**:

- ✅ Using Zod for input validation
- ✅ Providing helpful descriptions
- ✅ Returning structured MCP response format
- ✅ Error handling with `isError: true`

**What's Missing**:

- ❌ No `outputSchema` (Zod object describing output structure)
- ❌ No `title` field (for UI display)
- ❌ No annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`)
- ❌ No `structuredContent` (machine-parseable output)
- ❌ Using legacy `server.tool()` instead of modern `server.registerTool()`

---

## Compliance Matrix: Brain Dump vs Official Examples

| Feature                        | Brain Dump | Filesystem | Fetch | Git | Everything | Priority     |
| ------------------------------ | ---------- | ---------- | ----- | --- | ---------- | ------------ |
| **Core Tool Registration**     | ✅         | ✅         | ✅    | ✅  | ✅         | -            |
| **Input Schemas (Zod)**        | ✅         | ✅         | ✅    | ✅  | ✅         | -            |
| **Output Schemas**             | ❌         | ?          | ?     | ?   | ✅         | **CRITICAL** |
| **Tool Titles**                | ❌         | ✅         | ✅    | ✅  | ✅         | **CRITICAL** |
| **Annotations**                | ❌         | ✅         | ❌    | ✅  | ✅         | **CRITICAL** |
| **Structured Content**         | ❌         | ?          | ?     | ?   | ✅         | **CRITICAL** |
| **Modern API (.registerTool)** | ❌         | ✅         | ✅    | ✅  | ✅         | **MEDIUM**   |
| **Resources**                  | ❌         | ❌         | ❌    | ❌  | ✅         | Optional     |
| **Prompts**                    | ❌         | ❌         | ❌    | ❌  | ✅         | Optional     |
| **Sampling**                   | ❌         | ❌         | ❌    | ❌  | ✅         | Optional     |

---

## Detailed Gap Analysis

### GAP 1: Output Schemas (CRITICAL - 84 tools)

**Current State**:

```typescript
server.tool("create_ticket", "...", inputSchema, handler);
// No way to specify what the tool returns
```

**Official Best Practice** (Filesystem example model):

```typescript
server.registerTool({
  name: "list_directory",
  description: "List contents of directory",
  inputSchema: { /* input params */ },
  outputSchema: z.object({
    entries: z.array(z.object({
      name: z.string(),
      type: z.enum(["file", "directory"]),
      size: z.number().optional(),
    })),
    isDirectory: z.boolean(),
  }),
}, async (input) => {
  // Implementation
  return {
    entries: [...],
    isDirectory: true,
  };
});
```

**Why It Matters**:

- Claude and other clients understand what data they'll receive
- Enable validation of tool outputs
- Machine-parseable structure for programmatic use
- Better documentation for tool consumers

**Brain Dump Tools Needing Schemas** (examples):

- `create_ticket` → returns: `{ ticket: Ticket }`
- `list_tickets` → returns: `{ tickets: Ticket[], total: number }`
- `get_project` → returns: `{ project: Project | null }`
- All 84 tools

---

### GAP 2: Tool Titles (CRITICAL - 84 tools)

**Current State**:

```typescript
server.tool("create_ticket", "Create a new ticket...", ...)
// Name = "create_ticket" (slug format)
// No separate UI-friendly title
```

**Official Best Practice**:

```typescript
server.registerTool({
  name: "create_ticket",
  title: "Create Ticket",  // ← UI displays this
  description: "Create a new ticket in Brain Dump",
  ...
});
```

**Why It Matters**:

- UI shows "Create Ticket" instead of "create_ticket"
- Better readability in tool picker
- Follows MCP protocol specification
- Matches all official example servers

**Brain Dump Tools Needing Titles** (examples):

- `create_ticket` → "Create Ticket"
- `list_projects` → "List Projects"
- `start_ticket_work` → "Start Working on Ticket"
- All 84 tools

---

### GAP 3: Annotations (CRITICAL - 84 tools)

**Current State**:

```typescript
server.tool("write_file", "Write data...", ...)
// Client has no way to know this is destructive
```

**Official Best Practice** (Filesystem example):

```typescript
server.registerTool({
  name: "write_file",
  title: "Write File",
  description: "Write content to a file",
  inputSchema: {
    /* ... */
  },
  annotations: {
    readOnlyHint: false, // ← Modifies data
    destructiveHint: true, // ← Can overwrite files
    idempotentHint: true, // ← Safe to retry (overwrites are repeatable)
  },
  // ...
});
```

**Three Annotation Types**:

| Hint              | Values         | Meaning                                |
| ----------------- | -------------- | -------------------------------------- |
| `readOnlyHint`    | `true`/`false` | Whether tool reads without modifying   |
| `destructiveHint` | `true`/`false` | Whether tool can delete/overwrite data |
| `idempotentHint`  | `true`/`false` | Whether tool can be safely retried     |

**Brain Dump Annotation Strategy**:

| Category             | Tools                       | Example               | Annotations                                                |
| -------------------- | --------------------------- | --------------------- | ---------------------------------------------------------- |
| **Read-Only**        | list*\*, get*\_, search\_\_ | `list_tickets`        | `{readOnly: true, destructive: false, idempotent: true}`   |
| **Create/Update**    | create*\*, update*\*        | `create_ticket`       | `{readOnly: false, destructive: false, idempotent: false}` |
| **Delete/Replace**   | delete*\*, move*\*          | `delete_ticket`       | `{readOnly: false, destructive: true, idempotent: false}`  |
| **Idempotent Write** | set\_\*                     | `set_project_setting` | `{readOnly: false, destructive: false, idempotent: true}`  |

---

### GAP 4: Structured Content (CRITICAL - 84 tools)

**Current State**:

```typescript
return {
  content: [{ type: "text", text: "Created ticket..." }],
  // Only human-readable text
};
```

**Official Best Practice**:

```typescript
return {
  content: [{ type: "text", text: "Created ticket #123" }],
  structuredContent: {
    ticket: {
      id: "123",
      title: "Fix login bug",
      status: "backlog",
    },
  },
};
```

**Why It Matters**:

- Machine-parseable results for programmatic use
- Claude can use structured data directly
- Reduces parsing errors
- Enables richer client experiences

---

### GAP 5: Modern API - `server.registerTool()` vs `server.tool()` (MEDIUM)

**Current State** (Legacy):

```typescript
server.tool(name, description, inputSchema, handler);
// Limited flexibility, no metadata support
```

**Modern API** (Official Recommendation):

```typescript
server.registerTool(
  {
    name: "create_ticket",
    title: "Create Ticket",
    description: "...",
    inputSchema: z.object({...}),
    outputSchema: z.object({...}),
    annotations: {...},
  },
  async (input) => { /* handler */ }
)
```

**Why Migrate**:

- Future SDK development uses `registerTool()`
- Better metadata support (title, annotations)
- Schema validation on both input AND output
- Follows all official example patterns
- `server.tool()` may be deprecated

---

## Implementation Roadmap

### Phase 1: Foundation (CRITICAL)

**Effort**: ~2-3 hours per tool category

**Tasks**:

1. Create Zod `outputSchema` objects for each tool category:
   - Projects output: `{ project?: Project, projects?: Project[], total?: number }`
   - Tickets output: `{ ticket?: Ticket, tickets?: Ticket[], total?: number }`
   - Epics output: `{ epic?: Epic, epics?: Epic[], total?: number }`
   - Status output: `{ success: boolean, message: string }`

2. Add `title` field to all tool registrations:
   - `create_ticket` → `"Create Ticket"`
   - `list_projects` → `"List Projects"`
   - `update_ticket_status` → `"Update Ticket Status"`

3. Add `structuredContent` to all handlers:

   ```typescript
   return {
     content: [{ type: "text", text: "Human readable summary" }],
     structuredContent: {
       /* matches outputSchema */
     },
   };
   ```

4. Create annotation decision matrix (all 84 tools):
   - Categorize by read/write/delete
   - Assign appropriate hints

### Phase 2: Migration (MEDIUM)

**Effort**: ~4-6 hours

**Tasks**:

1. Migrate all tools from `server.tool()` to `server.registerTool()`
2. Add metadata object with all fields:
   ```typescript
   server.registerTool({
     name: "...",
     title: "...",
     description: "...",
     inputSchema: {...},
     outputSchema: {...},
     annotations: {...},
   }, handler);
   ```
3. Update tool descriptions to reference both input and output
4. Test with Claude Code integration

### Phase 3: Advanced Features (OPTIONAL)

**Effort**: 2-3 days per feature

**Possible Additions**:

- **Resources**: Expose project configurations, README files, schema documentation
  - `/projects/{projectId}/config` - Project settings resource
  - `/projects/{projectId}/readme` - Project documentation
  - `/schema/tickets` - Ticket schema reference

- **Prompts**: Reusable ticket creation/update templates
  - `create-bug-report` - Structured bug report template
  - `feature-request` - Feature request template
  - `refactoring-task` - Refactoring task template

- **Sampling**: Let Claude generate ticket descriptions, summaries
  - Generate ticket summary from description
  - Generate acceptance criteria from requirements
  - Generate test plan from ticket details

---

## Tool Category Annotations Matrix

### Read Operations (24 tools)

```
readOnlyHint: true
destructiveHint: false
idempotentHint: true
```

**Examples**:

- `list_projects`, `list_tickets`, `list_epics`
- `get_project`, `get_ticket`, `get_epic`
- `find_project_by_path`, `search_tickets`
- `list_project_settings`

### Create Operations (9 tools)

```
readOnlyHint: false
destructiveHint: false
idempotentHint: false
```

**Examples**:

- `create_project`, `create_ticket`, `create_epic`
- `add_ticket_comment`, `start_ticket_work`
- `create_conversation_session`

### Update Operations (18 tools)

```
readOnlyHint: false
destructiveHint: false
idempotentHint: false  (unless specifically designed for retry-safety)
```

**Examples**:

- `update_ticket_status`, `update_ticket_priority`
- `update_project_settings`, `update_epic_status`
- `log_conversation_message`

### Delete Operations (6 tools)

```
readOnlyHint: false
destructiveHint: true
idempotentHint: false
```

**Examples**:

- `delete_ticket`, `delete_project`, `delete_epic`
- `delete_comment`

### Idempotent Write Operations (4 tools)

```
readOnlyHint: false
destructiveHint: false
idempotentHint: true
```

**Examples**:

- `set_project_setting` (setting same value twice is safe)
- `complete_ticket_work` (idempotent mark as complete)

### Special Operations (23 tools)

**Status, workflow, special operations** - analyze case-by-case:

- `start_conversation_session` → read-only-like (creates session)
- `export_compliance_logs` → read-only (no side effects)
- `launch_ralph_for_epic` → destructive (starts long process)

---

## Next Steps

1. **Immediate** (This conversation): Create detailed migration spec with code examples
2. **Short-term** (Next ticket): Implement Phase 1 (output schemas, titles, structured content)
3. **Medium-term**: Migrate to modern `server.registerTool()` API
4. **Long-term**: Consider Resources/Prompts/Sampling for advanced features

---

## References

- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Filesystem Server Example](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
- [Fetch Server Example](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch)
- [Git Server Example](https://github.com/modelcontextprotocol/servers/tree/main/src/git)
- [Everything Server Example](https://github.com/modelcontextprotocol/servers/tree/main/src/everything)
- [MCP Server Documentation](https://modelcontextprotocol.io/docs/server/guide)
