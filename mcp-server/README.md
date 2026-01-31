# Brain Dump MCP Server

TypeScript MCP server providing tools for managing Brain Dump tickets from any project.

## Development

```bash
# Run server
pnpm start

# Development with watch mode
pnpm dev

# Type checking
pnpm type-check

# Tests
pnpm test
pnpm test:watch
```

## Architecture

- **Entry point**: `index.ts` - Server initialization and tool registration
- **Tools**: `tools/*.ts` - MCP tool implementations (16 modules, 55+ tools)
- **Library**: `lib/*.ts` - Utilities and database access (15 modules)
- **Types**: `types.ts` - Shared TypeScript definitions

## Tools Overview

### Projects (4 tools)

list_projects, create_project, find_project_by_path, update_project

### Tickets (9 tools)

create_ticket, update_ticket, list_tickets, get_ticket, delete_ticket, search_tickets, list_tickets_by_status, add_tags_to_ticket, remove_tags_from_ticket

### Epics (5 tools)

create_epic, list_epics, update_epic, delete_epic, list_tickets_by_epic

### Comments (2 tools)

add_ticket_comment, list_ticket_comments

### Workflow (6 tools)

start_ticket_work, complete_ticket_work, update_session_state, create_ralph_session, complete_ralph_session, update_ticket_status

### Git (3 tools)

create_branch, link_commit_to_ticket, link_pr_to_ticket

### Files (3 tools)

attach_file_to_ticket, list_ticket_attachments, read_ticket_attachment

### Health (1 tool)

check_database_health

### Events (2 tools)

record_event, list_session_events

### Sessions (3 tools)

create_session, end_session, list_sessions

### Conversations (6 tools)

start_conversation_session, log_conversation_message, end_conversation_session, list_conversation_sessions, export_compliance_logs, archive_old_sessions

### Telemetry (4 tools)

start_telemetry_session, log_telemetry_event, end_telemetry_session, flush_telemetry_queue

### Claude Tasks (3 tools)

record_claude_task, list_claude_tasks, get_claude_task

### Review Findings (3 tools)

submit_review_finding, list_review_findings, resolve_finding

### Demo (2 tools)

generate_demo_script, record_demo_feedback

### Learnings (2 tools)

extract_learnings, apply_learnings

## Adding New Tools

1. Create new file in `tools/` following the pattern:

   ```typescript
   import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import type Database from "better-sqlite3";
   import type { ToolResponse } from "../types.js";

   export function registerMyTools(server: McpServer, db: Database.Database): void {
     server.tool("my-tool", "Description", {}, async (): Promise<ToolResponse> => {
       // Implementation
     });
   }
   ```

2. Import and register in `index.ts`:

   ```typescript
   import { registerMyTools } from "./tools/my-tools.js";
   registerMyTools(server, db);
   ```

3. Run `pnpm type-check` to verify
4. Add tests if needed

## Type Safety

All code follows strict TypeScript mode:

- `noImplicitAny: true` - No implicit any types
- `strictNullChecks: true` - Null safety enforced
- `exactOptionalPropertyTypes: true` - Optional properties strict
- All database queries typed with casts

## Database

- **Engine**: SQLite with better-sqlite3
- **Location**: XDG Base Directory compliant
  - Linux: `~/.local/share/brain-dump/`
  - macOS: `~/Library/Application Support/brain-dump/`
  - Windows: `%APPDATA%\brain-dump\`
- **Initialization**: `initDatabase()` in `lib/database.ts`
- **Migrations**: Automatic on startup

## Testing

9 test files covering:

- Git utilities
- Secret detection
- Workflow state transitions
- Conversation logging
- Cross-environment compatibility
- E2E workflows
- TypeScript migration verification

Run all tests: `pnpm test`
Run specific test: `pnpm test path/to/file.test.ts`
Watch mode: `pnpm test:watch`
