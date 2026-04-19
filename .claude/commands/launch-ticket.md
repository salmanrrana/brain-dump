---
description: Launch Ralph for a single ticket in any supported provider
argument-hint: [ticket ID]
---

# Launch Ticket

Launch Ralph (autonomous agent) for a single ticket. This is the CLI equivalent of clicking "Start with Ralph" in the Brain Dump UI.

## Steps

1. **Resolve the ticket:**

   If `$ARGUMENTS` is provided, use it as the ticket ID. Otherwise:

   ```
   project tool, action: "find-by-path", path: "<current-directory>"
   ticket tool, action: "list", projectId: "<project-id>", status: "ready", limit: 10
   ```

   Present the available tickets and ask the user which one to launch.

2. **Ask for provider (if not obvious):**

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

3. **Ask about optional flags:**

   Only ask if the user hasn't already specified:
   - **Sandbox mode** (`--sandbox`): Run inside Docker sandbox (claude-code only)
   - **Max iterations** (`--max-iterations`): Override the Ralph loop cap
   - **Terminal** (`--terminal`): Preferred terminal emulator (ghostty, kitty, iterm2)

4. **Launch Ralph:**

   Run the CLI command via Bash:

   ```bash
   brain-dump workflow launch-ticket --ticket <ticket-id> --provider <provider> [--sandbox] [--max-iterations <n>] [--terminal <term>] --pretty
   ```

5. **Report the result:**
   - If successful, confirm that Ralph has been launched with the ticket context
   - If failed, show the error and suggest fixes (e.g., ticket not in ready/in_progress status)

## Examples

```bash
# Launch with Claude Code (default)
brain-dump workflow launch-ticket --ticket abc123 --provider claude-code --pretty

# Launch with Codex in a specific terminal
brain-dump workflow launch-ticket --ticket abc123 --provider codex --terminal ghostty --pretty

# Launch in Docker sandbox
brain-dump workflow launch-ticket --ticket abc123 --provider claude-code --sandbox --pretty

# Launch with custom iteration limit
brain-dump workflow launch-ticket --ticket abc123 --provider cursor-agent --max-iterations 30 --pretty
```

## What Happens

When launched, Ralph will:

1. Open a new terminal window with the chosen AI environment
2. Load full ticket context (description, acceptance criteria, linked files)
3. Begin the autonomous implementation loop
4. Track progress via Brain Dump sessions and telemetry
5. Follow the Universal Quality Workflow (implement -> review -> fix -> demo)
