## 2. Reference Tables

### Ticket Statuses (Cleaned Up)

| Status         | Description                 | Entered Via             | Exited Via             |
| -------------- | --------------------------- | ----------------------- | ---------------------- |
| `backlog`      | Not yet ready to work on    | Default for new tickets | Move to `ready`        |
| `ready`        | Ready to be picked up       | Manual or triage        | `start_ticket_work`    |
| `in_progress`  | Active development          | `start_ticket_work`     | `complete_ticket_work` |
| `ai_review`    | Automated review + fix loop | `complete_ticket_work`  | All findings fixed     |
| `human_review` | Demo + human feedback       | AI review passes        | Human approves         |
| `done`         | Complete                    | Human approves          | N/A                    |

**REMOVED**: The legacy `review` status is removed. Use `ai_review` or `human_review` explicitly.

### Workflow Gates

| Gate             | What's Checked                     | Blocking? | Auto or Manual  |
| ---------------- | ---------------------------------- | --------- | --------------- |
| **Pre-start**    | No other ticket in_progress        | YES       | Auto (MCP)      |
| **Pre-start**    | Previous ticket was reviewed       | YES       | Auto (MCP)      |
| **Pre-complete** | Plan was written (TaskCreate used) | WARN      | Auto (MCP)      |
| **Pre-complete** | Validation passed (pnpm check)     | YES       | Auto (MCP)      |
| **AI Review**    | Code review agents pass            | YES       | Auto (agents)   |
| **AI Review**    | All findings fixed                 | YES       | Auto (fix loop) |
| **Human Review** | Demo script generated              | YES       | Auto (MCP)      |
| **Human Review** | User ran demo                      | YES       | Manual          |
| **Human Review** | User approved                      | YES       | Manual          |
| **Pre-done**     | Learnings reconciled               | WARN      | Auto (MCP)      |

### MCP Tools (Workflow Engine)

| Tool                     | Purpose                   | Preconditions                           |
| ------------------------ | ------------------------- | --------------------------------------- |
| `start_ticket_work`      | Begin work on a ticket    | No other in_progress, previous reviewed |
| `complete_ticket_work`   | Finish implementation     | Validation passed, moves to ai_review   |
| `submit_review_findings` | Report issues from review | Ticket in ai_review                     |
| `mark_finding_fixed`     | Mark issue as resolved    | Finding exists, ticket in ai_review     |
| `generate_demo_script`   | Create manual test steps  | AI review passed                        |
| `submit_demo_feedback`   | Record human's feedback   | Demo script exists                      |
| `approve_ticket`         | Move to done              | Human approved                          |
| `reconcile_learnings`    | Update CLAUDE.md, specs   | Ticket being completed                  |

### Epic Workflow Gates

| Gate                     | What's Checked           | Blocking? |
| ------------------------ | ------------------------ | --------- |
| **All tickets complete** | Every ticket in done     | YES       |
| **DoD Audit**            | Full CLAUDE.md checklist | YES       |
| **Epic Review**          | All 7 review agents pass | YES       |
| **Epic Fix Loop**        | All findings fixed       | YES       |
| **Epic Demo**            | Demo script generated    | YES       |
| **Epic Feedback**        | Human ran demo, approved | YES       |
| **Learnings**            | CLAUDE.md updated        | WARN      |
| **PR Created**           | PR exists                | YES       |

### Comments & Documentation (MANDATORY)

Every workflow phase MUST create a ticket comment for audit trail:

| Phase                    | Comment Type   | Content                                           | Author        |
| ------------------------ | -------------- | ------------------------------------------------- | ------------- |
| **start_ticket_work**    | `progress`     | "Started work on ticket. Branch: {branch}"        | `{ai_author}` |
| **Plan Written**         | `progress`     | "Created micro-plan with {n} tasks"               | `{ai_author}` |
| **Implementation**       | `progress`     | "Implementing: {current task}" (periodic)         | `{ai_author}` |
| **Validation Passed**    | `progress`     | "Validation passed: type-check ✓, lint ✓, test ✓" | `{ai_author}` |
| **complete_ticket_work** | `work_summary` | Full summary of changes made                      | `{ai_author}` |
| **AI Review Started**    | `progress`     | "Starting AI review (iteration {n})"              | `{ai_author}` |
| **Finding Reported**     | `progress`     | "Review found {n} issues: {P0}×P0, {P1}×P1..."    | `{ai_author}` |
| **Finding Fixed**        | `progress`     | "Fixed: {summary} [{priority}]"                   | `{ai_author}` |
| **AI Review Passed**     | `progress`     | "AI review passed after {n} iterations"           | `{ai_author}` |
| **Demo Generated**       | `progress`     | "Demo script generated with {n} steps"            | `{ai_author}` |
| **Human Feedback**       | `comment`      | User's feedback from demo                         | `user`        |
| **Learnings Reconciled** | `progress`     | "Updated: CLAUDE.md, {n} specs, {n} tickets"      | `{ai_author}` |
| **Ticket Done**          | `progress`     | "Ticket complete. Human approved."                | `{ai_author}` |

#### Author Values

The `{ai_author}` is determined by the environment making the MCP call. When Ralph is active, we show both the orchestrator AND the underlying AI for clarity.

