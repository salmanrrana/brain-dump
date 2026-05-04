# Brain Dump - Installation Architecture

What happens when you run `./install.sh --all`.

## Overview

```mermaid
flowchart TB
    Start["./install.sh --all"] --> OSDetect["Detect OS<br/>(macOS / Linux / Windows)"]
    OSDetect --> NodeCheck{"Node.js 18+<br/>installed?"}
    NodeCheck -->|No| NVM["Install nvm + Node.js 18"]
    NodeCheck -->|Yes| PNPMCheck
    NVM --> PNPMCheck{"pnpm<br/>installed?"}
    PNPMCheck -->|No| InstallPNPM["Install pnpm via corepack"]
    PNPMCheck -->|Yes| Deps
    InstallPNPM --> Deps

    Deps["pnpm install<br/>(project dependencies)"] --> Submodules["git submodule init<br/>(vendor/agent-skills)"]
    Submodules --> Build["pnpm build<br/>(builds web app + MCP server)"]
    Build --> Migrate["pnpm db:migrate<br/>(run Drizzle migrations)"]
    Migrate --> GlobalBin["pnpm link --global<br/>(makes 'brain-dump' CLI available)"]

    GlobalBin --> IDESetup

    subgraph IDESetup ["Provider Setup (all 7 in parallel)"]
        Claude["setup-claude-code.sh"]
        VSCode["setup-vscode.sh"]
        Cursor["setup-cursor.sh"]
        OpenCode["setup-opencode.sh"]
        Copilot["setup-copilot-cli.sh"]
        Codex["setup-codex.sh"]
        Pi["setup-pi.sh"]
    end

    IDESetup --> Summary["Print summary:<br/>installed, skipped, failed"]
```

## Prerequisites Check

| Check         | Action if Missing                  | Required By          |
| ------------- | ---------------------------------- | -------------------- |
| Node.js >= 18 | Install via nvm                    | All                  |
| pnpm          | Enable via `corepack enable pnpm`  | All                  |
| Git           | Error and exit                     | All                  |
| `gh` CLI      | Warn (optional, for PR features)   | Claude Code, Copilot |
| Docker        | Warn (optional, for Ralph sandbox) | Ralph sandbox only   |

## Per-IDE Setup Detail

### Claude Code (`scripts/setup-claude-code.sh`)

The most comprehensive setup. Claude Code gets hooks, skills, agents, commands, and plugins.

```mermaid
flowchart TB
    Start["setup-claude-code.sh"] --> BuildMCP["Build MCP server<br/>cd mcp-server && pnpm build"]
    BuildMCP --> RegisterMCP["claude mcp add brain-dump<br/>--scope user<br/>command: node mcp-server/dist/index.js"]

    RegisterMCP --> Plugins
    subgraph Plugins ["Install Plugins"]
        P1["pr-review-toolkit<br/>(code review agents)"]
        P2["code-simplifier<br/>(code simplification)"]
        P3["context7<br/>(library documentation)"]
    end

    Plugins --> Hooks
    subgraph Hooks ["Copy Hooks → ~/.claude/hooks/"]
        direction TB
        H_State["State Enforcement (3)"]
        H_Workflow["Workflow Automation (4)"]
        H_Review["Review Enforcement (3)"]
        H_Telemetry["Telemetry Capture (7)"]
        H_Tasks["Task Management (2)"]
        H_Utility["Utility (5)"]
    end

    Hooks --> HookConfig["Merge hook config into<br/>~/.claude/settings.json"]

    HookConfig --> Skills
    subgraph Skills ["Copy Skills → ~/.claude/skills/"]
        S1["brain-dump-workflow/<br/>(mandatory quality workflow)"]
        S2["tanstack-query/"]
        S3["tanstack-mutations/"]
        S4["tanstack-forms/"]
        S5["tanstack-errors/"]
        S6["tanstack-types/"]
        S7["review/"]
        S8["review-aggregation/"]
    end

    Skills --> Commands["Copy Commands → ~/.claude/commands/"]
    Commands --> Done["Claude Code setup complete"]
```

**Files created/modified:**

| Location                  | File(s)                    | Purpose                                         |
| ------------------------- | -------------------------- | ----------------------------------------------- |
| `~/.claude.json`          | MCP server registration    | Tells Claude where the MCP server is            |
| `~/.claude/settings.json` | Hook configuration         | Maps hooks to tool events                       |
| `~/.claude/hooks/`        | 10 shell scripts + helpers | State enforcement, review gating, automation    |
| `~/.claude/skills/`       | 3 skill directories        | brain-dump-workflow, review, review-aggregation |
| `~/.claude/commands/`     | Slash commands             | /next-task, /review-ticket, /demo, etc.         |

