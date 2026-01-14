# MCP Server Modular Refactoring Spec

## Overview

Refactor the monolithic `mcp-server/index.js` (2923 lines, 19 tools) into a clean modular architecture following official MCP SDK best practices.

## Current Problems

1. **Single 2923-line file** - Hard to navigate, test, and maintain
2. **Old API pattern** - Uses `Server` with `ListToolsRequestSchema`/`CallToolRequestSchema` handlers
3. **Giant switch statement** - All 19 tool handlers in one massive switch
4. **Manual validation** - Custom validation instead of Zod schemas
5. **Mixed concerns** - Logging, database, backup, tools all interleaved

## Target Architecture

```
mcp-server/
├── index.js              # Entry point (~50 lines)
├── lib/
│   ├── logging.js        # Log utilities
│   ├── xdg.js            # XDG path utilities
│   ├── database.js       # DB connection, migrations
│   ├── lock.js           # Lock file management
│   ├── backup.js         # Backup operations
│   └── validation.js     # Shared validation helpers
├── tools/
│   ├── projects.js       # list_projects, find_project_by_path, create_project
│   ├── tickets.js        # create_ticket, list_tickets, update_ticket_status
│   ├── epics.js          # list_epics, create_epic
│   ├── comments.js       # add_ticket_comment, get_ticket_comments
│   ├── workflow.js       # start_ticket_work, complete_ticket_work
│   ├── git.js            # link_commit_to_ticket
│   ├── files.js          # link_files_to_ticket, get_tickets_for_file
│   └── health.js         # get_database_health, get_environment, settings
└── package.json          # Add zod dependency
```

## Key Changes

### 1. Switch to McpServer API

**Before (current):**
```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({ name: "brain-dump", version: "1.0.0" });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "list_projects", description: "...", inputSchema: {...} }, ...]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "list_projects": { ... }
    case "create_project": { ... }
    // ... 17 more cases
  }
});
```

**After (modern pattern):**
```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "brain-dump", version: "1.0.0" });

server.registerTool(
  "list_projects",
  {
    description: "List all projects registered in Brain Dump...",
    inputSchema: {},
  },
  async () => {
    const projects = db.prepare("SELECT * FROM projects ORDER BY name").all();
    return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
  }
);
```

### 2. Use Zod for Input Validation

```javascript
server.registerTool(
  "create_project",
  {
    description: "Create a new project in Brain Dump...",
    inputSchema: {
      name: z.string().min(1).describe("Project display name"),
      path: z.string().min(1).describe("Absolute filesystem path"),
      color: z.string().optional().describe("Hex color (e.g., '#3b82f6')"),
    },
  },
  async ({ name, path, color }) => {
    // Handler - args are already validated by Zod
  }
);
```

### 3. Modular Tool Registration

Each tool module exports a registration function:

```javascript
// tools/projects.js
export function registerProjectTools(server, db) {
  server.registerTool("list_projects", {...}, async () => {...});
  server.registerTool("find_project_by_path", {...}, async ({ path }) => {...});
  server.registerTool("create_project", {...}, async ({ name, path, color }) => {...});
}

// index.js
import { registerProjectTools } from "./tools/projects.js";
import { registerTicketTools } from "./tools/tickets.js";
// ...

registerProjectTools(server, db);
registerTicketTools(server, db);
// ...
```

## User Stories

### Epic 1: Extract Utilities to lib/

#### US1.1: Extract logging module
- Create `lib/logging.js` with log utilities
- Export `log` object with info/warn/error/debug methods
- Export `formatLogEntry`, `rotateLogFile`, `writeToLogFile`
- Move constants: LOG_FILE, ERROR_LOG_FILE, MAX_LOG_SIZE, MAX_LOG_FILES
- **Acceptance Criteria:**
  - [ ] Logging works identically after extraction
  - [ ] File is < 150 lines
  - [ ] Exports are documented

#### US1.2: Extract XDG path utilities
- Create `lib/xdg.js` with path utilities
- Export `getDataDir`, `getStateDir`, `getLogsDir`, `getBackupsDir`
- Export `getDbPath`, `getLockFilePath`
- **Acceptance Criteria:**
  - [ ] All paths resolve correctly on Linux/macOS/Windows
  - [ ] File is < 100 lines

#### US1.3: Extract database module
- Create `lib/database.js`
- Export `initDatabase(dbPath)` function
- Include WAL mode setup, migration logic
- **Acceptance Criteria:**
  - [ ] Database initializes correctly
  - [ ] Migrations run on startup
  - [ ] File is < 200 lines

#### US1.4: Extract lock file management
- Create `lib/lock.js`
- Export `acquireLock`, `releaseLock`, `isLocked`
- Handle stale lock cleanup
- **Acceptance Criteria:**
  - [ ] Lock acquisition works
  - [ ] Stale locks are cleaned up
  - [ ] File is < 100 lines