| Environment               | Author Value     | Display             | How Detected                 |
| ------------------------- | ---------------- | ------------------- | ---------------------------- |
| Claude Code (interactive) | `claude`         | 🤖 claude           | `CLAUDE_CODE` env var        |
| Claude Code (Ralph mode)  | `ralph:claude`   | 🤖 ralph (claude)   | Ralph session + Claude env   |
| OpenCode (interactive)    | `opencode`       | 🤖 opencode         | `OPENCODE` env var           |
| OpenCode (Ralph mode)     | `ralph:opencode` | 🤖 ralph (opencode) | Ralph session + OpenCode env |
| VS Code + MCP             | `vscode`         | 🤖 vscode           | `VSCODE_PID` env var         |
| VS Code (Ralph mode)      | `ralph:vscode`   | 🤖 ralph (vscode)   | Ralph session + VS Code env  |
| Cursor + MCP              | `cursor`         | 🤖 cursor           | `CURSOR_` env var            |
| Cursor (Ralph mode)       | `ralph:cursor`   | 🤖 ralph (cursor)   | Ralph session + Cursor env   |
| Unknown                   | `ai`             | 🤖 ai               | Fallback                     |
| Human (via UI)            | `user`           | 👤 user             | Direct UI action             |

**Author Format:**

- Interactive mode: `{tool}` (e.g., `claude`, `opencode`)
- Ralph mode: `ralph:{tool}` (e.g., `ralph:claude`, `ralph:opencode`)

**Implementation in MCP Server:**

```javascript
function detectAuthor() {
  const isRalphSession =
    process.env.RALPH_SESSION ||
    fs.existsSync(path.join(process.cwd(), ".claude/ralph-state.json"));

  let baseTool = "ai"; // fallback

  // Detect the underlying AI tool
  if (process.env.CLAUDE_CODE) {
    baseTool = "claude";
  } else if (process.env.OPENCODE) {
    baseTool = "opencode";
  } else if (process.env.VSCODE_PID || process.env.VSCODE_CWD) {
    baseTool = "vscode";
  } else if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_SESSION) {
    baseTool = "cursor";
  }

  // If Ralph is orchestrating, prefix with ralph:
  if (isRalphSession) {
    return `ralph:${baseTool}`;
  }

  return baseTool;
}

// Helper to format for display
function formatAuthorDisplay(author) {
  if (author === "user") {
    return "👤 user";
  }

  if (author.startsWith("ralph:")) {
    const tool = author.split(":")[1];
    return `🤖 ralph (${tool})`;
  }

  return `🤖 ${author}`;
}
```

**Example Activity Feed:**

```
Activity
─────────────────────────────────────────
🤖 claude - Started work on ticket. Branch: feature/abc-123
🤖 claude - Created micro-plan with 5 tasks
🤖 claude - Implementation complete
🤖 ralph (claude) - Starting AI review (iteration 1)
🤖 ralph (claude) - Fixed: Missing validation [P2]
🤖 ralph (claude) - AI review passed after 2 iterations
🤖 ralph (opencode) - Demo script generated with 5 steps
👤 user - Approved demo. "Looks great!"
```

This clearly shows:

- Interactive Claude work (first 3 entries)
- Ralph orchestrating with Claude as the AI (review/fix)
- Ralph orchestrating with OpenCode as the AI (demo generation)
- Human approval

### Telemetry Events (MANDATORY)

Every workflow phase MUST emit telemetry events for observability:

| Phase                 | Event Type    | Data                                                         |
| --------------------- | ------------- | ------------------------------------------------------------ |
| **start_ticket_work** | `context`     | `{ hasDescription, criteriaCount, commentCount }`            |
| **Plan Written**      | `tool`        | `{ tool: "TaskCreate", taskCount: n }`                       |
| **Each Tool Use**     | `tool`        | `{ tool: "Edit"/"Write"/"Bash", params: {...} }`             |
| **Validation**        | `tool`        | `{ tool: "Bash", command: "pnpm check", success: bool }`     |
| **Review Agent**      | `tool`        | `{ tool: "Task", agent: "code-reviewer", findingsCount: n }` |
| **Fix Applied**       | `tool`        | `{ tool: "Edit", finding: findingId, file: path }`           |
| **Demo Generated**    | `tool`        | `{ tool: "generate_demo_script", stepCount: n }`             |
| **Session End**       | `session_end` | `{ outcome, totalTools, totalTokens, duration }`             |

#### Telemetry Capture Mechanisms by Environment

How telemetry gets into the database varies by environment due to different capabilities:

| Environment     | Session Start           | Tool Events                                     | Prompt Events               | Session End            |
| --------------- | ----------------------- | ----------------------------------------------- | --------------------------- | ---------------------- |
| **Claude Code** | SessionStart hook → MCP | PreToolUse/PostToolUse hooks → queue file → MCP | UserPromptSubmit hook → MCP | Stop hook → MCP        |
| **OpenCode**    | MCP tool call directly  | MCP tool calls directly                         | Not captured (no hook)      | MCP tool call directly |
| **VS Code**     | MCP tool call directly  | MCP tool calls directly                         | Not captured (no hook)      | MCP tool call directly |
| **Cursor**      | MCP tool call directly  | MCP tool calls directly                         | Not captured (no hook)      | MCP tool call directly |

##### Claude Code Telemetry (Hooks + Queue)

Claude Code has full hook support, enabling automatic telemetry capture:

**1. Session Start (`SessionStart` hook)**

File: `.claude/hooks/start-telemetry-session.sh`