**Note:** Agent personas are inlined into commands (no separate `~/.claude/agents/` directory). Project-specific skills (react-best-practices, tanstack-\*, web-design-guidelines) live in each project's `.claude/skills/` directory. Telemetry is handled by MCP self-instrumentation (no telemetry hooks).

### VS Code (`scripts/setup-vscode.sh`)

```mermaid
flowchart TB
    Start["setup-vscode.sh"] --> Detect["Detect VS Code install path"]
    Detect --> MCPConfig["Create .vscode/mcp.json<br/>(MCP server reference)"]
    MCPConfig --> Settings["Update .vscode/settings.json<br/>(workspace settings)"]
    Settings --> Skills["Copy skills → .vscode/skills/"]
    Skills --> Agents["Copy agent definitions"]
    Agents --> Done["VS Code setup complete"]
```

**Files created/modified:**

| Location                | File(s)            | Purpose                              |
| ----------------------- | ------------------ | ------------------------------------ |
| `.vscode/mcp.json`      | MCP server config  | Points to `mcp-server/dist/index.js` |
| `.vscode/settings.json` | Workspace settings | Editor preferences                   |
| `.vscode/skills/`       | Skill files        | brain-dump-workflow, tanstack-\*     |

**Note:** No hooks in VS Code. MCP tool preconditions enforce workflow (returns error messages guiding the user to correct state).

### Cursor (`scripts/setup-cursor.sh`)

```mermaid
flowchart TB
    Start["setup-cursor.sh"] --> Detect["Detect Cursor install path"]
    Detect --> Rules["Create .cursor/rules/<br/>(workspace rules)"]
    Rules --> Skills["Copy skills → .cursor/skills/"]
    Skills --> MCPConfig["Configure MCP in Cursor settings"]
    MCPConfig --> Done["Cursor setup complete"]
```

**Files created/modified:**

| Location          | File(s)          | Purpose               |
| ----------------- | ---------------- | --------------------- |
| `.cursor/rules/`  | Rule files       | Workspace conventions |
| `.cursor/skills/` | Skill files      | brain-dump-workflow   |
| Cursor settings   | MCP registration | Points to MCP server  |

### OpenCode (`scripts/setup-opencode.sh`)

OpenCode is unique — it uses **TypeScript plugins** instead of shell hooks.

```mermaid
flowchart TB
    Start["setup-opencode.sh"] --> Config["Create .opencode/opencode.json"]

    Config --> MCPReg["Register MCP server<br/>type: 'local'<br/>command: node mcp-server/dist/index.js"]

    MCPReg --> Tools["Declare 9 tools:<br/>brain-dump_workflow<br/>brain-dump_ticket<br/>brain-dump_session<br/>brain-dump_review<br/>brain-dump_telemetry<br/>brain-dump_comment<br/>brain-dump_epic<br/>brain-dump_project<br/>brain-dump_admin"]

    Tools --> Plugins
    subgraph Plugins ["Install Plugins → .opencode/plugins/"]
        P1["brain-dump-telemetry.ts<br/>(captures session, tools, prompts)"]
        P2["brain-dump-review-guard.ts<br/>(blocks writes until review done)"]
        P3["brain-dump-review-marker.ts<br/>(marks review completed)"]
    end

    Plugins --> Skills["Copy skills → .opencode/skill/"]
    Skills --> Agents["Copy agent definitions"]
    Agents --> Done["OpenCode setup complete"]
```

**Files created/modified:**

| Location                  | File(s)              | Purpose                                            |
| ------------------------- | -------------------- | -------------------------------------------------- |
| `.opencode/opencode.json` | Main config          | MCP server + tool declarations                     |
| `.opencode/plugins/`      | 3 TypeScript plugins | Telemetry, review guard, review marker             |
| `.opencode/skill/`        | Skill files          | brain-dump-workflow, ralph-autonomous, tanstack-\* |
| `.opencode/agents/`       | Agent definitions    | Review agents                                      |

### Copilot CLI (`scripts/setup-copilot-cli.sh`)

Copilot CLI uses **global hooks** similar to Claude Code, but stored in `~/.copilot/`.

