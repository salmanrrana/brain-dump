# Brain Dump OpenCode Integration

This directory contains OpenCode-specific integration files for Brain Dump, including plugins, skills, and configuration examples.

## Components

### 1. Telemetry Plugin (`plugins/brain-dump-telemetry.ts`)

Automatic telemetry capture for all AI work sessions in OpenCode.

**Features:**

- Session lifecycle tracking (create, idle, error)
- Tool execution telemetry with correlation IDs
- User prompt capture (with optional redaction)
- Automatic MCP tool invocation

**Installation:**

```bash
# Global installation
mkdir -p ~/.config/opencode/plugins
cp plugins/brain-dump-telemetry.ts ~/.config/opencode/plugins/

# Or project-local installation
cp plugins/brain-dump-telemetry.ts .opencode/plugins/
```

### 2. Workflow Guidance (`AGENTS.md`)

Documentation for AI agents working with Brain Dump tickets.

**What it covers:**

- Workflow state machine (backlog → ready → in_progress → ai_review → human_review → done)
- MCP tool reference
- Best practices for implementation
- Code quality standards
- Common patterns (features, bugs, refactors, docs)
- Troubleshooting

**Usage:** OpenCode agents will reference this automatically when working on tickets.

### 3. Configuration Example (`opencode.json.example`)

Template for `opencode.json` configuration.

**What to configure:**

- MCP server path (update `/path/to/brain-dump/mcp-server/index.js`)
- Plugin directory
- Skills directory
- Project metadata

**Usage:**

```bash
cp opencode.json.example opencode.json
# Then edit opencode.json to set correct paths
```

## Setup Instructions

### For OpenCode Users

1. **Install the telemetry plugin:**

   ```bash
   mkdir -p ~/.config/opencode/plugins
   cp plugins/brain-dump-telemetry.ts ~/.config/opencode/plugins/brain-dump-telemetry.ts
   ```

2. **Configure MCP server in `opencode.json`:**

   ```json
   {
     "mcp": {
       "servers": {
         "brain-dump": {
           "type": "local",
           "command": "node",
           "args": ["/path/to/brain-dump/mcp-server/index.js"]
         }
       }
     }
   }
   ```

3. **Restart OpenCode** - The plugin and MCP server will be available

### For Project Developers

If you want Brain Dump integration in your specific project:

1. **Copy configuration to project root:**

   ```bash
   cp opencode.json.example opencode.json
   cp -r plugins .opencode/plugins
   ```

2. **Update `opencode.json`:**

   ```json
   {
     "mcp": {
       "servers": {
         "brain-dump": {
           "command": "node",
           "args": ["./mcp-server/index.js"]
         }
       }
     }
   }
   ```

3. **Done!** - OpenCode will load local configuration

## Features by Lifecycle Event

### Session Events

**session.created**

- Automatically starts telemetry session
- Detects active ticket (if in Brain Dump project)
- Prompts to activate session tracking

**session.idle**

- Automatically ends telemetry
- Flushes pending events to database
- Logs session outcome

**session.error**

- Catches session errors
- Ends telemetry with failure outcome
- Records error for debugging

### Tool Events

**tool.execute.before**

- Generates correlation ID
- Records tool start
- Captures parameters (sanitized)

**tool.execute.after**

- Records tool end
- Calculates duration
- Marks as successful

**tool.execute.error**

- Records tool failure
- Captures error message
- Marks as failed

### Prompt Events

**prompt.before.submit**

- Captures user prompt
- Records prompt length
- Optional redaction for privacy

## MCP Tools Available

Once configured, these tools are automatically available:

### Tickets

- `list_projects` - See your projects
- `list_tickets` - See tickets in project
- `start_ticket_work` - Begin working on ticket
- `complete_ticket_work` - Mark ticket for review
- `list_epics` - See project epics

### Review & Quality

