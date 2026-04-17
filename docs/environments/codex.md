# Codex Integration Guide

Brain Dump supports Codex as an interactive ticket execution environment with the same MCP workflow guarantees used in other providers.

## Quick Start

### Installation

```bash
./install.sh --codex
```

This configures Brain Dump MCP in:

- `~/.codex/config.toml`

Verify with:

```bash
brain-dump doctor
```

### Using Brain Dump in Codex

1. Start Brain Dump UI:

   ```bash
   pnpm dev    # http://localhost:4242
   ```

2. Open a ticket and click **Start with Codex**.

3. Brain Dump does the workflow start server-side:
   - Creates branch
   - Sets ticket to `in_progress`
   - Captures audit comment

4. Work in Codex, run tests, then complete with MCP:
   - `workflow "complete-work"`
   - review loop
   - demo generation

## Codex Config Snippet

If you need manual setup, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.brain-dump]
command = "node"
args = ["/absolute/path/to/brain-dump/mcp-server/dist/index.js"]
env = { BRAIN_DUMP_PATH = "/absolute/path/to/brain-dump", CODEX = "1" }
```

## Troubleshooting

### Codex launch fails from ticket UI

1. Ensure Codex is installed (CLI or App):

   ```bash
   codex --version
   ```

   Or on macOS:

   ```bash
   open -Ra Codex && echo "Codex App detected"
   ```

2. Verify MCP config exists:

   ```bash
   cat ~/.codex/config.toml
   ```

3. Re-run setup:

   ```bash
   ./scripts/setup-codex.sh
   ```

4. If Brain Dump opens Codex App, read `.brain-dump-context.md` in your project root for the ticket context.

### MCP tools unavailable in Codex

- Confirm `[mcp_servers.brain-dump]` exists in `~/.codex/config.toml`
- Restart Codex after config changes
- Run `brain-dump doctor` and confirm Codex section is healthy