```mermaid
flowchart TB
    Start["setup-copilot-cli.sh"] --> CreateDir["mkdir -p ~/.copilot/hooks/"]
    CreateDir --> MCPConfig["Create ~/.copilot/mcp-config.json<br/>(MCP server reference)"]

    MCPConfig --> Hooks
    subgraph Hooks ["Install Global Hooks → ~/.copilot/hooks/"]
        H1["enforce-state-before-write.sh<br/>(PreToolUse)"]
        H2["start-telemetry.sh<br/>(SessionStart)"]
        H3["log-tool-start.sh<br/>(PreToolUse)"]
        H4["log-tool-end.sh<br/>(PostToolUse)"]
        H5["log-prompt.sh<br/>(UserPromptSubmit)"]
        H6["end-telemetry.sh<br/>(SessionEnd)"]
    end

    Hooks --> HooksJSON["Create ~/.copilot/hooks.json<br/>(maps events to scripts)"]
    HooksJSON --> Skills["Copy skills to workspace"]
    Skills --> Done["Copilot CLI setup complete"]
```

**Files created/modified:**

| Location                     | File(s)            | Purpose                                        |
| ---------------------------- | ------------------ | ---------------------------------------------- |
| `~/.copilot/mcp-config.json` | MCP server config  | Points to `mcp-server/dist/index.js`           |
| `~/.copilot/hooks.json`      | Hook event mapping | Maps SessionStart, PreToolUse, etc. to scripts |
| `~/.copilot/hooks/`          | 6 shell scripts    | State enforcement, telemetry                   |