#### US1.5: Extract backup module
- Create `lib/backup.js`
- Export backup functions: `createBackupIfNeeded`, `listBackups`, `cleanupOldBackups`
- Export `verifyBackup`, `performDailyBackupSync`
- **Acceptance Criteria:**
  - [ ] Backups create correctly
  - [ ] Cleanup works
  - [ ] File is < 200 lines

#### US1.6: Extract validation helpers
- Create `lib/validation.js`
- Export `validateRequired`, `validateEnum`
- Consider converting to Zod schemas
- **Acceptance Criteria:**
  - [ ] Validation works as before
  - [ ] File is < 50 lines

### Epic 2: Migrate to McpServer API

#### US2.1: Update dependencies
- Add `zod` to package.json
- Update `@modelcontextprotocol/sdk` if needed
- **Acceptance Criteria:**
  - [ ] Dependencies install cleanly
  - [ ] No version conflicts

#### US2.2: Create new index.js entry point
- Import `McpServer` instead of `Server`
- Create server instance
- Import and call tool registration functions
- Connect transport
- **Acceptance Criteria:**
  - [ ] Server starts and connects
  - [ ] All tools are registered
  - [ ] File is < 100 lines

### Epic 3: Extract Tool Modules

#### US3.1: Extract project tools
- Create `tools/projects.js`
- Migrate: list_projects, find_project_by_path, create_project
- Use Zod schemas for input validation
- **Acceptance Criteria:**
  - [ ] All 3 tools work correctly
  - [ ] Input validation via Zod
  - [ ] File is < 150 lines

#### US3.2: Extract ticket tools
- Create `tools/tickets.js`
- Migrate: create_ticket, list_tickets, update_ticket_status
- **Acceptance Criteria:**
  - [ ] All 3 tools work correctly
  - [ ] Input validation via Zod
  - [ ] File is < 200 lines

#### US3.3: Extract epic tools
- Create `tools/epics.js`
- Migrate: list_epics, create_epic
- **Acceptance Criteria:**
  - [ ] Both tools work correctly
  - [ ] File is < 100 lines

#### US3.4: Extract comment tools
- Create `tools/comments.js`
- Migrate: add_ticket_comment, get_ticket_comments
- **Acceptance Criteria:**
  - [ ] Both tools work correctly
  - [ ] File is < 100 lines

#### US3.5: Extract workflow tools
- Create `tools/workflow.js`
- Migrate: start_ticket_work, complete_ticket_work
- **Acceptance Criteria:**
  - [ ] Both tools work correctly
  - [ ] Git branch creation works
  - [ ] File is < 200 lines

#### US3.6: Extract git tools
- Create `tools/git.js`
- Migrate: link_commit_to_ticket
- **Acceptance Criteria:**
  - [ ] Tool works correctly
  - [ ] File is < 100 lines

#### US3.7: Extract file tools
- Create `tools/files.js`
- Migrate: link_files_to_ticket, get_tickets_for_file
- **Acceptance Criteria:**
  - [ ] Both tools work correctly
  - [ ] File is < 100 lines

#### US3.8: Extract health/settings tools
- Create `tools/health.js`
- Migrate: get_database_health, get_environment, get_project_settings, update_project_settings
- **Acceptance Criteria:**
  - [ ] All 4 tools work correctly
  - [ ] File is < 200 lines

### Epic 4: Cleanup and Testing

#### US4.1: Delete old monolithic code
- Remove legacy code from index.js
- Ensure no dead code remains
- **Acceptance Criteria:**
  - [ ] index.js is < 100 lines
  - [ ] No unused imports/code

#### US4.2: Add integration tests
- Test each tool module
- Test server startup and tool registration
- **Acceptance Criteria:**
  - [ ] All tools have at least one test
  - [ ] Tests pass

#### US4.3: Update documentation
- Update README with new architecture
- Document module structure
- **Acceptance Criteria:**
  - [ ] Architecture documented
  - [ ] Setup instructions accurate

## Technical Notes

### Import Pattern for ES Modules
```javascript
// Use .js extension for local imports
import { log } from "./lib/logging.js";
import { getDbPath } from "./lib/xdg.js";
```

### Database Access Pattern
```javascript
// Pass db instance to tool registration
export function registerProjectTools(server, db) {
  server.registerTool("list_projects", {...}, async () => {
    return db.prepare("SELECT * FROM projects").all();
  });
}
```

### Error Handling Pattern
```javascript
server.registerTool("create_project", {...}, async (args) => {
  try {
    // ... implementation
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});
```

## Success Metrics

- [ ] Total lines reduced from 2923 to ~1500 across all files
- [ ] No single file exceeds 250 lines
- [ ] All 19 tools working correctly
- [ ] Server startup time unchanged or improved
- [ ] All existing functionality preserved
