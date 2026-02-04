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
- **Core**: `core/*.ts` - Business logic modules (extracted for reuse by CLI)
- **Tools**: `tools/*.ts` - 9 action-dispatched MCP tools
- **Library**: `lib/*.ts` - Utilities and database access
- **Types**: `types.ts` - Shared TypeScript definitions

## Tools Overview (9 tools, 65 actions)

Each tool accepts an `action` parameter that dispatches to the appropriate handler.

### workflow (6 actions)

start-work, complete-work, start-epic, link-commit, link-pr, sync-links

### ticket (10 actions)

create, list, get, update-status, delete, update-criterion, list-by-epic, link-files, get-files, update-attachment

### session (12 actions)

create, update-state, complete, get, list, emit-event, get-events, clear-events, save-tasks, get-tasks, clear-tasks, get-task-snapshots

### review (8 actions)

submit-finding, mark-fixed, check-complete, generate-demo, get-demo, submit-feedback, get-findings, update-step

### telemetry (7 actions)

start, log-tool, log-prompt, log-context, end, get, list

### comment (2 actions)

add, list

### epic (6 actions)

create, list, update, delete, reconcile-learnings, get-learnings

### project (4 actions)

create, list, find-by-path, get-settings, update-settings

### admin (10 actions)

health, environment, start-conversation, log-message, end-conversation, list-conversations, export-logs, archive-sessions, get-settings, update-settings

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