**Note:** Copilot hooks use `permissionDecision` format (not Claude Code's `decision` format).

### Codex (`scripts/setup-codex.sh`)

The simplest setup — just MCP server registration in a TOML config.

```mermaid
flowchart TB
    Start["setup-codex.sh"] --> Check{"~/.codex/config.toml<br/>exists?"}
    Check -->|No| Create["Create config.toml with<br/>[mcp_servers.brain-dump]"]
    Check -->|Yes| HasSection{"Has [mcp_servers.brain-dump]<br/>section?"}
    HasSection -->|Yes| Skip["Already configured, skip"]
    HasSection -->|No| CleanStray["Remove any stray<br/>brain-dump keys"]
    CleanStray --> Append["Append [mcp_servers.brain-dump]<br/>section to config.toml"]
    Create --> Done["Codex setup complete"]
    Append --> Done
    Skip --> Done
```

**Files created/modified:**

| Location               | File(s)                            | Purpose                              |
| ---------------------- | ---------------------------------- | ------------------------------------ |
| `~/.codex/config.toml` | `[mcp_servers.brain-dump]` section | Points to `mcp-server/dist/index.js` |

### Pi (`scripts/setup-pi.sh`)

Pi setup is CLI-only. It copies Brain Dump-managed prompts and skills for Pi launches, but does not configure MCP or change Pi credentials/settings.

```mermaid
flowchart TB
    Start["setup-pi.sh"] --> Detect{"pi CLI<br/>available?"}
    Detect -->|No| Warn["Warn with install guidance"]
    Detect -->|Yes| Prepare["Create ~/.pi/brain-dump<br/>managed directories"]
    Prepare --> Prompts["Copy .pi/prompts/"]
    Prompts --> Skills["Copy .pi/skills/"]
    Skills --> Done["Pi setup complete"]
    Warn --> Done
```

**Files created/modified:**

| Location       | File(s)               | Purpose                                      |
| -------------- | --------------------- | -------------------------------------------- |
| `~/.pi/`       | Brain Dump prompts    | Ticket start, review, demo, completion flows |
| `~/.pi/`       | Brain Dump skills     | Workflow, ticket selection, review guidance  |
| Project `.pi/` | Source prompts/skills | Local workflow source copied by setup        |

**Note:** Pi intentionally has no MCP server registration. Launches use the Pi CLI with Brain Dump-generated context files and environment markers for attribution.

## Post-Install: What the System Looks Like

After `./install.sh --all` completes, here is every file that was created or modified outside the project directory:

```mermaid
graph TB
    subgraph "~/.claude/ (Claude Code)"
        CC_Settings["settings.json<br/>(hook event mappings)"]
        CC_JSON["~/.claude.json<br/>(MCP server registration)"]

        subgraph CC_Hooks ["hooks/ (10 scripts)"]
            direction LR
            CCH1["enforce-state-before-write.sh"]
            CCH2["enforce-review-before-push.sh"]
            CCH3["link-commit-to-ticket.sh"]
            CCH4["spawn-next-ticket.sh"]
            CCH5["spawn-after-pr.sh"]
            CCH6["check-for-code-changes.sh"]
            CCH7["mark-review-completed.sh"]
            CCH8["capture-claude-tasks.sh"]
            CCH9["chain-extended-review.sh"]
            CCH10["detect-libraries.sh"]
        end

        subgraph CC_Skills ["skills/ (3 global)"]
            CCS1["brain-dump-workflow/"]
            CCS2["review/"]
            CCS3["review-aggregation/"]
        end

        CC_Commands["commands/"]
    end

    subgraph "~/.copilot/ (Copilot CLI)"
        CP_Config["mcp-config.json"]
        CP_HooksJSON["hooks.json"]
        subgraph CP_Hooks ["hooks/"]
            CPH1["enforce-state-before-write.sh"]
            CPH2["start-telemetry.sh"]
            CPH3["log-tool-start.sh"]
            CPH4["log-tool-end.sh"]
            CPH5["log-prompt.sh"]
            CPH6["end-telemetry.sh"]
        end
    end

    subgraph "~/.codex/ (Codex)"
        CX_Config["config.toml<br/>[mcp_servers.brain-dump]"]
    end

    subgraph "~/.pi/ (Pi)"
        PI_Prompts["prompts/"]
        PI_Skills["skills/"]
    end

    subgraph "Project Directory (workspace-scoped)"
        subgraph VS [".vscode/"]
            VS1["mcp.json"]
            VS2["settings.json"]
            VS3["skills/"]
        end

        subgraph CUR [".cursor/"]
            CUR1["rules/"]
            CUR2["skills/"]
        end

        subgraph OC [".opencode/"]
            OC1["opencode.json"]
            OC2["plugins/ (3 TypeScript files)"]
            OC3["skill/"]
            OC4["agents/"]
        end
    end
```

## IDE Capability Comparison

| Capability             |  Claude Code  |  VS Code   |   Cursor   |  OpenCode  |  Copilot CLI  |     Codex     |        Pi         |
| ---------------------- | :-----------: | :--------: | :--------: | :--------: | :-----------: | :-----------: | :---------------: |
| MCP Tools (9 tools)    |      Yes      |    Yes     |    Yes     |    Yes     |      Yes      |      Yes      |  CLI launch only  |
| State Enforcement      |  Shell hooks  | MCP errors | MCP errors | TS plugins |  Shell hooks  |  MCP errors   | Server-side start |
| Telemetry Capture      |  Shell hooks  |    MCP     |    MCP     | TS plugins |  Shell hooks  |      --       |    Env markers    |
| Auto PR Creation       |     Hook      |     --     |     --     |     --     |      --       |      --       |        --         |
| Commit Linking         |     Hook      |     --     |     --     |     --     |      --       |      --       |        --         |
| Review Enforcement     |     Hook      |     --     |     --     |   Plugin   |     Hook      |      --       |  Prompt workflow  |
| Auto-Spawn Next Ticket | Hook (opt-in) |     --     |     --     |     --     |      --       |      --       |        --         |
| Skills                 |       8       |     8      |     1      |     8+     |      --       |      --       |         3         |
| Agent Definitions      |      Yes      |    Yes     |     --     |    Yes     |      --       |      --       |        --         |
| Slash Commands         |      Yes      |     --     |     --     |     --     |      --       |      --       |        --         |
| Config Scope           | Global (`~/`) | Workspace  | Workspace  | Workspace  | Global (`~/`) | Global (`~/`) |   Global (`~/`)   |

## Uninstallation

`./uninstall.sh --all` reverses the process:

```mermaid
flowchart TB
    Start["uninstall.sh --all"] --> Claude["Remove Claude Code:<br/>claude mcp remove brain-dump<br/>rm ~/.claude/hooks/brain-dump-*<br/>rm ~/.claude/skills/brain-dump-*"]
    Start --> VSCode["Remove VS Code:<br/>rm .vscode/mcp.json<br/>rm .vscode/skills/"]
    Start --> Cursor["Remove Cursor:<br/>rm .cursor/rules/<br/>rm .cursor/skills/"]
    Start --> OpenCode["Remove OpenCode:<br/>rm .opencode/plugins/<br/>rm .opencode/skill/<br/>Clean opencode.json"]
    Start --> Copilot["Remove Copilot:<br/>rm ~/.copilot/hooks/<br/>rm ~/.copilot/mcp-config.json<br/>rm ~/.copilot/hooks.json"]
    Start --> Codex["Remove Codex:<br/>Remove [mcp_servers.brain-dump]<br/>from ~/.codex/config.toml"]
    Start --> Pi["Remove Pi:<br/>Remove Brain Dump-managed<br/>prompts and skills only"]

    Claude --> Summary
    VSCode --> Summary
    Cursor --> Summary
    OpenCode --> Summary
    Copilot --> Summary
    Codex --> Summary["Print summary"]
    Pi --> Summary
```
