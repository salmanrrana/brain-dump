## 7. Human Review Approval UI

**This is a critical piece of the workflow** - without UI for human approval, the workflow cannot complete.

### Current State

Currently there is **NO UI** for:

- Viewing demo steps
- Marking steps as passed/failed
- Approving/rejecting a ticket in `human_review` status
- Providing feedback that triggers next actions

### Required UI Components

#### 7.1 Demo Steps Panel (Ticket Detail Page)

When a ticket is in `human_review` status, show the demo panel:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🧪 Demo: Claude Tasks Integration                    [Run Demo] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Complete these steps to verify the feature works:               │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Step 1                                          [✓] [✗] [—] │ │
│ │ Run `pnpm dev` and open http://localhost:4242               │ │
│ │ Expected: App loads without errors                          │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Notes (optional): ________________________________      │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Step 2                                          [✓] [✗] [—] │ │
│ │ Click on any ticket in "In Progress" column                 │ │
│ │ Expected: Ticket modal opens with Claude Tasks section      │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Notes (optional): ________________________________      │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Step 3                                          [ ] [ ] [ ] │ │
│ │ Verify tasks are displayed with correct statuses            │ │
│ │ Expected: See pending (○), in_progress (▶), completed (✓)   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Progress: 2/3 steps verified                                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Overall Feedback:                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │ ________________________________________________            │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Approve & Complete ✓]              [Request Changes ✗]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 7.2 Step Status Icons

| Icon  | Meaning | Action                           |
| ----- | ------- | -------------------------------- |
| `[✓]` | Passed  | Step verified, works as expected |
| `[✗]` | Failed  | Step failed, needs fix           |
| `[—]` | Skipped | Not applicable or can't test     |
| `[ ]` | Pending | Not yet verified                 |

#### 7.3 Approval Actions

**Approve & Complete**:

1. Validates all steps are marked (passed/failed/skipped)
2. Calls `submit_demo_feedback({ demoId, passed: true, feedback, stepResults })`
3. Moves ticket to `done` status
4. Creates `demo_result` comment
5. Triggers learnings reconciliation prompt
6. Shows success toast with next steps

**Request Changes**:

1. Requires at least one failed step OR feedback text
2. Calls `submit_demo_feedback({ demoId, passed: false, feedback, stepResults })`
3. Keeps ticket in `human_review` (or moves to `in_progress` for major issues)
4. Creates `demo_result` comment with issues
5. Notifies AI (via comment) what needs fixing

#### 7.4 Kanban Board Integration

The `human_review` column should show visual indicator that action is needed:

```
┌─────────────────────┐
│ Human Review (2)  🔔│  ← Notification badge
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ Ticket Title    │ │
│ │ ────────────────│ │
│ │ 🧪 Demo Ready   │ │  ← Badge showing demo is ready
│ │ [Review Now →]  │ │  ← Quick action button
│ └─────────────────┘ │
└─────────────────────┘
```

#### 7.5 Notification System

When a ticket enters `human_review`:

1. Show toast notification: "Ticket ready for human review"
2. Add badge to sidebar/header
3. (Optional) Browser notification if enabled
4. (Optional) Email notification if configured

#### 7.6 Ticket Detail Page Changes

When viewing a ticket in `human_review` status:

