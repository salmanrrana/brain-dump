# VS Code Troubleshooting Guide

Solutions for common VS Code integration issues with Brain Dumpy.

## MCP Connection Issues

### MCP Server Not Listed in VS Code

**Symptoms**: Brain Dumpy doesn't appear in VS Code's MCP panel.

**Solutions**:

1. Verify VS Code version (requires 1.99+):
   ```
   Help > About (shows version number)
   ```

2. Check `.vscode/mcp.json` exists and is valid:
   ```bash
   cat .vscode/mcp.json
   # Should be valid JSON, not JSONC (no comments in production)
   ```

3. Remove comments from mcp.json if copied from example:
   ```bash
   # The example file has JSONC comments - VS Code may not accept them
   # Create a clean version:
   {
     "servers": {
       "brain-dumpy": {
         "type": "stdio",
         "command": "node",
         "args": ["/path/to/brain-dumpy/mcp-server/index.js"]
       }
     }
   }
   ```

4. Reload VS Code window:
   - `Cmd+Shift+P` / `Ctrl+Shift+P`
   - Type "Reload Window"
   - Press Enter

### MCP Server Connects But Tools Don't Work

**Symptoms**: Server shows connected but tool calls fail.

**Solutions**:

1. Verify the path in mcp.json is absolute:
   ```json
   "args": ["/home/user/brain-dumpy/mcp-server/index.js"]  // Good
   "args": ["./mcp-server/index.js"]                       // Bad - relative paths may fail
   ```

2. Test the MCP server directly:
   ```bash
   node /path/to/brain-dumpy/mcp-server/index.js 2>&1
   # Should output MCP initialization messages
   # Press Ctrl+C to exit
   ```

3. Check Node.js is in PATH:
   ```bash
   which node
   node --version
   ```

4. Check for startup errors in MCP server logs:
   ```bash
   tail -50 ~/.local/state/brain-dumpy/logs/mcp-server.log
   ```

### "Database not found" in MCP Tools

**Symptoms**: Tools report database doesn't exist.

**Solutions**:

1. Run Brain Dumpy once to initialize database:
   ```bash
   cd /path/to/brain-dumpy
   pnpm dev
   # Open http://localhost:4242 and create a project
   # Press Ctrl+C to stop
   ```

2. Check database location:
   ```bash
   ls -la ~/.local/share/brain-dumpy/brain-dumpy.db
   # If missing, the MCP server will create it on first use
   ```

3. If using legacy path, run migration:
   ```bash
   ls -la ~/.brain-dump/brain-dump.db
   # If this exists, start Brain Dumpy to auto-migrate
   ```

## Agent Issues

### Custom Agents Not Appearing

**Symptoms**: `@inception`, `@breakdown`, `@ralph`, `@simplify` not available in Copilot Chat.

**Solutions**:

1. Verify GitHub Copilot is installed and enabled:
   - Open Extensions sidebar
   - Search "GitHub Copilot"
   - Ensure it's installed and enabled

2. Check agent files exist:
   ```bash
   ls -la .github/agents/
   # Should show: breakdown.agent.md, inception.agent.md, ralph.agent.md, simplify.agent.md
   ```

3. Verify agent file format:
   - Files must have `.agent.md` extension
   - Must have valid YAML frontmatter
   - Must be in `.github/agents/` directory

4. Reload VS Code completely (not just the window):
   - Close VS Code
   - Reopen VS Code
   - Open the project folder

### Agents Load But Don't Have MCP Tools

**Symptoms**: Agent responds but can't access Brain Dumpy tools.

**Solutions**:

1. Check MCP server is connected (see above)

2. Verify agent frontmatter includes correct tools:
   ```yaml
   tools:
     - brain-dumpy/list_projects
     - brain-dumpy/create_ticket
     # etc.
   ```

3. Use full tool names with prefix:
   ```
   brain-dumpy/list_projects   // Correct
   list_projects               // May not work
   ```

### Agent Handoffs Not Working

**Symptoms**: `@agent -> @another_agent` transitions fail.

**Solutions**:

1. Verify handoffs are configured in agent frontmatter:
   ```yaml
   handoffs:
     - label: "Create Tickets"
       agent: "breakdown"
       prompt: "Analyze the spec and create tickets"
   ```

2. Ensure target agent exists:
   ```bash
   ls .github/agents/*.agent.md
   ```

3. Try mentioning agent directly instead of handoff:
   ```
   @breakdown Please analyze spec.md and create tickets
   ```

## Common Tool Errors

### "Project not found" Error

**Symptoms**: Tools fail saying project doesn't exist.

**Solutions**:

1. Check project is registered:
   ```
   Ask Copilot: "List all Brain Dumpy projects"
   ```

2. Create project if missing:
   ```
   Ask Copilot: "Create a project called 'my-project' at /path/to/project"
   ```

3. Verify project path matches:
   - Project paths in Brain Dumpy are filesystem paths
   - Must match exactly (case-sensitive on Linux)

### "Ticket not found" Error

**Symptoms**: Operations on ticket ID fail.

**Solutions**:

1. Verify ticket ID format (UUID):
   ```
   Valid: 46f5a13a-35d8-40d0-8c29-27f338daa1a4
   Invalid: BD-123, #123
   ```

2. List tickets to find correct ID:
   ```
   Ask Copilot: "List all tickets in project [name]"
   ```

### Start/Complete Work Fails

**Symptoms**: `start_ticket_work` or `complete_ticket_work` errors.

**Solutions**:

1. For start_ticket_work:
   - Ensure ticket exists and is not already in_progress
   - Verify project path is a git repository
   - Check you have write permissions

2. For complete_ticket_work:
   - Ticket must be in_progress (not backlog or already done)
   - Git operations may fail if not on a feature branch

3. Check git status manually:
   ```bash
   cd /path/to/project
   git status
   git branch --show-current
   ```

## Debug Logging

### Enable Verbose Logging

For MCP server debugging:

```bash
# Set log level to debug
export LOG_LEVEL=debug

# Run MCP server directly to see output
node /path/to/brain-dumpy/mcp-server/index.js 2>&1 | tee mcp-debug.log
```

### Check Log Files

| Log | Location | Content |
|-----|----------|---------|
| MCP Server | `~/.local/state/brain-dumpy/logs/mcp-server.log` | Tool calls, errors |
| Errors | `~/.local/state/brain-dumpy/logs/error.log` | All errors |
| Main App | `~/.local/state/brain-dumpy/logs/brain-dumpy.log` | General operations |

View recent log entries:
```bash
tail -100 ~/.local/state/brain-dumpy/logs/mcp-server.log
```

Search for errors:
```bash
grep -i error ~/.local/state/brain-dumpy/logs/*.log
```

## Known Limitations

### VS Code MCP Support

- MCP support requires VS Code 1.99 or later
- Some MCP features may be experimental
- Configuration changes require window reload

### Agent Limitations

- Agents may not have access to all VS Code features
- Handoff prompts are suggestions, not automatic transitions
- Tool availability depends on MCP server connection

### Brain Dumpy MCP Tools

- No `update_ticket` for full ticket updates (only status)
- No `delete_ticket` or `delete_epic` tools
- No `get_ticket` for single ticket lookup by ID
- Ticket IDs are UUIDs, not sequential numbers

### Git Integration

- `start_ticket_work` requires project to be a git repository
- Branch naming follows `feature/{id}-{slug}` pattern
- Some git operations may fail if working directory is dirty

## Getting Help

### Before Reporting Issues

1. Check this guide and [general troubleshooting](troubleshooting.md)
2. Verify VS Code version and extensions
3. Run `pnpm brain-dump check --full` for database health
4. Collect relevant logs

### Reporting Issues

Open an issue at https://github.com/salmanrrana/brain-dump/issues with:

- VS Code version
- GitHub Copilot / Continue version
- Node.js version (`node --version`)
- Error messages (exact text)
- Relevant log entries
- Steps to reproduce

## See Also

- [VS Code Quick Start](vscode-quickstart.md) - Setup guide
- [Fresh Eyes Workflow](fresh-eyes-workflow.md) - Context management
- [General Troubleshooting](troubleshooting.md) - Database and CLI issues