- `submit_review_finding` - Post review findings
- `mark_finding_fixed` - Mark issue resolved
- `check_review_complete` - Verify all critical issues fixed
- `generate_demo_script` - Create demo for human review

### Telemetry

- `start_telemetry_session` - Begin tracking
- `log_tool_event` - Record tool usage
- `log_prompt_event` - Record prompts
- `end_telemetry_session` - Finalize tracking

## Telemetry Data Flow

```
┌─────────────────────────────────────┐
│ OpenCode Session Starts             │
│ (session.created event)             │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Telemetry Plugin Activates          │
│ - Calls start_telemetry_session     │
│ - Stores session ID                 │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Tool & Prompt Events Captured       │
│ - tool.execute.before/after         │
│ - prompt.before.submit              │
│ - Logs with correlation IDs         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Session Ends                        │
│ (session.idle or session.error)     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Telemetry Finalized                 │
│ - Calls end_telemetry_session       │
│ - All events flushed to database    │
└─────────────────────────────────────┘
```

## Privacy & Security

### Prompt Redaction

By default, prompts are stored verbatim. To enable redaction:

Edit `brain-dump-telemetry.ts` and change:

```typescript
redact: false; // Change to true
```

This hashes prompts instead of storing them.

### Parameter Sanitization

Tool parameters are automatically sanitized:

- Strings > 100 chars: `[N chars]`
- Large objects: `[object]`
- Sensitive data: Not logged

### Local Storage

All telemetry is stored locally:

- OpenCode: `.opencode/` directory
- Database: Brain Dump SQLite database
- No external transmission

## Testing

### Verify Plugin Load

```bash
# Check OpenCode recognizes the plugin
opencode info --plugins
```

### Verify MCP Server

```bash
# Test MCP connection
opencode mcp debug brain-dump

# Should show:
# ✓ Connected to brain-dump MCP server
# ✓ Available tools: [list of tools]
```

### Manual Telemetry Test

1. Start OpenCode session with Brain Dump project
2. Use any MCP tool (e.g., `list_tickets`)
3. End session
4. Check database: telemetry events should be recorded

## Troubleshooting

### Plugin Not Loading

1. **Check syntax:** TypeScript syntax errors prevent load

   ```bash
   npx tsc --noEmit plugins/brain-dump-telemetry.ts
   ```

2. **Check permissions:** Plugin file must be readable

   ```bash
   chmod +r ~/.config/opencode/plugins/brain-dump-telemetry.ts
   ```

3. **Check OpenCode version:** Requires OpenCode with plugin support

### MCP Server Not Connecting

1. **Check path:** Verify MCP server path in `opencode.json`
2. **Check Node:** `node --version` should work
3. **Check permissions:** MCP script must be executable

### No Telemetry Data

1. **Check session:** Plugin only logs when session.created fires
2. **Check tools:** Only MCP tool calls are logged, not UI interactions
3. **Check database:** Verify Brain Dump database location

## Documentation

- **Spec:** `plans/specs/universal-quality-workflow.md` (OpenCode section)
- **API:** https://opencode.ai/docs/plugins/
- **Workflow:** `AGENTS.md` (this directory)

## Examples

### Example: Workflow Integration

```typescript
// OpenCode asks Claude to start working on a ticket
// Claude calls: start_ticket_work({ ticketId: "abc-123" })
// Plugin telemetry automatically captures:
// - Tool call start
// - Tool parameters
// - Tool execution duration
// - Tool result summary
// - All stored with session context
```

### Example: Session Tracking

```typescript
// User starts OpenCode session
// session.created event fires
// Plugin starts telemetry session

// ... user works on ticket ...

// User stops OpenCode
// session.idle event fires
// Plugin ends telemetry session
// All queued events flushed to database
```

## Contributing

To improve the OpenCode integration:

1. Update `brain-dump-telemetry.ts` (plugin logic)
2. Update `AGENTS.md` (workflow documentation)
3. Test with latest OpenCode version
4. Submit PR to brain-dump repository