```bash
#!/bin/bash
# Detects active ticket and outputs message to start telemetry session

PROJECT_DIR="$CLAUDE_PROJECT_DIR"
STATE_FILE="$PROJECT_DIR/.claude/ralph-state.json"

# Check for active Ralph session (ticket detection)
if [ -f "$STATE_FILE" ]; then
  TICKET_ID=$(jq -r '.ticketId // empty' "$STATE_FILE" 2>/dev/null)
  if [ -n "$TICKET_ID" ]; then
    echo "📊 Telemetry: Active ticket detected ($TICKET_ID)"
    echo "  Call: start_telemetry_session({ ticketId: \"$TICKET_ID\" })"
  fi
fi
```

The hook outputs a message telling Claude to call the MCP tool. Claude then calls:

```
start_telemetry_session({ ticketId: "abc-123", projectPath: "/path/to/project" })
```

**2. Tool Events (`PreToolUse`/`PostToolUse` hooks)**

File: `.claude/hooks/log-tool-telemetry.sh`

```bash
#!/bin/bash
# Writes tool events to a queue file for batch processing

QUEUE_FILE="$PROJECT_DIR/.claude/telemetry-queue.jsonl"
CORR_FILE="$PROJECT_DIR/.claude/tool-correlations.json"

# Hook context
HOOK_EVENT="$CLAUDE_HOOK_EVENT"  # PreToolUse or PostToolUse
TOOL_NAME="$TOOL_NAME"
TOOL_INPUT="$TOOL_INPUT"

if [ "$HOOK_EVENT" = "PreToolUse" ]; then
  # Generate correlation ID for pairing start/end
  CORR_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)

  # Store correlation ID for PostToolUse to find
  jq --arg tool "$TOOL_NAME" --arg corr "$CORR_ID" \
    '.[$tool] = $corr' "$CORR_FILE" > "$CORR_FILE.tmp" && mv "$CORR_FILE.tmp" "$CORR_FILE"

  # Write start event to queue
  EVENT=$(jq -n \
    --arg event "start" \
    --arg tool "$TOOL_NAME" \
    --arg corr "$CORR_ID" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{event: $event, toolName: $tool, correlationId: $corr, timestamp: $timestamp}')
  echo "$EVENT" >> "$QUEUE_FILE"

elif [ "$HOOK_EVENT" = "PostToolUse" ]; then
  # Find correlation ID from PreToolUse
  CORR_ID=$(jq -r --arg tool "$TOOL_NAME" '.[$tool] // empty' "$CORR_FILE")

  # Calculate duration (if start timestamp was stored)
  # ...duration logic...

  # Write end event to queue
  EVENT=$(jq -n \
    --arg event "end" \
    --arg tool "$TOOL_NAME" \
    --arg corr "$CORR_ID" \
    --arg success "true" \
    '{event: $event, toolName: $tool, correlationId: $corr, success: ($success == "true")}')
  echo "$EVENT" >> "$QUEUE_FILE"
fi
```

**Queue Processing**: The queue file (`.claude/telemetry-queue.jsonl`) is processed by either:

- A background MCP tool call that reads and flushes the queue
- The `end_telemetry_session` MCP tool which processes remaining events
- A periodic flush triggered by workflow tools

**2b. Tool Failure Events (`PostToolUseFailure` hook)**

The `PostToolUseFailure` hook fires when a tool fails (throws error or returns error). This is important for tracking failure rates:

```bash
#!/bin/bash
# .claude/hooks/log-tool-failure.sh
# Captures tool failures for telemetry

TOOL_NAME="$TOOL_NAME"
ERROR="$TOOL_ERROR"
CORR_FILE="$PROJECT_DIR/.claude/tool-correlations.json"
QUEUE_FILE="$PROJECT_DIR/.claude/telemetry-queue.jsonl"

CORR_ID=$(jq -r --arg tool "$TOOL_NAME" '.[$tool] // empty' "$CORR_FILE")

EVENT=$(jq -n \
  --arg event "end" \
  --arg tool "$TOOL_NAME" \
  --arg corr "$CORR_ID" \
  --arg error "$ERROR" \
  '{event: $event, toolName: $tool, correlationId: $corr, success: false, error: $error}')
echo "$EVENT" >> "$QUEUE_FILE"
```

**3. Prompt Events (`UserPromptSubmit` hook)**

File: `.claude/hooks/log-prompt-telemetry.sh`

```bash
#!/bin/bash
# Captures user prompts (optionally redacted)

PROMPT="$USER_PROMPT"  # From hook context
SESSION_FILE="$PROJECT_DIR/.claude/telemetry-session.json"

if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(jq -r '.sessionId // empty' "$SESSION_FILE")
  if [ -n "$SESSION_ID" ]; then
    # Output message for Claude to call MCP
    echo "📊 Telemetry: Logging prompt event"
    echo "  Call: log_prompt_event({ sessionId: \"$SESSION_ID\", prompt: \"...\", redact: true })"
  fi
fi
```

**4. Session End (`Stop` hook)**

File: `.claude/hooks/end-telemetry-session.sh`

```bash
#!/bin/bash
# Ends telemetry session and flushes remaining events

SESSION_FILE="$PROJECT_DIR/.claude/telemetry-session.json"
QUEUE_FILE="$PROJECT_DIR/.claude/telemetry-queue.jsonl"

if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(jq -r '.sessionId // empty' "$SESSION_FILE")
  if [ -n "$SESSION_ID" ]; then
    # Count remaining events in queue
    EVENT_COUNT=$(wc -l < "$QUEUE_FILE" 2>/dev/null | tr -d ' ')

    echo "📊 Telemetry: Session ending"
    echo "  Remaining events in queue: ${EVENT_COUNT:-0}"
    echo "  Call: end_telemetry_session({ sessionId: \"$SESSION_ID\", outcome: \"success\" })"

    # Clean up session file
    rm -f "$SESSION_FILE"
  fi
fi
```