```
┌─────────────────────────────────────────────────────────────────┐
│ Ticket: Add Claude Tasks Integration                            │
│ Status: [Human Review] 🔔 Action Required                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ 🧪 Demo Verification ──────────────────────────────────────┐ │
│ │                                                             │ │
│ │  This ticket is ready for human verification.               │ │
│ │  Please run through the demo steps below.                   │ │
│ │                                                             │ │
│ │  [Start Demo Review →]                                      │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Description                                                     │
│ ───────────────────────────────────────────────────────────────│
│ [ticket description...]                                         │
│                                                                 │
│ Claude Tasks (5)                                                │
│ ───────────────────────────────────────────────────────────────│
│ [task list...]                                                  │
│                                                                 │
│ Activity                                                        │
│ ───────────────────────────────────────────────────────────────│
│ [comments showing review passed, demo generated, etc.]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow for Human Approval

```
┌─────────────────────────────────────────────────────────────────┐
│                    HUMAN REVIEW FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AI Review Passes                                               │
│       │                                                         │
│       ▼                                                         │
│  generate_demo_script()  ──► Creates demo_scripts record        │
│       │                                                         │
│       ▼                                                         │
│  Ticket status → human_review                                   │
│       │                                                         │
│       ▼                                                         │
│  UI shows "Demo Ready" badge                                    │
│       │                                                         │
│       ▼                                                         │
│  Human clicks "Start Demo Review"                               │
│       │                                                         │
│       ▼                                                         │
│  Human verifies each step (✓/✗/—)                               │
│       │                                                         │
│       ▼                                                         │
│  Human provides feedback                                        │
│       │                                                         │
│       ├──► [Approve] ──► submit_demo_feedback(passed: true)     │
│       │                         │                               │
│       │                         ▼                               │
│       │                  Ticket → done                          │
│       │                         │                               │
│       │                         ▼                               │
│       │                  Trigger: /reconcile-learnings          │
│       │                         │                               │
│       │                         ▼                               │
│       │                  Trigger: /next-task (if epic)          │
│       │                                                         │
│       └──► [Reject] ───► submit_demo_feedback(passed: false)    │
│                                │                                │
│                                ▼                                │
│                         Ticket stays in human_review            │
│                         (or → in_progress if major)             │
│                                │                                │
│                                ▼                                │
│                         Comment added with issues               │
│                                │                                │
│                                ▼                                │
│                         AI can see feedback & fix               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Endpoints Needed

| Endpoint             | Method | Purpose                              |
| -------------------- | ------ | ------------------------------------ |
| `getDemoScript`      | GET    | Fetch demo for a ticket              |
| `updateDemoStep`     | POST   | Mark a step as passed/failed/skipped |
| `submitDemoFeedback` | POST   | Submit overall approval/rejection    |

### React Components Needed

| Component                 | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `DemoPanel.tsx`           | Main container for demo verification        |
| `DemoStep.tsx`            | Individual step with pass/fail/skip buttons |
| `DemoApprovalButtons.tsx` | Approve/Reject action buttons               |
| `HumanReviewBadge.tsx`    | Badge showing demo is ready                 |
| `DemoNotification.tsx`    | Toast/alert when demo is ready              |

### TanStack Query Hooks Needed

```typescript
// Fetch demo for a ticket
const { data: demo } = useDemoScript(ticketId);

// Update a step
const updateStep = useMutation({
  mutationFn: ({ demoId, stepNumber, passed, notes }) =>
    updateDemoStep({ demoId, stepNumber, passed, notes }),
  onSuccess: () => queryClient.invalidateQueries(["demo", ticketId]),
});

// Submit approval/rejection
const submitFeedback = useMutation({
  mutationFn: ({ demoId, passed, feedback, stepResults }) =>
    submitDemoFeedback({ demoId, passed, feedback, stepResults }),
  onSuccess: () => {
    queryClient.invalidateQueries(["ticket", ticketId]);
    queryClient.invalidateQueries(["demo", ticketId]);
    // Show success toast
    // Redirect or show next steps
  },
});
```

---

## Out of Scope

- [ ] UI for review findings dashboard (future epic)
- [ ] Automated demo execution (humans run demos)
- [ ] PR auto-merge (manual merge preferred)
- [ ] Multi-project workflow (single project focus)

---

## References

### Inspiration

- **Dillon Mulroy's Workflow**: @dillon_mulroy on X (Twitter) - Next-Task and Tracer Review workflows

### Brain Dump Internal

- **Current Review Commands**: `.claude/commands/review.md`
- **MCP Server**: `mcp-server/tools/workflow.js`
- **Constants**: `src/lib/constants.ts`
- **Existing Telemetry Hooks**: `.claude/hooks/log-tool-telemetry.sh`
- **Existing Telemetry MCP**: `mcp-server/tools/telemetry.js`

### Claude Code Documentation

