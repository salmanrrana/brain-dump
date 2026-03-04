# Brain Dump OpenCode Integration

This directory contains OpenCode-specific integration files for Brain Dump, including plugins, skills, agents, and configuration examples.

## Components

### 1. Safety Plugins (`plugins/`)

- **brain-dump-review-guard.ts** — Prevents push without completing AI review
- **brain-dump-review-marker.ts** — Marks code review completion

### 2. Agents (`agent/`)

Three core agents:

- **ralph.md** — Autonomous ticket implementation agent
- **planner.md** — Designs implementation plans for complex features
- **ticket-worker.md** — Implements individual tickets with human guidance

Review agents (code-reviewer, code-simplifier, silent-failure-hunter) are invoked
via commands, not separate agent files.

### 3. Workflow Guidance (`AGENTS.md`)

Documentation for AI agents working with Brain Dump tickets.

- Workflow state machine (backlog → ready → in_progress → ai_review → human_review → done)
- MCP tool reference and rules
- Troubleshooting

### 4. Skills (`skill/`)

- **brain-dump-workflow** — Auto-activated skill providing context-aware workflow guidance
- **ralph-autonomous** — Ralph-specific autonomous workflow patterns

### 5. Configuration Example (`opencode.json.example`)

Template for `opencode.json` configuration.

## Setup

Run the automated setup script:

```bash
scripts/setup-opencode.sh
```

This handles:

1. Building the MCP server
2. Configuring `opencode.json` with MCP server entry
3. Installing safety plugins
4. Copying workflow documentation (AGENTS.md)
5. Installing the brain-dump-workflow skill
6. Installing the Ralph agent

### Manual Setup

1. **Configure MCP server in `opencode.json`:**

   ```json
   {
     "mcp": {
       "brain-dump": {
         "type": "local",
         "command": ["node", "/path/to/brain-dump/mcp-server/dist/index.js"],
         "enabled": true,
         "environment": { "BRAIN_DUMP_PATH": "/path/to/brain-dump", "OPENCODE": "1" }
       }
     }
   }
   ```

2. **Install plugins:**

   ```bash
   mkdir -p ~/.config/opencode/plugins
   cp plugins/brain-dump-review-guard.ts ~/.config/opencode/plugins/
   cp plugins/brain-dump-review-marker.ts ~/.config/opencode/plugins/
   ```

3. **Restart OpenCode** to load new configurations

## MCP Tools Available

Once configured, these tools are automatically available:

### Tickets

- `workflow "start-work"` — Begin working on ticket
- `workflow "complete-work"` — Mark ticket for review
- `ticket "list"` — See tickets in project
- `epic "list"` — See project epics

### Review & Quality

- `review "submit-finding"` — Post review findings
- `review "mark-fixed"` — Mark issue resolved
- `review "check-complete"` — Verify all critical issues fixed
- `review "generate-demo"` — Create demo for human review

### Telemetry

Telemetry is handled by MCP self-instrumentation — the MCP server automatically
captures tool call events, session lifecycle, and correlation IDs. No external
plugin is needed.

## Privacy & Security

### Parameter Sanitization

Tool parameters are automatically sanitized by the MCP server:

- Strings > 100 chars: `[N chars]`
- Large objects: summarized
- Sensitive data: Not logged

### Local Storage

All data is stored locally in the Brain Dump SQLite database. No external transmission.

## Troubleshooting

### MCP Server Not Connecting

1. **Check path:** Verify MCP server path in `opencode.json`
2. **Check build:** Run `pnpm build` in `mcp-server/`
3. **Check Node:** `node --version` should work

### Plugin Not Loading

1. **Check permissions:** Plugin files must be readable
2. **Check OpenCode version:** Requires OpenCode with plugin support

## Contributing

To improve the OpenCode integration:

1. Update plugins in `plugins/` (safety-net logic)
2. Update `AGENTS.md` (workflow documentation)
3. Test with latest OpenCode version
4. Submit PR to brain-dump repository
