# MCP Server Database Synchronization

## Problem

When Ralph runs in a separate Claude CLI instance (especially in worktrees), ticket updates made via MCP tools don't appear in the main Brain Dump UI. This happens because:

1. **Two separate processes** open connections to the same SQLite database
2. **WAL mode synchronization** requires proper coordination
3. **MCP server entry point** was pointing to stale JavaScript (`index.js`) instead of compiled TypeScript (`dist/index.js`)
4. **No automatic build step** ensured MCP was compiled when dependencies installed

## Solution

### 1. Auto-Build on Install (Permanent Fix)

The MCP server's `package.json` now includes a `postinstall` hook:

```json
{
  "scripts": {
    "postinstall": "npm run build"
  }
}
```

This ensures TypeScript is automatically compiled to `dist/` whenever dependencies are installed.

### 2. Updated Entry Point in Claude Config

Claude Code's `~/.claude.json` now points to the compiled output:

```json
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["/path/to/brain-dump/mcp-server/dist/index.js"]
    }
  }
}
```

**NEVER point to `index.js` or `index.ts`** - always use `dist/index.js`.

### 3. Automated Fix Script

Run this if MCP updates aren't syncing:

```bash
./scripts/fix-mcp-server-path.sh
```

This script:

- Validates the compiled MCP server exists
- Updates `~/.claude.json` with correct path
- Confirms configuration is valid

## How It Works

### Build Pipeline

```
pnpm install
  ↓
mcp-server/package.json postinstall hook runs
  ↓
mcp-server/dist/index.js compiled (TypeScript → JavaScript)
  ↓
Claude Code MCP server starts from dist/index.js
  ↓
Database updates sync properly
```

### Worktree Setup

When Ralph creates a worktree:

1. **Worktree directory created** at sibling location
2. **Git worktree initialized** with separate working tree
3. **Dependencies installed** via `pnpm install`
   - ✅ MCP server build triggered automatically
   - ✅ Compiled `dist/index.js` available
4. **Claude CLI starts** in worktree
   - ✅ Reads MCP config from `~/.claude.json`
   - ✅ Connects to main project's database
   - ✅ Ticket updates sync back to main UI

## Troubleshooting

### MCP updates not syncing

1. **Verify build completed**:

   ```bash
   ls -la mcp-server/dist/index.js
   ```

2. **Check Claude config**:

   ```bash
   cat ~/.claude.json | grep "brain-dump"
   ```

3. **Ensure path has `/dist/`**:

   ```bash
   # Correct ✓
   "args": [".../mcp-server/dist/index.js"]

   # Wrong ✗
   "args": [".../mcp-server/index.js"]
   ```

4. **Run fixer**:
   ```bash
   ./scripts/fix-mcp-server-path.sh
   ```

### Worktree not seeing database updates

1. Confirm main project database is at `~/Library/Application Support/brain-dump/brain-dump.db` (macOS)
2. Both processes use same database path via XDG utilities
3. Verify no lock file conflicts:
   ```bash
   cat ~/.local/state/brain-dump/brain-dump.lock
   ```

## Testing

### Single-process test (Main App)

```bash
# Ticket updates from UI → visible immediately
pnpm dev
```

### Multi-process test (Ralph in Worktree)

```bash
# 1. Main app running
pnpm dev

# 2. Start Ralph on an epic
# Ticket updates from Claude → visible in main UI after ~1s
```

## Key Files

- **Build script**: `mcp-server/package.json` (postinstall hook)
- **Compilation config**: `mcp-server/tsconfig.json`
- **Entry point**: `mcp-server/dist/index.js` (generated)
- **Fixer script**: `scripts/fix-mcp-server-path.sh`
- **Install validation**: `scripts/install.sh` (install_mcp_dependencies)

## Prevention

### For Developers

- ✅ Always commit changes to `src/` NOT `dist/`
- ✅ Never manually edit `dist/` files
- ✅ Test multi-process scenarios: `pnpm dev` + Ralph worktree
- ✅ Run install script on major version bumps

### For New Worktrees

The setup is now automatic:

1. When pnpm installs dependencies → MCP builds
2. When Claude starts → uses compiled dist/index.js
3. Database updates sync without manual intervention

## Related

- [CLAUDE.md - End-to-End Feature Implementation](../CLAUDE.md#end-to-end-feature-implementation-critical)
- [CLAUDE.md - Worktree Workflow](../CLAUDE.md#git-worktree-workflow)
- [Ralph Workflow Documentation](../docs/workflows.md#ralph-workflow)