- **Hooks System**: https://code.claude.com/docs/en/hooks
  - 12 hook types: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `Setup`, `Notification`, `PreCompact`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Stop`
  - Configuration: `.claude/settings.local.json` (project) or `~/.claude/settings.json` (global)
  - Hook types: `command` (shell scripts) or `prompt` (AI-based hooks)
  - Exit code 2 blocks actions with feedback message
  - Environment variables: `CLAUDE_PROJECT_DIR`, `$tool_name`, `$tool_input`, `$tool_output`
  - Tool matchers: `Write`, `Edit`, `Bash`, `Task`, `mcp__*` patterns
- **MCP Servers**: https://code.claude.com/docs/en/mcp
  - Configuration via `mcpServers` in `.claude/settings.json`
  - Supports stdio, http, sse transports
  - `claude mcp add`, `claude mcp remove`, `claude mcp list` CLI commands
  - Server types: local (stdio) and remote (HTTP/SSE)
  - OAuth support for remote servers
- **Skills/Commands**: https://code.claude.com/docs/en/skills
  - `.claude/commands/<name>.md` structure
  - YAML frontmatter: `allowed-tools`, `description`, `model`
  - Progressive disclosure with files and instructions
  - Invoked via `/command-name` in chat
- **Plugins**: https://code.claude.com/docs/en/plugins
  - `plugin.json` manifest with hooks, commands, skills, agents
  - Distribution via npm, GitHub, or local paths
  - `claude plugin add`, `claude plugin list` CLI commands
  - Shared configuration across projects
- **Input/Output Schema** (for hooks):
  - PreToolUse input: `{ tool_name, tool_input }`
  - PostToolUse input: `{ tool_name, tool_input, tool_output }`
  - SessionStart input: `{ session_id, cwd }`
  - UserPromptSubmit input: `{ prompt, session_id }`
  - Stop input: `{ stop_reason, session_id }`
  - Hook output: `{ decision?, reason?, block_message? }` (decision: "block", "allow", "ask")

### VS Code Documentation

- **MCP Servers**: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
  - Configuration via `.vscode/mcp.json` (workspace) or global settings
  - Supports stdio and HTTP/SSE transports
  - Server trust model with manual approval
- **Custom Instructions**: https://code.visualstudio.com/docs/copilot/customization/custom-instructions
  - `.github/copilot-instructions.md` for project-wide AI guidance
  - `applyTo` frontmatter for pattern-based activation
  - Auto-injected into all chat interactions
- **Agent Skills**: https://code.visualstudio.com/docs/copilot/customization/agent-skills
  - `.github/skills/` or `~/.copilot/skills/` directories
  - Progressive disclosure: discovery → instructions → resources
  - Auto-activated based on prompt matching
- **Custom Agents**: https://code.visualstudio.com/docs/copilot/customization/custom-agents
  - `.agent.md` files with YAML frontmatter
  - Handoffs for multi-step workflows
- **Language Model Tool API**: https://code.visualstudio.com/api/extension-guides/ai/tools
  - `vscode.lm.registerTool()` for custom tools
  - `prepareInvocation()` callback (before execution)
  - `invoke()` method with finally block (after execution)
  - Can wrap tools with telemetry
- **MCP Extension API**: https://code.visualstudio.com/api/extension-guides/ai/mcp
  - `vscode.lm.registerMcpServerDefinitionProvider()` for programmatic MCP
  - `McpStdioServerDefinition` and `McpHttpServerDefinition` classes
- **AI Extensibility Overview**: https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview
  - Four approaches: Tool API, MCP Tools, Chat Participant API, Language Model API

### OpenCode Documentation

- **MCP Servers**: https://opencode.ai/docs/mcp-servers/
  - Configuration in `opencode.json` under `mcp` key
  - Supports `type: "local"` (stdio) and `type: "remote"` (HTTP)
  - OAuth support with Dynamic Client Registration
  - CLI tools: `opencode mcp auth`, `opencode mcp list`, `opencode mcp debug`
- **Plugins**: https://opencode.ai/docs/plugins/
  - 40+ lifecycle events available
  - **`tool.execute.before`** - Intercept/modify tool calls (like PreToolUse)
  - **`tool.execute.after`** - Observe tool results (like PostToolUse)
  - **`session.created`**, **`session.idle`**, **`session.error`** - Session lifecycle
  - **`file.edited`** - File change tracking
  - Plugin locations: `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (global)
- **Rules (AGENTS.md)**: https://opencode.ai/docs/rules/
  - `AGENTS.md` in project root (recommended)
  - `CLAUDE.md` supported as fallback
  - `~/.config/opencode/AGENTS.md` for global rules
  - Can reference external files via `instructions` array in `opencode.json`
  - `/init` command auto-generates initial rules
- **Skills**: https://opencode.ai/docs/skills/
  - `.opencode/skills/<name>/SKILL.md` structure
  - Required YAML frontmatter: name, description
  - Invoked via native `skill` tool
  - Permissions: allow, deny, ask
