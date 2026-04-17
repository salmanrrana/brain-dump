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

## Codex in the Ralph Loop

When a user launches Ralph with `aiBackend: "codex"`, the Ralph bash loop invokes Codex **non-interactively** so it exits after a single iteration and the loop can pick up the next `passes: false` ticket from `plans/prd.json` in the same terminal window (this is the same "session reset within the same terminal window" behavior used for Claude and Cursor Agent).

The generated Ralph script runs:

```bash
codex exec --dangerously-bypass-approvals-and-sandbox "$(cat "$PROMPT_FILE")"
```

### Why `exec`

`codex exec` is Codex's documented non-interactive entrypoint. The bare
`codex "<prompt>"` invocation launches the interactive TUI, which never
returns control to the parent shell — that breaks the Ralph bash loop.

### Why `--dangerously-bypass-approvals-and-sandbox`

Per the [Codex advanced config docs](https://developers.openai.com/codex/config-advanced), `--dangerously-bypass-approvals-and-sandbox` disables **both** Codex's approval prompts **and** its filesystem sandbox in a single flag. This is intentional, and it matches Claude's `--dangerously-skip-permissions` posture.

### Why we intentionally bypass the sandbox

Ralph is **not** run under Codex's sandbox (neither `--sandbox read-only` nor `--sandbox workspace-write`). This is a deliberate design decision:

- Ralph needs to `git push`, run `pnpm` scripts, read `~/.config/*`, call MCP servers, and otherwise act the way a human operator would. Codex's sandbox blocks or prompts on exactly those operations.
- Keeping Ralph outside the sandbox gives parity with Claude — Claude runs directly in the user's workspace with `--dangerously-skip-permissions`, no sandbox.
- Users who want sandboxing should run Codex manually (interactive mode), not through Ralph.

### Preflight check

The generated Ralph script probes the installed Codex CLI before looping. It verifies:

1. `codex` is on PATH.
2. `codex --help` lists an `exec` subcommand.
3. `codex exec --help` advertises `--dangerously-bypass-approvals-and-sandbox`.

If any of those checks fail, Ralph prints an upgrade hint and exits cleanly instead of hanging on a missing binary or missing flag.

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