##### OpenCode Telemetry (Plugins + MCP)

OpenCode has a **powerful plugin system with lifecycle hooks** that enables Claude Code-level telemetry:

**OpenCode Plugin Events (40+ available):**

| Event                 | Purpose                         | Telemetry Use                        |
| --------------------- | ------------------------------- | ------------------------------------ |
| `tool.execute.before` | Called before any tool executes | Log tool start, capture params       |
| `tool.execute.after`  | Called after tool completes     | Log tool end, capture result/success |
| `session.created`     | New session started             | Start telemetry session              |
| `session.idle`        | Session goes idle               | Could end telemetry session          |
| `session.error`       | Session error occurred          | Log error event                      |
| `session.compacted`   | Context compacted               | Log compaction event                 |
| `file.edited`         | File was edited                 | Track file changes                   |
| `permission.replied`  | User responded to permission    | Track user approvals                 |

**Brain Dump OpenCode Plugin:**

File: `~/.config/opencode/plugins/brain-dump-telemetry.ts` (global) or `.opencode/plugins/brain-dump-telemetry.ts` (project)

```typescript
import type { Plugin } from "@opencode-ai/plugin";

// Store correlation IDs for pairing before/after events
const toolCorrelations = new Map<string, { startTime: number; params: any }>();

export const BrainDumpTelemetry: Plugin = async ({ client, project }) => {
  // Get active telemetry session from MCP
  let sessionId: string | null = null;

  return {
    // Session lifecycle
    "session.created": async (input) => {
      // Start telemetry session via MCP
      const result = await client.callTool("mcp__brain-dump__start_telemetry_session", {
        projectPath: project?.path,
      });
      sessionId = result?.sessionId;
      console.log(`[Brain Dump] Telemetry session started: ${sessionId}`);
    },

    "session.idle": async (input) => {
      // End telemetry session when idle
      if (sessionId) {
        await client.callTool("mcp__brain-dump__end_telemetry_session", {
          sessionId,
          outcome: "success",
        });
        console.log(`[Brain Dump] Telemetry session ended: ${sessionId}`);
        sessionId = null;
      }
    },

    // Tool lifecycle - BEFORE execution
    "tool.execute.before": async (input, output) => {
      if (!sessionId) return;

      const correlationId = crypto.randomUUID();
      const toolName = input.tool;

      // Store for pairing with after event
      toolCorrelations.set(toolName, {
        startTime: Date.now(),
        params: input.params,
      });

      // Log tool start
      await client.callTool("mcp__brain-dump__log_tool_event", {
        sessionId,
        event: "start",
        toolName,
        correlationId,
        params: sanitizeParams(input.params),
      });
    },

    // Tool lifecycle - AFTER execution
    "tool.execute.after": async (input, output) => {
      if (!sessionId) return;

      const toolName = input.tool;
      const correlation = toolCorrelations.get(toolName);

      if (correlation) {
        const durationMs = Date.now() - correlation.startTime;

        await client.callTool("mcp__brain-dump__log_tool_event", {
          sessionId,
          event: "end",
          toolName,
          correlationId: correlation.correlationId,
          success: !output.error,
          durationMs,
          error: output.error?.message,
        });

        toolCorrelations.delete(toolName);
      }
    },

    // Error tracking
    "session.error": async (input) => {
      if (sessionId) {
        await client.callTool("mcp__brain-dump__log_tool_event", {
          sessionId,
          event: "end",
          toolName: "session",
          success: false,
          error: input.error?.message,
        });
      }
    },
  };
};

// Helper to remove sensitive data from params
function sanitizeParams(params: any) {
  if (!params) return {};
  const sanitized = { ...params };
  // Remove file contents, only keep paths
  if (sanitized.content) sanitized.content = "[REDACTED]";
  if (sanitized.old_string) sanitized.old_string = "[REDACTED]";
  if (sanitized.new_string) sanitized.new_string = "[REDACTED]";
  return sanitized;
}
```

**OpenCode Configuration:**

File: `opencode.json` or `~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "brain-dump": {
      "type": "local",
      "command": ["node", "/path/to/brain-dump/mcp-server/index.js"]
    }
  },
  "plugin": ["brain-dump-telemetry"],
  "tools": {
    "mcp__brain-dump__*": "allow"
  }
}
```

**OpenCode Rules (AGENTS.md):**

File: `AGENTS.md` (project root) or `~/.config/opencode/AGENTS.md` (global)

```markdown
# Brain Dump Workflow Rules

## Ticket Workflow

When working on Brain Dump tickets:

1. **Start Work**: Always call `start_ticket_work({ ticketId })` before implementation
2. **Create Plan**: Use `todowrite` to create a micro-plan
3. **Validate**: Run `pnpm check` before completing
4. **Complete Work**: Call `complete_ticket_work({ ticketId, summary })` when done

## Status Flow

Tickets MUST progress through: in_progress → ai_review → human_review → done

## MCP Tools Available

- `start_ticket_work` - Begin work, creates branch
- `complete_ticket_work` - Finish implementation, moves to AI review
- `submit_review_finding` - Report issues from code review
- `generate_demo_script` - Create manual test steps
- `submit_demo_feedback` - Record human approval/rejection

The Brain Dump plugin automatically tracks telemetry. No manual logging needed.
```