- **Custom Tools**: https://opencode.ai/docs/custom-tools/
  - `.opencode/tools/` directory
  - TypeScript/JavaScript with `tool()` helper
  - Zod schema validation via `tool.schema`
  - Execution context includes `sessionID`, `agent`, `messageID`
- **Agents**: https://opencode.ai/docs/agents/
  - Primary agents (Build, Plan) and Subagents (General, Explore)
  - Configuration via `opencode.json` or `.opencode/agents/` markdown files
  - Tool permissions per agent with wildcard support
- **Tools**: https://opencode.ai/docs/tools/
  - 13 built-in tools (bash, edit, write, read, grep, glob, etc.)
  - Permission model: allow, deny, ask
  - Wildcard patterns for batch management
- **ACP (Agent Client Protocol)**: https://opencode.ai/docs/acp/
  - JSON-RPC over stdio
  - Supports Zed, JetBrains, Neovim integrations
  - `opencode acp` command to start subprocess

### Cursor Documentation

- **Hooks (Full Support!)**: https://cursor.com/docs/agent/hooks
  - 15+ hook types: `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `afterAgentResponse`, `afterAgentThought`, `stop`
  - Configuration: `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (global)
  - Exit code 2 blocks actions (same as Claude Code)
  - Supports both command-based and prompt-based hooks
  - Environment variables: `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CURSOR_USER_EMAIL`
- **Third-Party Hooks**: https://cursor.com/docs/agent/third-party-hooks
  - **Cursor loads Claude Code hooks!** Priority: Cursor hooks → `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`
  - Enable via "Third-party skills" in Cursor Settings
  - Maps Claude hook names to Cursor format
- **MCP Servers**: https://cursor.com/docs/context/mcp
  - Configuration: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)
  - Supports STDIO (local) and HTTP/SSE (remote) transports
  - Variable interpolation: `${env:NAME}`, `${workspaceFolder}`, `${userHome}`
  - OAuth support with fixed redirect URL
- **Rules**: https://cursor.com/docs/context/rules
  - `.cursor/rules/*.md` files with optional frontmatter
  - `alwaysApply`, `globs`, `description` frontmatter fields
  - Team rules enforced via dashboard (Team/Enterprise plans)
  - Supports `AGENTS.md` in project root
- **Skills**: https://cursor.com/docs/context/skills
  - `.cursor/skills/<name>/SKILL.md` structure
  - Required frontmatter: `name`, `description`
  - Optional: `scripts/`, `references/`, `assets/` directories
  - Auto-discovered from `.cursor/skills/`, `.claude/skills/`, `.codex/skills/`
- **CLI MCP**: https://cursor.com/docs/cli/mcp
  - `cursor agent mcp list` - list servers
  - `cursor agent mcp list-tools <id>` - list server tools
  - `cursor agent mcp login/enable/disable <id>` - manage servers
  - Uses same config as editor

### Environment-Specific Feature Matrix

| Feature                | Claude Code             | Cursor                           | OpenCode               | VS Code                     |
| ---------------------- | ----------------------- | -------------------------------- | ---------------------- | --------------------------- |
| **Hooks/Events**       | ✅ Native hooks (12)    | ✅ Native hooks (15+)            | ✅ Plugin events (40+) | ❌ None (instructions only) |
| **Before tool**        | PreToolUse              | preToolUse                       | `tool.execute.before`  | N/A                         |
| **After tool**         | PostToolUse             | postToolUse / postToolUseFailure | `tool.execute.after`   | N/A                         |
| **Session start**      | SessionStart            | sessionStart                     | `session.created`      | N/A                         |
| **Session end**        | Stop                    | sessionEnd / stop                | `session.idle`         | N/A                         |
| **User prompt**        | UserPromptSubmit        | beforeSubmitPrompt               | ❌ No                  | ❌ No                       |
| **Block action**       | Return block message    | Exit code 2                      | Modify output          | MCP preconditions only      |
| **Rules/Instructions** | CLAUDE.md               | .cursor/rules/\*.md + AGENTS.md  | AGENTS.md              | copilot-instructions.md     |
| **Skills**             | .claude/commands/       | .cursor/skills/                  | .opencode/skills/      | .github/skills/             |
| **MCP Config**         | ~/.claude/settings.json | .cursor/mcp.json                 | opencode.json          | .vscode/mcp.json            |
| **Cross-compatible**   | N/A                     | ✅ Loads Claude hooks!           | ❌ No                  | ❌ No                       |
