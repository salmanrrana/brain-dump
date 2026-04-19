---
description: Launch Ralph for an entire epic (all tickets) in any supported provider
argument-hint: [epic ID]
---

# Launch Epic

Launch Ralph (autonomous agent) for an entire epic. Ralph will work through all ready tickets in the epic sequentially. This is the CLI equivalent of clicking "Launch Epic" in the Brain Dump UI.

## Steps

1. **Resolve the epic:**

   If `$ARGUMENTS` is provided, use it as the epic ID. Otherwise:

   ```
   project tool, action: "find-by-path", path: "<current-directory>"
   epic tool, action: "list", projectId: "<project-id>"
   ```

   Present the available epics with their ticket counts and ask the user which one to launch.

2. **Show epic summary:**

   List the tickets in the epic so the user knows what Ralph will work on:

   ```
   ticket tool, action: "list-by-epic", epicId: "<epic-id>"
   ```

   Show ticket count by status (ready, in_progress, done, etc.).

3. **Ask for provider (if not obvious):**

   Supported providers:
   - `claude-code` (default) - Terminal-native Claude Code
   - `vscode` - VS Code with Copilot Chat
   - `cursor` - Cursor Editor
   - `cursor-agent` - Cursor Agent CLI (headless)
   - `copilot-cli` - GitHub Copilot CLI
   - `codex` - OpenAI Codex
   - `opencode` - Open-source AI coding

   If the user hasn't specified a provider, check project settings first:

   ```
   admin tool, action: "get-settings", projectId: "<project-id>"
   ```

   Use the configured working method, or default to `claude-code`.

4. **Ask about optional flags:**

   Only ask if the user hasn't already specified:
   - **Sandbox mode** (`--sandbox`): Run inside Docker sandbox (claude-code only)
   - **Max iterations** (`--max-iterations`): Override the Ralph loop cap per ticket
   - **Terminal** (`--terminal`): Preferred terminal emulator (ghostty, kitty, iterm2)

5. **Launch Ralph for the epic:**

   Run the CLI command via Bash:

   ```bash
   brain-dump workflow launch-epic --epic <epic-id> --provider <provider> [--sandbox] [--max-iterations <n>] [--terminal <term>] --pretty
   ```

6. **Report the result:**
   - If successful, confirm that Ralph has been launched for the epic
   - Show how many tickets will be processed
   - If failed, show the error and suggest fixes

## Examples

```bash
# Launch epic with Claude Code
brain-dump workflow launch-epic --epic abc123 --provider claude-code --pretty

# Launch epic with OpenCode and higher iteration cap
brain-dump workflow launch-epic --epic abc123 --provider opencode --max-iterations 20 --pretty

# Launch epic in Docker sandbox
brain-dump workflow launch-epic --epic abc123 --provider claude-code --sandbox --pretty

# Launch epic with Copilot CLI in Ghostty
brain-dump workflow launch-epic --epic abc123 --provider copilot-cli --terminal ghostty --pretty
```

## What Happens

When launched, Ralph will:

1. Open a new terminal window with the chosen AI environment
2. Start the epic branch (if not already started)
3. Work through each ready ticket in priority order
4. For each ticket: load context, implement, review, fix, generate demo
5. Track all progress via Brain Dump sessions and telemetry
6. Continue until all tickets are processed or max iterations reached