**OpenCode Skills:**

File: `.opencode/skills/brain-dump-workflow/SKILL.md`

```markdown
---
name: brain-dump-workflow
description: Enforces Brain Dump quality workflow for ticket implementation with automatic telemetry
---

# Brain Dump Workflow

This skill guides you through the Brain Dump quality workflow.

## Starting Work

1. Call `start_ticket_work({ ticketId: "<ticket-id>" })`
2. Read the ticket description and acceptance criteria
3. Create a micro-plan using the `todowrite` tool

## Implementation

1. Implement the changes following the plan
2. Run validation: `bash({ command: "pnpm check" })`
3. Fix any issues found

## Completing Work

1. Call `complete_ticket_work({ ticketId: "<ticket-id>", summary: "..." })`
2. The workflow will guide you through AI review → Human review → Done

## Available MCP Tools

Reference Brain Dump tools with the `mcp__brain-dump__` prefix.
```

**OpenCode Custom Tool (Alternative to Plugin):**

If plugins aren't desired, create a custom tool wrapper:

File: `.opencode/tools/brain-dump-telemetry.ts`

````typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Log a telemetry event to Brain Dump",
  args: {
    event: tool.schema.enum(["start", "end"]),
    toolName: tool.schema.string(),
    success: tool.schema.boolean().optional(),
    error: tool.schema.string().optional(),
  },
  async execute(args, context) {
    // Forward to MCP tool
    // context.sessionID available for correlation
    return `Telemetry logged: ${args.event} ${args.toolName}`
  },
})

##### VS Code Telemetry (Extension + Instructions + MCP)

VS Code has a different extensibility model than Claude Code. It doesn't have native hooks, but offers several integration points:

**VS Code Extensibility Options:**

| Approach | Coverage | Complexity | Description |
|----------|----------|------------|-------------|
| **MCP Self-Logging** | ⚠️ MCP only | Low | Current approach - MCP tools log themselves |
| **Custom Instructions** | ⚠️ Prompt-guided | Low | `.github/copilot-instructions.md` tells AI to log |
| **VS Code Extension** | ✅ All tools | High | Extension wraps tools with telemetry |

**Option 1: Custom Instructions (Recommended for MVP)**

Create `.github/copilot-instructions.md` in projects using Brain Dump:

```markdown
# Brain Dump Workflow Instructions

When working on tickets tracked in Brain Dump:

## Session Management
- At session start, call `start_telemetry_session` MCP tool
- At session end, call `end_telemetry_session` MCP tool

## Tool Logging
- Before major operations (file edits, terminal commands), call `log_tool_event` with event: "start"
- After operations complete, call `log_tool_event` with event: "end" and success status

## Workflow Enforcement
- Always use `start_ticket_work` before beginning implementation
- Always use `complete_ticket_work` when finished
- Follow the status flow: in_progress → ai_review → human_review → done
````

**Option 2: Agent Skills**

Create reusable skills in `.github/skills/` or `~/.copilot/skills/`:

```markdown
# brain-dump-workflow.skill.md

---

name: brain-dump-workflow
description: Enforces Brain Dump quality workflow for ticket implementation

---

When implementing a Brain Dump ticket:

1. Call `start_ticket_work({ ticketId })` to begin
2. Create a micro-plan using TaskCreate tool
3. Implement changes
4. Run validation: `pnpm check`
5. Call `complete_ticket_work({ ticketId, summary })` when done
6. Follow review process until human_review passes
```

##### Cursor Telemetry (Hooks + MCP) - FULL SUPPORT

**Cursor has a complete hooks system nearly identical to Claude Code!** This means Cursor can achieve FULL telemetry coverage.

**Cursor Hook Events:**

| Cursor Hook            | Claude Code Equivalent | Telemetry Use                |
| ---------------------- | ---------------------- | ---------------------------- |
| `sessionStart`         | SessionStart           | Start telemetry session      |
| `sessionEnd`           | Stop                   | End telemetry session        |
| `preToolUse`           | PreToolUse             | Log tool start               |
| `postToolUse`          | PostToolUse            | Log tool end (success)       |
| `postToolUseFailure`   | (none)                 | Log tool end (failure)       |
| `beforeShellExecution` | (Bash matcher)         | Log shell command start      |
| `afterShellExecution`  | (Bash matcher)         | Log shell command end        |
| `beforeMCPExecution`   | (MCP matcher)          | Log MCP tool start           |
| `afterMCPExecution`    | (MCP matcher)          | Log MCP tool end             |
| `beforeReadFile`       | (Read matcher)         | Log file read                |
| `afterFileEdit`        | (Edit matcher)         | Log file edit                |
| `beforeSubmitPrompt`   | UserPromptSubmit       | Capture user prompt          |
| `stop`                 | Stop                   | Session end + auto-follow-up |

**BONUS: Claude Code Hook Compatibility!**

Cursor can **load hooks directly from Claude Code configuration files**:

> Priority order: Enterprise → Team → Project (.cursor/) → User (~/.cursor/) → **Claude project local** → **Claude project** → **Claude user**

This means Brain Dump's existing Claude Code hooks will work in Cursor with minimal changes!

**Cursor Configuration Files:**

| File                   | Purpose             | Shared with Claude?             |
| ---------------------- | ------------------- | ------------------------------- |
| `.cursor/hooks.json`   | Project hooks       | No (Cursor-specific format)     |
| `~/.cursor/hooks.json` | User hooks          | No                              |
| `.cursor/mcp.json`     | Project MCP servers | No                              |
| `~/.cursor/mcp.json`   | Global MCP servers  | No                              |
| `.cursor/rules/*.md`   | Project rules       | Similar to CLAUDE.md            |
| `.cursor/skills/`      | Project skills      | Compatible with .claude/skills/ |

**Brain Dump Cursor Hooks:**

File: `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (global)

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": ".cursor/hooks/start-telemetry.sh"
      }
    ],
    "sessionEnd": [
      {
        "command": ".cursor/hooks/end-telemetry.sh"
      }
    ],
    "preToolUse": [
      {
        "command": ".cursor/hooks/log-tool-start.sh"
      }
    ],
    "postToolUse": [
      {
        "command": ".cursor/hooks/log-tool-end.sh"
      }
    ],
    "postToolUseFailure": [
      {
        "command": ".cursor/hooks/log-tool-failure.sh"
      }
    ],
    "beforeSubmitPrompt": [
      {
        "command": ".cursor/hooks/log-prompt.sh"
      }
    ]
  }
}
```

**Example Cursor Hook Script:**

File: `.cursor/hooks/log-tool-start.sh`

```bash
#!/bin/bash
# Cursor provides input via stdin as JSON
INPUT=$(cat)

# Extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // .name // "unknown"')
CONVERSATION_ID=$(echo "$INPUT" | jq -r '.conversation_id')
GENERATION_ID=$(echo "$INPUT" | jq -r '.generation_id')

# Get active telemetry session
PROJECT_DIR="${CURSOR_PROJECT_DIR:-$(pwd)}"
SESSION_FILE="$PROJECT_DIR/.cursor/telemetry-session.json"

if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(jq -r '.sessionId' "$SESSION_FILE")

  # Generate correlation ID for pairing with postToolUse
  CORR_ID=$(uuidgen 2>/dev/null || date +%s%N)

  # Store correlation for postToolUse to find
  echo "{\"correlationId\": \"$CORR_ID\", \"startTime\": $(date +%s%N)}" > "$PROJECT_DIR/.cursor/tool-$TOOL_NAME.json"

  # Queue telemetry event
  echo "{\"event\":\"start\",\"toolName\":\"$TOOL_NAME\",\"correlationId\":\"$CORR_ID\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$PROJECT_DIR/.cursor/telemetry-queue.jsonl"
fi

# Return empty JSON to allow tool execution
echo "{}"
exit 0
```

**Cursor Rules:**

File: `.cursor/rules/brain-dump-workflow.md`

```markdown
---
description: "Brain Dump quality workflow enforcement"
alwaysApply: true
---

# Brain Dump Workflow

When working on Brain Dump tickets:

## Required Workflow

1. Start work: `start_ticket_work({ ticketId })`
2. Create micro-plan
3. Implement changes
4. Validate: `pnpm check`
5. Complete: `complete_ticket_work({ ticketId, summary })`

## Status Flow

in_progress → ai_review → human_review → done

## MCP Tools

Use Brain Dump MCP tools with `mcp__brain-dump__` prefix.
```

**Cursor Skills:**

File: `.cursor/skills/brain-dump-workflow/SKILL.md`

```markdown
---
name: brain-dump-workflow
description: Enforces Brain Dump quality workflow for ticket implementation with automatic telemetry
---

# Brain Dump Workflow Skill

This skill guides you through the Brain Dump quality workflow.

## Starting Work

Use the Brain Dump MCP tool:
\`\`\`
start_ticket_work({ ticketId: "<ticket-id>" })
\`\`\`

## Completing Work

Use the Brain Dump MCP tool:
\`\`\`
complete_ticket_work({ ticketId: "<ticket-id>", summary: "..." })
\`\`\`

The telemetry hooks automatically capture all tool usage.
```

**Cursor MCP Configuration:**

File: `.cursor/mcp.json`

```json
{
  "brain-dump": {
    "command": "node",
    "args": ["${userHome}/path/to/brain-dump/mcp-server/index.js"],
    "env": {}
  }
}
```

**Key Cursor Capabilities:**

| Capability                  | Support | Notes                                                       |
| --------------------------- | ------- | ----------------------------------------------------------- |
| Hook blocking (exit code 2) | ✅      | Same as Claude Code                                         |
| Prompt-based hooks          | ✅      | LLM evaluation without scripts                              |
| Tool matchers               | ✅      | Filter hooks by tool name                                   |
| Fail-closed hooks           | ✅      | `beforeMCPExecution`, `beforeReadFile`                      |
| Environment variables       | ✅      | `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CURSOR_USER_EMAIL` |
| Claude hook loading         | ✅      | Loads from `.claude/settings.json`                          |
| Auto-follow-up              | ✅      | `stop` hook can submit new messages                         |

#### Telemetry Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TELEMETRY DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CLAUDE CODE (with hooks)                                                   │
│  ─────────────────────────                                                  │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │ SessionStart    │────►│ MCP:            │────►│ telemetry_      │       │
│  │ Hook            │     │ start_telemetry │     │ sessions table  │       │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │ PreToolUse/     │────►│ Queue File      │────►│ MCP:            │       │
│  │ PostToolUse     │     │ (.jsonl)        │     │ log_tool_event  │       │
│  │ Hooks           │     └─────────────────┘     └────────┬────────┘       │
│  └─────────────────┘                                      │                │
│                                                           ▼                │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │ UserPromptSubmit│────►│ MCP:            │────►│ telemetry_      │       │
│  │ Hook            │     │ log_prompt_event│     │ events table    │       │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘       │
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐                               │
│  │ Stop Hook       │────►│ MCP:            │───► Flush queue, end session  │
│  │                 │     │ end_telemetry   │                               │
│  └─────────────────┘     └─────────────────┘                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OPENCODE / VS CODE / CURSOR (no hooks)                                     │
│  ─────────────────────────────────────────                                  │
│                                                                             │
│  ┌─────────────────┐                         ┌─────────────────┐           │
│  │ MCP:            │─────────────────────────►│ telemetry_      │           │
│  │ start_ticket_   │   (internal call to     │ sessions table  │           │
│  │ work            │    start_telemetry)     └─────────────────┘           │
│  └─────────────────┘                                                       │
│                                                                             │
│  ┌─────────────────┐                         ┌─────────────────┐           │
│  │ MCP workflow    │─────────────────────────►│ telemetry_      │           │
│  │ tools (each     │   (internal logging)    │ events table    │           │
│  │ logs itself)    │                         └─────────────────┘           │
│  └─────────────────┘                                                       │
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │ MCP:            │───► End session, compute stats                        │
│  │ complete_ticket │                                                       │
│  │ _work           │                                                       │
│  └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### MCP Telemetry Tools Reference

| Tool                      | Purpose                    | Called By                                                 |
| ------------------------- | -------------------------- | --------------------------------------------------------- |
| `start_telemetry_session` | Create session record      | SessionStart hook (Claude) / `start_ticket_work` (others) |
| `log_prompt_event`        | Record user prompt         | UserPromptSubmit hook (Claude only)                       |
| `log_tool_event`          | Record tool start/end      | PostToolUse hook (Claude) / workflow tools (others)       |
| `log_context_event`       | Record context loaded      | `start_ticket_work` (all environments)                    |
| `end_telemetry_session`   | End session, compute stats | Stop hook (Claude) / `complete_ticket_work` (others)      |
| `get_telemetry_session`   | Retrieve session data      | UI components                                             |
| `list_telemetry_sessions` | List sessions with filters | UI dashboard                                              |

#### Queue File Format

For Claude Code, the queue file (`.claude/telemetry-queue.jsonl`) uses JSONL format:

```jsonl
{"event":"start","toolName":"Edit","correlationId":"abc-123","timestamp":"2026-01-24T10:00:00Z"}
{"event":"end","toolName":"Edit","correlationId":"abc-123","success":true,"durationMs":150}
{"event":"start","toolName":"Bash","correlationId":"def-456","timestamp":"2026-01-24T10:00:01Z"}
{"event":"end","toolName":"Bash","correlationId":"def-456","success":true,"durationMs":2340}
```

**Queue Processing Options**:

1. **On session end**: `end_telemetry_session` reads and processes all events
2. **Periodic flush**: Background process or MCP tool flushes every N events
3. **On demand**: `flush_telemetry_queue` MCP tool for manual flush

#### Coverage Comparison

| Metric               | Claude Code    | OpenCode (Plugin)     | Cursor         | VS Code               |
| -------------------- | -------------- | --------------------- | -------------- | --------------------- |
| Session tracking     | ✅ Full        | ✅ Full               | ✅ Full        | ✅ Full               |
| Tool events          | ✅ All tools   | ✅ All tools          | ✅ All tools   | ⚠️ MCP only           |
| User prompts         | ✅ Captured    | ❌ Not captured       | ✅ Captured    | ❌ Not captured       |
| Timing accuracy      | ✅ Precise     | ✅ Precise            | ✅ Precise     | ⚠️ Estimated          |
| Automatic capture    | ✅ Via hooks   | ✅ Via plugin         | ✅ Via hooks   | ❌ Internal           |
| Workflow enforcement | ✅ Hooks block | ✅ Plugin + AGENTS.md | ✅ Hooks block | ⚠️ Instructions + MCP |

**Key Insight**:

- **Claude Code**, **OpenCode (with plugin)**, and **Cursor** achieve **full telemetry coverage**
- **VS Code** uses **instructions-based approach** with MCP precondition enforcement
- **Cursor can load Claude Code hooks directly** - existing hooks work with minimal changes!

**Coverage Notes:**

| Environment     | How to Maximize Coverage                                                      |
| --------------- | ----------------------------------------------------------------------------- |
| **Claude Code** | Already optimal with hooks                                                    |
| **Cursor**      | Install Brain Dump hooks - can reuse Claude hooks or use Cursor-native format |
| **OpenCode**    | Install Brain Dump plugin for full telemetry                                  |
| **VS Code**     | Add `.github/copilot-instructions.md` + MCP self-logging (no hooks available) |

**Tool Event Capture by Approach:**

```
Native tools (Edit, Write, Bash)  MCP tools (start_ticket_work, etc.)
         │                                    │
         ▼                                    ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│     Claude Code          │      │     All Environments     │
│     PreToolUse hook      │      │     MCP self-logging     │
│     PostToolUse hook     │      │     (internal calls)     │
│            │             │      │            │             │
│            ▼             │      │            ▼             │
│     Queue file           │      │     Direct DB insert     │
│            │             │      │                          │
│            ▼             │      │                          │
│     MCP flush            │      │                          │
└──────────────────────────┘      └──────────────────────────┘
         │                                    │
         └────────────────┬───────────────────┘
                          ▼
               ┌─────────────────────┐
               │  telemetry_events   │
               │       table         │
               └─────────────────────┘
```

**Note**: In non-Claude environments, tool events are only captured for MCP tools that self-log. Native AI tool calls (Edit, Write, Bash) are not captured unless:

1. The AI explicitly calls `log_tool_event` (prompt-guided)
2. A VS Code extension wraps native tools (extension approach)
3. Custom instructions successfully guide the AI to log

### Status Updates (MANDATORY)

Ticket status MUST be updated at these points:

| Event                   | Status Change                  | MCP Tool                 |
| ----------------------- | ------------------------------ | ------------------------ |
| User picks up ticket    | `ready` → `in_progress`        | `start_ticket_work`      |
| Implementation complete | `in_progress` → `ai_review`    | `complete_ticket_work`   |
| AI review passes        | `ai_review` → `human_review`   | Automatic after fix loop |
| Human approves          | `human_review` → `done`        | `submit_demo_feedback`   |
| Human rejects (major)   | `human_review` → `in_progress` | Manual or MCP tool       |

### Ralph Session State (MANDATORY)

For Ralph/autonomous work, session state MUST be updated:

| Phase            | Session State  | Via                      |
| ---------------- | -------------- | ------------------------ |
| Session created  | `idle`         | `create_ralph_session`   |
| Reading ticket   | `analyzing`    | `update_session_state`   |
| Writing code     | `implementing` | `update_session_state`   |
| Running tests    | `testing`      | `update_session_state`   |
| Creating commits | `committing`   | `update_session_state`   |
| Self-review      | `reviewing`    | `update_session_state`   |
| Complete         | `done`         | `complete_ralph_session` |

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MCP TOOL EXECUTION                               │
│                    (e.g., start_ticket_work)                            │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┬───────────────────┐
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ ticket_comments │ │ telemetry_      │ │ tickets         │ │ ralph_sessions  │
│                 │ │ events          │ │                 │ │                 │
│ - progress      │ │ - tool start    │ │ - status update │ │ - state update  │
│ - work_summary  │ │ - tool end      │ │ - timestamps    │ │ - history       │
│ - test_report   │ │ - context       │ │                 │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BRAIN DUMP UI                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ Activity     │    │ Telemetry    │    │ Status       │              │
│  │ Feed         │    │ Dashboard    │    │ Badge        │              │
│  │              │    │              │    │              │              │
│  │ "Started     │    │ Tools: 47    │    │ [AI Review]  │              │
│  │  work on     │    │ Tokens: 12k  │    │              │              │
│  │  ticket..."  │    │ Duration: 5m │    │              │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐                                  │
│  │ Claude       │    │ Review       │                                  │
│  │ Tasks        │    │ Findings     │                                  │
│  │              │    │              │                                  │
│  │ ✓ Task 1     │    │ P0: 0        │                                  │
│  │ ▶ Task 2     │    │ P1: 1        │                                  │
│  │ ○ Task 3     │    │ P2: 3        │                                  │
│  └──────────────┘    └──────────────┘                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Comment Types (Extended)

Extend existing comment types to support workflow events:

| Type             | Current   | Description                 |
| ---------------- | --------- | --------------------------- |
| `comment`        | ✅ Exists | General comments from users |
| `work_summary`   | ✅ Exists | Summary of completed work   |
| `test_report`    | ✅ Exists | Test execution results      |
| `progress`       | ✅ Exists | General progress updates    |
| `workflow`       | 🆕 NEW    | Workflow state transitions  |
| `review_finding` | 🆕 NEW    | Individual review finding   |
| `review_summary` | 🆕 NEW    | Summary of review iteration |
| `demo_result`    | 🆕 NEW    | Demo execution outcome      |

**New Type Details:**

```typescript
// workflow - Automatic state transition documentation
{
  type: "workflow",
  content: "**Status Change**: in_progress → ai_review",
  metadata: {
    previousStatus: "in_progress",
    newStatus: "ai_review",
    trigger: "complete_ticket_work",
  }
}

// review_finding - Individual finding from review agent
{
  type: "review_finding",
  content: "**[P2]** Missing input validation in createTicket",
  metadata: {
    findingId: "abc-123",
    agent: "code-reviewer",
    priority: "P2",
    filePath: "src/api/tickets.ts",
    lineNumber: 42,
  }
}

// review_summary - Summary after review iteration
{
  type: "review_summary",
  content: "**Review Iteration 2 Complete**\n\nFindings: 3 (1 P1, 2 P2)\nFixed: 5\nRemaining: 3",
  metadata: {
    iteration: 2,
    totalFindings: 3,
    byPriority: { P0: 0, P1: 1, P2: 2, P3: 0, P4: 0 },
    fixed: 5,
    remaining: 3,
  }
}

// demo_result - Outcome of demo execution
{
  type: "demo_result",
  content: "**Demo Passed** ✅\n\nUser verified all 5 steps.",
  metadata: {
    demoId: "xyz-789",
    passed: true,
    stepsPassed: 5,
    stepsFailed: 0,
    feedback: "Looks great!",
  }
}
```

---
