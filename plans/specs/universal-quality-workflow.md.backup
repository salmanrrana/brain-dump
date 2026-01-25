# Universal Quality Workflow Spec

> **Epic**: Universal Quality Workflow
> **Author**: Claude
> **Status**: Draft
> **Inspiration**: Dillon Mulroy's tracer workflow (@dillon_mulroy)

---

## 1. Overview

**What is this?**

Brain Dump's core value proposition is quality code regardless of which tool or environment you use. Whether you're working interactively in VS Code, using Cursor, running Ralph autonomously, or coding with Claude Code - the same quality workflow should be enforced.

This spec defines:

1. A universal ticket workflow with clear quality gates
2. MCP tools that enforce the workflow in ANY environment
3. Status cleanup (removing legacy `review` column)
4. Skills for each workflow step (portable across environments)

- **Problem being solved**: Quality varies based on tool/environment. Ralph produces different quality than interactive Claude Code. No consistent review → fix → demo → feedback loop.
- **User value delivered**: Guaranteed quality regardless of how you work. "Ship with confidence" because the workflow caught issues.
- **How it fits into the system**: MCP server becomes the workflow engine. All clients (Claude Code, VS Code, Cursor, Ralph) use the same tools and get the same enforcement.

### Key Insight

> **"Quality is enforced by tooling, not by hoping people follow instructions."**
>
> — The workflow engine (MCP) prevents bad patterns. You literally cannot skip steps because the tools won't let you.

---

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

## 3. Type Definitions

```typescript
/**
 * Ticket status - CLEANED UP (removed legacy 'review')
 */
export type TicketStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "ai_review"
  | "human_review"
  | "done";

/**
 * Workflow state tracked per ticket
 */
export interface TicketWorkflowState {
  ticketId: string;

  // Implementation phase
  planWritten: boolean; // TaskCreate was used
  implementationStarted: boolean;
  validationPassed: boolean; // pnpm check passed

  // AI Review phase
  aiReviewStarted: boolean;
  reviewFindingsCount: number;
  reviewIteration: number;
  allFindingsFixed: boolean;

  // Human Review phase
  demoScriptGenerated: boolean;
  demoScript: string | null;
  humanRanDemo: boolean;
  humanFeedback: string | null;
  humanApproved: boolean;

  // Completion
  learningsReconciled: boolean;
  learnings: string | null;

  // Timestamps
  startedAt: string;
  completedAt: string | null;
}

/**
 * Epic workflow state
 */
export interface EpicWorkflowState {
  epicId: string;

  // Ticket completion
  totalTickets: number;
  completedTickets: number;
  allTicketsComplete: boolean;

  // DoD Audit
  dodAuditPassed: boolean;
  dodAuditFindings: string[];

  // Epic Review
  epicReviewPassed: boolean;
  epicReviewIteration: number;
  epicFindingsCount: number;

  // Demo & Feedback
  epicDemoScript: string | null;
  epicHumanFeedback: string | null;
  epicApproved: boolean;

  // Learnings & PR
  learningsReconciled: boolean;
  prUrl: string | null;
  prNumber: number | null;
}

/**
 * Review finding from any agent
 */
export interface ReviewFinding {
  id: string;
  ticketId: string | null; // null = epic-level
  epicId: string;

  agent: ReviewAgentType;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";

  filePath: string;
  lineNumber: number | null;
  summary: string;
  description: string;
  suggestedFix: string | null;

  status: "open" | "fixed" | "wontfix";
  fixDescription: string | null;

  iteration: number;
  createdAt: string;
  fixedAt: string | null;
}

type ReviewAgentType =
  | "code-reviewer"
  | "silent-failure-hunter"
  | "code-simplifier"
  | "context7-library-compliance"
  | "react-best-practices"
  | "cruft-detector"
  | "senior-engineer";

/**
 * Demo script for manual testing
 */
export interface DemoScript {
  id: string;
  ticketId: string | null;
  epicId: string;

  title: string;
  description: string;

  steps: DemoStep[];

  generatedAt: string;
  executedAt: string | null;
  executedBy: string | null;
}

interface DemoStep {
  order: number;
  instruction: string;
  expectedResult: string;
  passed: boolean | null;
  notes: string | null;
}
```

---

## 4. State Machine

### Ticket Workflow

```mermaid
stateDiagram-v2
    [*] --> backlog: Create ticket

    backlog --> ready: Triage/prioritize
    ready --> in_progress: start_ticket_work()

    in_progress --> in_progress: Write code, validate
    in_progress --> ai_review: complete_ticket_work()

    ai_review --> ai_review: Fix loop (review → fix → review)
    ai_review --> human_review: All findings fixed

    human_review --> human_review: Demo + feedback
    human_review --> done: Human approves
    human_review --> in_progress: Major issues (rare)

    done --> [*]

    note right of in_progress
        Gates:
        - Plan written (TaskCreate)
        - pnpm check passes
    end note

    note right of ai_review
        Gates:
        - 7 review agents run
        - All P0-P2 findings fixed
    end note

    note right of human_review
        Gates:
        - Demo script generated
        - Human ran demo
        - Human approved
    end note
```

### Epic Workflow

```mermaid
stateDiagram-v2
    [*] --> tickets_in_progress: Start epic

    tickets_in_progress --> all_complete: All tickets done

    all_complete --> dod_audit: Run DoD check

    dod_audit --> epic_review: Audit passes
    dod_audit --> tickets_in_progress: Audit fails (create tickets)

    epic_review --> fix_loop: Issues found
    epic_review --> demo: Clean (rare)

    fix_loop --> epic_review: Re-review
    fix_loop --> demo: All fixed

    demo --> feedback: Script generated

    feedback --> learnings: Human approves
    feedback --> fix_loop: Issues found

    learnings --> pr: Docs updated

    pr --> [*]: PR created

    note right of dod_audit
        Full CLAUDE.md
        verification checklist
    end note

    note right of fix_loop
        Priority order:
        P0 → P1 → P2 → P3 → P4
    end note
```

---

## 5. Design Decisions

### Why Remove the `review` Status?

1. **Ambiguity**: "Review" could mean AI review, human review, or both
2. **Workflow Clarity**: Two distinct phases (AI then Human) need distinct statuses
3. **Automation**: MCP tools need to know exactly where in the workflow a ticket is
4. **Migration**: Existing `review` tickets → `ai_review` (conservative choice)

### Why MCP as the Workflow Engine?

1. **Universal**: Works in Claude Code, VS Code, Cursor, OpenCode, Ralph
2. **Structured**: Returns JSON, not text to parse
3. **Stateful**: Tracks workflow state in database
4. **Blocking**: Can prevent bad transitions with clear error messages

### Why Skills Instead of Hard-Coded Prompts?

1. **Portable**: Skills work in any environment that supports prompts
2. **Updatable**: Change skill content without changing code
3. **Composable**: Ralph can invoke skills just like humans do
4. **Documented**: Skills are self-documenting (see skill files)

### Why Human-in-the-Loop for Demo?

1. **Automation Limits**: Automated tests don't catch UX issues
2. **Confidence**: Human approval means "I verified this works"
3. **Feedback Loop**: Human catches what automation misses
4. **Accountability**: Clear ownership of quality sign-off

### Why Reconcile Learnings?

1. **Institutional Memory**: CLAUDE.md improves with every task
2. **Future Quality**: Next developer (human or AI) benefits
3. **Spec Accuracy**: Specs stay accurate, not outdated
4. **Pattern Discovery**: New DO/DON'T rules emerge from experience

---

## 6. Implementation Guide

### Step 1: Database Schema Updates

**File**: `src/lib/schema.ts`

```typescript
// Add ticket workflow state table
export const ticketWorkflowState = sqliteTable("ticket_workflow_state", {
  ticket_id: text("ticket_id")
    .primaryKey()
    .references(() => tickets.id, { onDelete: "cascade" }),

  // Implementation phase
  plan_written: integer("plan_written").notNull().default(0),
  validation_passed: integer("validation_passed").notNull().default(0),

  // AI Review phase
  ai_review_started: integer("ai_review_started").notNull().default(0),
  review_findings_count: integer("review_findings_count").notNull().default(0),
  review_iteration: integer("review_iteration").notNull().default(0),
  all_findings_fixed: integer("all_findings_fixed").notNull().default(0),

  // Human Review phase
  demo_script_generated: integer("demo_script_generated").notNull().default(0),
  demo_script: text("demo_script"),
  human_ran_demo: integer("human_ran_demo").notNull().default(0),
  human_feedback: text("human_feedback"),
  human_approved: integer("human_approved").notNull().default(0),

  // Completion
  learnings_reconciled: integer("learnings_reconciled").notNull().default(0),
  learnings: text("learnings"),

  // Timestamps
  started_at: text("started_at"),
  completed_at: text("completed_at"),
});

// Add epic workflow state table
export const epicWorkflowState = sqliteTable("epic_workflow_state", {
  epic_id: text("epic_id")
    .primaryKey()
    .references(() => epics.id, { onDelete: "cascade" }),

  // Completion tracking
  total_tickets: integer("total_tickets").notNull().default(0),
  completed_tickets: integer("completed_tickets").notNull().default(0),

  // DoD Audit
  dod_audit_passed: integer("dod_audit_passed").notNull().default(0),
  dod_audit_findings: text("dod_audit_findings"), // JSON array

  // Epic Review
  epic_review_passed: integer("epic_review_passed").notNull().default(0),
  epic_review_iteration: integer("epic_review_iteration").notNull().default(0),

  // Demo & Feedback
  epic_demo_script: text("epic_demo_script"),
  epic_human_feedback: text("epic_human_feedback"),
  epic_approved: integer("epic_approved").notNull().default(0),

  // Learnings & PR
  learnings_reconciled: integer("learnings_reconciled").notNull().default(0),
  pr_url: text("pr_url"),
  pr_number: integer("pr_number"),
});

// Add review findings table
export const reviewFindings = sqliteTable("review_findings", {
  id: text("id").primaryKey(),
  ticket_id: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  epic_id: text("epic_id")
    .notNull()
    .references(() => epics.id, { onDelete: "cascade" }),

  agent: text("agent").notNull(),
  priority: text("priority").notNull(), // P0-P4

  file_path: text("file_path").notNull(),
  line_number: integer("line_number"),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  suggested_fix: text("suggested_fix"),

  status: text("status").notNull().default("open"), // open, fixed, wontfix
  fix_description: text("fix_description"),

  iteration: integer("iteration").notNull().default(1),
  created_at: text("created_at").notNull(),
  fixed_at: text("fixed_at"),
});

// Add demo scripts table
export const demoScripts = sqliteTable("demo_scripts", {
  id: text("id").primaryKey(),
  ticket_id: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  epic_id: text("epic_id")
    .notNull()
    .references(() => epics.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description"),
  steps: text("steps").notNull(), // JSON array of DemoStep

  generated_at: text("generated_at").notNull(),
  executed_at: text("executed_at"),
  executed_by: text("executed_by"),
  passed: integer("passed"),
});
```

### Step 2: Remove Legacy `review` Status

**File**: `src/lib/constants.ts`

```typescript
// Status options for ticket forms - CLEANED UP
export const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  // REMOVED: { value: "review", label: "Review" },
  { value: "ai_review", label: "AI Review" },
  { value: "human_review", label: "Human Review" },
  { value: "done", label: "Done" },
] as const;

export const COLUMN_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  // REMOVED: "review",
  "ai_review",
  "human_review",
  "done",
] as const;

export const STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  // REMOVED: review: 3,
  ai_review: 3,
  human_review: 4,
  done: 5,
};

// Remove from STATUS_BADGE_CONFIG, getStatusColor, etc.
```

**Migration**: Update existing tickets with `status = 'review'` to `status = 'ai_review'`

### Step 3: MCP Workflow Tools (with Comments & Telemetry)

**File**: `mcp-server/tools/workflow-v2.js`

Every MCP tool that advances the workflow MUST:

1. Create a ticket comment documenting the action
2. Emit telemetry events for observability
3. Update status appropriately

```javascript
import { z } from "zod";
import { addTicketComment } from "./comments.js";
import { logToolEvent, logContextEvent } from "./telemetry.js";

export function registerWorkflowV2Tools(server, db) {
  // Helper: Add comment and telemetry in one call
  async function documentAction(
    ticketId,
    { commentType = "progress", commentContent, author = "claude", telemetryEvent, telemetryData }
  ) {
    // Always add comment
    await addTicketComment(db, {
      ticketId,
      content: commentContent,
      author,
      type: commentType,
    });

    // Log telemetry if session exists
    const session = await getActiveTelemetrySession(ticketId);
    if (session && telemetryEvent) {
      await logToolEvent(db, {
        sessionId: session.id,
        ticketId,
        event: telemetryEvent,
        ...telemetryData,
      });
    }
  }

  /**
   * Start work on a ticket - with precondition checking
   */
  server.tool(
    "start_ticket_work",
    {
      description: "Begin work on a ticket. Checks preconditions and sets up workflow tracking.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID to start" },
        },
        required: ["ticketId"],
      },
    },
    async ({ ticketId }) => {
      const ticket = await getTicket(ticketId);
      if (!ticket) {
        return error(`Ticket ${ticketId} not found`);
      }

      // PRECONDITION 1: No other ticket in progress for this project
      const inProgress = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.project_id, ticket.project_id), eq(tickets.status, "in_progress")))
        .get();

      if (inProgress) {
        return error(
          `BLOCKED: Ticket "${inProgress.title}" (${inProgress.id}) is already in progress.\n\n` +
            `You must complete it first:\n` +
            `  complete_ticket_work({ ticketId: "${inProgress.id}", summary: "..." })\n\n` +
            `Or abandon it:\n` +
            `  abandon_ticket_work({ ticketId: "${inProgress.id}", reason: "..." })`
        );
      }

      // PRECONDITION 2: Previous ticket was reviewed (if exists)
      const lastCompleted = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.project_id, ticket.project_id), eq(tickets.status, "done")))
        .orderBy(desc(tickets.completed_at))
        .get();

      if (lastCompleted) {
        const workflowState = await db
          .select()
          .from(ticketWorkflowState)
          .where(eq(ticketWorkflowState.ticket_id, lastCompleted.id))
          .get();

        if (workflowState && !workflowState.human_approved) {
          return error(
            `BLOCKED: Previous ticket "${lastCompleted.title}" was not fully reviewed.\n\n` +
              `Run the review workflow:\n` +
              `  /review-ticket ${lastCompleted.id}`
          );
        }
      }

      // All good - start work
      await db
        .update(tickets)
        .set({
          status: "in_progress",
          updated_at: new Date().toISOString(),
          branch_name: branchName,
        })
        .where(eq(tickets.id, ticketId));

      await db
        .insert(ticketWorkflowState)
        .values({
          ticket_id: ticketId,
          started_at: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: ticketWorkflowState.ticket_id,
          set: { started_at: new Date().toISOString() },
        });

      // Create branch
      const branchName = `feature/${ticket.id.slice(0, 8)}-${slugify(ticket.title)}`;

      // MANDATORY: Document the action
      await documentAction(ticketId, {
        commentType: "progress",
        commentContent:
          `**Started work on ticket**\n\n` +
          `- Branch: \`${branchName}\`\n` +
          `- Status: in_progress\n` +
          `- Started at: ${new Date().toISOString()}`,
        author: "claude", // or "ralph" depending on context
        telemetryEvent: "start",
        telemetryData: {
          toolName: "start_ticket_work",
          params: { ticketId, branchName },
        },
      });

      // Start telemetry session for this ticket
      await startTelemetrySession(db, {
        ticketId,
        projectId: ticket.project_id,
        environment: detectEnvironment(),
      });

      // Log context event (what context was loaded)
      await logContextEvent(db, {
        sessionId: await getActiveTelemetrySession(ticketId).id,
        hasDescription: !!ticket.description,
        hasAcceptanceCriteria: !!ticket.subtasks,
        criteriaCount: ticket.subtasks ? JSON.parse(ticket.subtasks).length : 0,
        commentCount: await getCommentCount(ticketId),
      });

      return success(
        `Started work on: ${ticket.title}\n\n` +
          `Branch: ${branchName}\n\n` +
          `## Next Steps:\n` +
          `1. Write a 5-10 bullet micro-plan using TaskCreate\n` +
          `2. Implement the changes\n` +
          `3. Run validation: pnpm check\n` +
          `4. Complete: complete_ticket_work({ ticketId: "${ticketId}", summary: "..." })`
      );
    }
  );

  /**
   * Complete ticket work - moves to ai_review
   */
  server.tool(
    "complete_ticket_work",
    {
      description: "Finish implementation and move to AI review phase.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          summary: { type: "string", description: "Summary of work done" },
        },
        required: ["ticketId", "summary"],
      },
    },
    async ({ ticketId, summary }) => {
      const ticket = await getTicket(ticketId);
      const workflowState = await getWorkflowState(ticketId);

      // WARN if plan wasn't written (add comment but don't block)
      if (!workflowState?.plan_written) {
        await documentAction(ticketId, {
          commentType: "progress",
          commentContent: `⚠️ **Warning**: Ticket completed without a micro-plan being written`,
          author: "system",
        });
      }

      // Move to ai_review
      await db
        .update(tickets)
        .set({ status: "ai_review", updated_at: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));

      await db
        .update(ticketWorkflowState)
        .set({ ai_review_started: 1 })
        .where(eq(ticketWorkflowState.ticket_id, ticketId));

      // MANDATORY: Document the work summary
      await documentAction(ticketId, {
        commentType: "work_summary",
        commentContent:
          `**Implementation Complete**\n\n` +
          `## Summary\n${summary}\n\n` +
          `## Status\n` +
          `- Previous: in_progress\n` +
          `- Current: ai_review\n` +
          `- Next: Automated code review`,
        author: "claude",
        telemetryEvent: "end",
        telemetryData: {
          toolName: "complete_ticket_work",
          params: { ticketId },
          success: true,
        },
      });

      return success(
        `Implementation complete! Moving to AI Review.\n\n` +
          `## Summary:\n${summary}\n\n` +
          `## Next Steps:\n` +
          `The ticket is now in AI Review. Run:\n` +
          `  /review-ticket ${ticketId}\n\n` +
          `This will:\n` +
          `1. Run all 7 review agents\n` +
          `2. Create findings for any issues\n` +
          `3. Enter fix loop until clean\n` +
          `4. Move to Human Review when done`
      );
    }
  );

  /**
   * Submit review finding
   */
  server.tool(
    "submit_review_finding",
    {
      description: "Report an issue found by a review agent.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID (null for epic-level)" },
          epicId: { type: "string" },
          agent: {
            type: "string",
            enum: [
              "code-reviewer",
              "silent-failure-hunter",
              "code-simplifier",
              "context7-library-compliance",
              "react-best-practices",
              "cruft-detector",
              "senior-engineer",
            ],
          },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4"] },
          filePath: { type: "string" },
          lineNumber: { type: "number" },
          summary: { type: "string" },
          description: { type: "string" },
          suggestedFix: { type: "string" },
        },
        required: ["epicId", "agent", "priority", "filePath", "summary", "description"],
      },
    },
    async (input) => {
      const id = crypto.randomUUID();
      const workflowState = input.ticketId
        ? await getWorkflowState(input.ticketId)
        : await getEpicWorkflowState(input.epicId);

      await db.insert(reviewFindings).values({
        id,
        ticket_id: input.ticketId,
        epic_id: input.epicId,
        agent: input.agent,
        priority: input.priority,
        file_path: input.filePath,
        line_number: input.lineNumber,
        summary: input.summary,
        description: input.description,
        suggested_fix: input.suggestedFix,
        iteration: workflowState?.review_iteration || 1,
        created_at: new Date().toISOString(),
      });

      // Update counts
      if (input.ticketId) {
        await db.run(sql`
          UPDATE ticket_workflow_state
          SET review_findings_count = review_findings_count + 1
          WHERE ticket_id = ${input.ticketId}
        `);
      }

      return success(`Finding recorded: ${input.summary} [${input.priority}]`);
    }
  );

  /**
   * Mark finding as fixed
   */
  server.tool(
    "mark_finding_fixed",
    {
      description: "Mark a review finding as fixed.",
      inputSchema: {
        type: "object",
        properties: {
          findingId: { type: "string" },
          fixDescription: { type: "string" },
        },
        required: ["findingId"],
      },
    },
    async ({ findingId, fixDescription }) => {
      await db
        .update(reviewFindings)
        .set({
          status: "fixed",
          fix_description: fixDescription,
          fixed_at: new Date().toISOString(),
        })
        .where(eq(reviewFindings.id, findingId));

      return success(`Finding marked as fixed.`);
    }
  );

  /**
   * Generate demo script
   */
  server.tool(
    "generate_demo_script",
    {
      description: "Generate a demo script for manual testing.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          epicId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                instruction: { type: "string" },
                expectedResult: { type: "string" },
              },
              required: ["instruction", "expectedResult"],
            },
          },
        },
        required: ["epicId", "title", "steps"],
      },
    },
    async ({ ticketId, epicId, title, description, steps }) => {
      const id = crypto.randomUUID();

      const stepsWithOrder = steps.map((s, i) => ({
        order: i + 1,
        instruction: s.instruction,
        expectedResult: s.expectedResult,
        passed: null,
        notes: null,
      }));

      await db.insert(demoScripts).values({
        id,
        ticket_id: ticketId,
        epic_id: epicId,
        title,
        description,
        steps: JSON.stringify(stepsWithOrder),
        generated_at: new Date().toISOString(),
      });

      // Update workflow state
      if (ticketId) {
        await db
          .update(ticketWorkflowState)
          .set({ demo_script_generated: 1, demo_script: id })
          .where(eq(ticketWorkflowState.ticket_id, ticketId));
      } else {
        await db
          .update(epicWorkflowState)
          .set({ epic_demo_script: id })
          .where(eq(epicWorkflowState.epic_id, epicId));
      }

      // Format for display
      let output = `## Demo Script: ${title}\n\n`;
      if (description) output += `${description}\n\n`;
      output += `### Steps:\n\n`;
      stepsWithOrder.forEach((s, i) => {
        output += `${i + 1}. ${s.instruction}\n`;
        output += `   **Expected:** ${s.expectedResult}\n\n`;
      });
      output += `\n---\n`;
      output += `After running the demo, provide feedback:\n`;
      output += `  submit_demo_feedback({ demoId: "${id}", passed: true/false, feedback: "..." })`;

      return success(output);
    }
  );

  /**
   * Submit demo feedback
   */
  server.tool(
    "submit_demo_feedback",
    {
      description: "Submit feedback after running the demo.",
      inputSchema: {
        type: "object",
        properties: {
          demoId: { type: "string" },
          passed: { type: "boolean" },
          feedback: { type: "string" },
          stepResults: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stepNumber: { type: "number" },
                passed: { type: "boolean" },
                notes: { type: "string" },
              },
            },
          },
        },
        required: ["demoId", "passed"],
      },
    },
    async ({ demoId, passed, feedback, stepResults }) => {
      const demo = await db.select().from(demoScripts).where(eq(demoScripts.id, demoId)).get();

      if (!demo) {
        return error(`Demo ${demoId} not found`);
      }

      // Update step results if provided
      if (stepResults) {
        const steps = JSON.parse(demo.steps);
        stepResults.forEach((sr) => {
          const step = steps.find((s) => s.order === sr.stepNumber);
          if (step) {
            step.passed = sr.passed;
            step.notes = sr.notes;
          }
        });
        await db
          .update(demoScripts)
          .set({ steps: JSON.stringify(steps) })
          .where(eq(demoScripts.id, demoId));
      }

      await db
        .update(demoScripts)
        .set({
          executed_at: new Date().toISOString(),
          executed_by: "human",
          passed: passed ? 1 : 0,
        })
        .where(eq(demoScripts.id, demoId));

      // Update workflow state
      if (demo.ticket_id) {
        await db
          .update(ticketWorkflowState)
          .set({
            human_ran_demo: 1,
            human_feedback: feedback,
            human_approved: passed ? 1 : 0,
          })
          .where(eq(ticketWorkflowState.ticket_id, demo.ticket_id));

        if (passed) {
          await db
            .update(tickets)
            .set({ status: "done", completed_at: new Date().toISOString() })
            .where(eq(tickets.id, demo.ticket_id));
        }
      }

      if (passed) {
        return success(
          `Demo passed! Ticket moved to Done.\n\n` +
            `## Next Steps:\n` +
            `1. Run /reconcile-learnings to update CLAUDE.md\n` +
            `2. Continue with next ticket: /next-task`
        );
      } else {
        return success(
          `Demo found issues. Ticket remains in Human Review.\n\n` +
            `Feedback: ${feedback}\n\n` +
            `## Next Steps:\n` +
            `1. Address the feedback\n` +
            `2. Run validation: pnpm check\n` +
            `3. Generate new demo: generate_demo_script(...)\n` +
            `4. Re-run demo with user`
        );
      }
    }
  );

  /**
   * Reconcile learnings
   */
  server.tool(
    "reconcile_learnings",
    {
      description: "Update CLAUDE.md, specs, and future tickets with learnings.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          epicId: { type: "string" },
          learnings: { type: "string", description: "What was learned" },
          claudeMdUpdates: { type: "string", description: "Updates to add to CLAUDE.md" },
          specUpdates: { type: "array", items: { type: "string" } },
          futureTicketUpdates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ticketId: { type: "string" },
                update: { type: "string" },
              },
            },
          },
        },
        required: ["learnings"],
      },
    },
    async ({ ticketId, epicId, learnings, claudeMdUpdates, specUpdates, futureTicketUpdates }) => {
      // Update workflow state
      if (ticketId) {
        await db
          .update(ticketWorkflowState)
          .set({ learnings_reconciled: 1, learnings })
          .where(eq(ticketWorkflowState.ticket_id, ticketId));
      }
      if (epicId) {
        await db
          .update(epicWorkflowState)
          .set({ learnings_reconciled: 1 })
          .where(eq(epicWorkflowState.epic_id, epicId));
      }

      let output = `## Learnings Recorded\n\n${learnings}\n\n`;

      if (claudeMdUpdates) {
        output += `## CLAUDE.md Updates\n\nThe following should be added to CLAUDE.md:\n\n${claudeMdUpdates}\n\n`;
      }

      if (specUpdates?.length) {
        output += `## Spec Updates\n\nThe following specs should be updated:\n`;
        specUpdates.forEach((s) => (output += `- ${s}\n`));
        output += `\n`;
      }

      if (futureTicketUpdates?.length) {
        output += `## Future Ticket Updates\n\nThe following tickets should be updated with new context:\n`;
        futureTicketUpdates.forEach((t) => (output += `- ${t.ticketId}: ${t.update}\n`));
      }

      return success(output);
    }
  );
}

// Helper functions
function success(message) {
  return { content: [{ type: "text", text: message }] };
}

function error(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}
```

### Step 4: Skills (Portable Prompts)

**File**: `.claude/commands/next-task.md`

```markdown
---
description: Pick up the next task with precondition checking
---

# Next Task

You are starting work on the next available task.

## Steps

1. Call `start_ticket_work({ ticketId: "<next-ticket>" })`
   - The tool will check preconditions and block if needed
   - Follow any instructions in the response

2. If successful, write a 5-10 bullet micro-plan using TaskCreate

3. Implement the changes

4. Run validation: `pnpm check`

5. Complete: `complete_ticket_work({ ticketId, summary: "..." })`

## Important

- The MCP tool enforces preconditions - trust its guidance
- If blocked, follow the instructions to unblock
- Always write a plan before coding
- Always validate before completing
```

**File**: `.claude/commands/review-ticket.md`

```markdown
---
description: Run full review workflow on a ticket
---

# Review Ticket

You are running the AI review workflow for a ticket in `ai_review` status.

## Steps

1. Run all 7 review agents in parallel using Task tool:
   - pr-review-toolkit:code-reviewer
   - pr-review-toolkit:silent-failure-hunter
   - pr-review-toolkit:code-simplifier
   - context7-library-compliance
   - react-best-practices
   - cruft-detector
   - senior-engineer

2. For EVERY issue found, call `submit_review_finding`:
```

submit_review_finding({
ticketId: "<ticket-id>",
epicId: "<epic-id>",
agent: "code-reviewer",
priority: "P2",
filePath: "src/api/tickets.ts",
lineNumber: 42,
summary: "Missing input validation",
description: "...",
suggestedFix: "..."
})

```

3. After all agents complete, get findings:
`get_review_findings({ ticketId: "<ticket-id>" })`

4. Fix issues in priority order (P0 first):
- Make the fix
- Run `pnpm check`
- Call `mark_finding_fixed({ findingId: "...", fixDescription: "..." })`
- Commit: `git commit -m "fix(review): ..."`

5. Re-run review to check for regressions

6. When all findings fixed, generate demo:
```

generate_demo_script({
ticketId: "<ticket-id>",
epicId: "<epic-id>",
title: "Demo: [Ticket Title]",
steps: [
{ instruction: "Open http://localhost:4242", expectedResult: "App loads" },
{ instruction: "Click on ticket X", expectedResult: "Modal opens" },
...
]
})

```

7. Present demo script to user and wait for feedback
```

---

## Acceptance Criteria

### Status Cleanup

- [ ] Remove `review` from STATUS_OPTIONS
- [ ] Remove `review` from COLUMN_STATUSES
- [ ] Remove `review` from STATUS_ORDER
- [ ] Remove `review` from STATUS_BADGE_CONFIG
- [ ] Update `getStatusColor` to not handle `review`
- [ ] Migration: `UPDATE tickets SET status = 'ai_review' WHERE status = 'review'`

### Comments & Documentation

- [ ] `start_ticket_work` creates "Started work" comment
- [ ] `complete_ticket_work` creates work_summary comment
- [ ] `submit_review_finding` creates progress comment with finding summary
- [ ] `mark_finding_fixed` creates progress comment with fix description
- [ ] `generate_demo_script` creates progress comment with step count
- [ ] `submit_demo_feedback` creates comment with user feedback
- [ ] `reconcile_learnings` creates progress comment listing updates
- [ ] All comments include timestamps and author
- [ ] Comment type is appropriate (progress, work_summary, test_report, comment)

### Telemetry & Observability

- [ ] `start_ticket_work` starts telemetry session
- [ ] `start_ticket_work` logs context event (description, criteria, comments)
- [ ] Each MCP tool logs tool event (start/end with params)
- [ ] `complete_ticket_work` logs session transition
- [ ] Review agents log their findings count
- [ ] Fix loop logs each iteration
- [ ] Demo submission logs outcome
- [ ] Session end logs totals (tools, tokens, duration, outcome)
- [ ] Telemetry visible in Brain Dump UI ticket detail

### Status Updates

- [ ] `start_ticket_work` sets status to `in_progress`
- [ ] `complete_ticket_work` sets status to `ai_review`
- [ ] AI review pass sets status to `human_review`
- [ ] `submit_demo_feedback(passed=true)` sets status to `done`
- [ ] Status changes are atomic with workflow state updates
- [ ] UI reflects status changes in real-time (via TanStack Query invalidation)

### Database Schema

- [ ] Create `ticket_workflow_state` table
- [ ] Create `epic_workflow_state` table
- [ ] Create `review_findings` table
- [ ] Create `demo_scripts` table
- [ ] Run migrations

### MCP Tools

- [ ] `start_ticket_work` with precondition checking
- [ ] `complete_ticket_work` moves to ai_review
- [ ] `submit_review_finding` stores findings
- [ ] `mark_finding_fixed` updates status
- [ ] `generate_demo_script` creates demo
- [ ] `submit_demo_feedback` records feedback
- [ ] `reconcile_learnings` updates state

### Skills

- [ ] `/next-task` skill
- [ ] `/review-ticket` skill
- [ ] `/review-epic` skill
- [ ] `/demo` skill
- [ ] `/reconcile-learnings` skill

### Installation & Multi-Environment

- [ ] `install.sh` configures MCP for Claude Code
- [ ] `install.sh` configures MCP for OpenCode
- [ ] `install.sh` configures MCP for VS Code (if installed)
- [ ] `install.sh` configures MCP for Cursor (if installed)
- [ ] `install.sh` installs global hooks to `~/.claude/hooks/`
- [ ] `install.sh` installs global skills to `~/.claude/commands/`
- [ ] `uninstall.sh` cleanly removes all MCP configurations
- [ ] `uninstall.sh` removes hooks without breaking other hooks
- [ ] `uninstall.sh` removes skills
- [ ] `brain-dump doctor` command verifies all environments
- [ ] Documentation updated for multi-environment setup

### Claude Code Specific Integration (Primary Environment)

- [ ] All hooks installed to `~/.claude/hooks/` (global)
- [ ] `SessionStart` hook for telemetry session start
- [ ] `PreToolUse` hook for tool start logging (writes to queue)
- [ ] `PostToolUse` hook for tool end logging (writes to queue)
- [ ] `PostToolUseFailure` hook for tool failure logging
- [ ] `UserPromptSubmit` hook for prompt capture
- [ ] `Stop` hook for telemetry session end and queue flush
- [ ] Queue file pattern: `.claude/telemetry-queue.jsonl`
- [ ] Correlation file: `.claude/tool-correlations.json`
- [ ] Session file: `.claude/telemetry-session.json`
- [ ] `~/.claude/settings.json` hook configuration updated
- [ ] Install script merges hooks without overwriting existing
- [ ] Workflow enforcement hooks installed (state enforcement)
- [ ] Skills installed to `~/.claude/commands/`
- [ ] Verify hooks work with `claude --print-hooks`
- [ ] Documentation references official Claude Code hook docs

### OpenCode Specific Integration

- [ ] Brain Dump plugin created: `brain-dump-telemetry.ts`
- [ ] Plugin implements `tool.execute.before` hook for tool start logging
- [ ] Plugin implements `tool.execute.after` hook for tool end logging
- [ ] Plugin implements `session.created` hook for session start
- [ ] Plugin implements `session.idle` hook for session end
- [ ] Plugin installed to `~/.config/opencode/plugins/` (global)
- [ ] `AGENTS.md` template created for workflow enforcement
- [ ] `.opencode/skills/brain-dump-workflow/SKILL.md` skill created
- [ ] `opencode.json` snippet for MCP server configuration
- [ ] Install script detects OpenCode and installs plugin
- [ ] Install script creates `AGENTS.md` if not exists
- [ ] Documentation references OpenCode plugin docs
- [ ] Test plugin with `opencode mcp debug brain-dump`

### VS Code Specific Integration (Instructions-Based)

- [ ] `.vscode/mcp.json` template created for projects
- [ ] `.github/copilot-instructions.md` template for workflow enforcement
- [ ] `.github/skills/brain-dump-workflow.skill.md` for auto-activated guidance
- [ ] Install script detects VS Code and creates appropriate configs
- [ ] Install script offers to create `.github/copilot-instructions.md`
- [ ] MCP server works with VS Code's stdio transport format
- [ ] Documentation for VS Code MCP server trust flow

> **Note**: VS Code extension with Language Model Tool API is OUT OF SCOPE for this epic. We will use the instructions-based approach which provides medium enforcement via prompt guidance + MCP preconditions.

### Cursor Specific Integration (Full Hooks Support)

- [ ] Brain Dump hooks created for Cursor: `.cursor/hooks/` directory
- [ ] `sessionStart` hook for telemetry session start
- [ ] `sessionEnd` hook for telemetry session end
- [ ] `preToolUse` hook for tool start logging
- [ ] `postToolUse` hook for tool end logging (success)
- [ ] `postToolUseFailure` hook for tool end logging (failure)
- [ ] `beforeSubmitPrompt` hook for user prompt capture
- [ ] `.cursor/hooks.json` configuration file created
- [ ] `.cursor/mcp.json` template created
- [ ] `.cursor/rules/brain-dump-workflow.md` rule created
- [ ] `.cursor/skills/brain-dump-workflow/SKILL.md` skill created
- [ ] Install script detects Cursor and installs hooks to `~/.cursor/hooks/`
- [ ] Install script creates `.cursor/hooks.json` or updates existing
- [ ] Test Claude Code hook compatibility (Cursor loads `.claude/settings.json`)
- [ ] Document Cursor-specific hook format differences
- [ ] Verify MCP server compatibility with Cursor's implementation

### Human Review Approval UI

- [ ] `DemoPanel` component shows demo steps
- [ ] `DemoStep` component with pass/fail/skip buttons
- [ ] Notes field for each step
- [ ] Overall feedback text area
- [ ] "Approve & Complete" button (validates all steps marked)
- [ ] "Request Changes" button (requires failed step or feedback)
- [ ] Kanban card shows "Demo Ready" badge when in human_review
- [ ] Ticket detail shows prominent "Start Demo Review" CTA
- [ ] Toast notification when ticket enters human_review
- [ ] `getDemoScript` server function
- [ ] `updateDemoStep` server function
- [ ] `submitDemoFeedback` server function
- [ ] `useDemoScript` TanStack Query hook
- [ ] Approval triggers `/reconcile-learnings` prompt
- [ ] Rejection creates comment with issues for AI

### Integration

- [ ] Ralph script uses new workflow
- [ ] Hooks enforce workflow in Claude Code
- [ ] OpenCode guided by MCP responses (same as Claude Code behavior)
- [ ] VS Code/Cursor guided by MCP responses
- [ ] UI shows workflow state
- [ ] human_review tickets show action required indicator

---

### Installation & Multi-Environment Configuration

The install/uninstall scripts MUST configure MCP servers, skills, and hooks for ALL supported environments.

#### Supported Environments

| Environment     | MCP Config Location                                | Hooks/Events                                                                                                          | Skills/Instructions                                     | Workflow Enforcement                    |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| **Claude Code** | `~/.claude/settings.json`                          | ✅ Full hooks (PreToolUse, PostToolUse, SessionStart, Stop, etc.)                                                     | ✅ `.claude/commands/`                                  | ✅ Hooks block bad actions              |
| **OpenCode**    | `opencode.json` (project or `~/.config/opencode/`) | ✅ Plugin events (40+): `tool.execute.before/after`, `session.created/idle/error`                                     | ✅ `.opencode/skills/`, `AGENTS.md`                     | ✅ Plugin intercept + MCP preconditions |
| **Cursor**      | `.cursor/mcp.json`                                 | ✅ Full hooks (preToolUse, postToolUse, sessionStart, sessionEnd, beforeSubmitPrompt, etc.) + **loads Claude hooks!** | ✅ `.cursor/rules/`, `.cursor/skills/`                  | ✅ Hooks block bad actions              |
| **VS Code**     | `.vscode/mcp.json` (workspace) or global settings  | ❌ No hooks (instructions only)                                                                                       | ✅ `.github/copilot-instructions.md`, `.github/skills/` | ⚠️ Instructions + MCP preconditions     |

**VS Code Extensibility Details:**

| Feature                 | API                                               | Purpose                                | Telemetry Use                                                    |
| ----------------------- | ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| Custom Instructions     | `.github/copilot-instructions.md`                 | Inject guidance into all chat requests | Enforce workflow, prompt to log                                  |
| Agent Skills            | `.github/skills/*.skill.md`                       | Auto-activated reusable prompts        | Workflow guidance per context                                    |
| Language Model Tool API | `vscode.lm.registerTool()`                        | Define custom tools with callbacks     | `prepareInvocation` = PreToolUse, `invoke finally` = PostToolUse |
| MCP Server Provider     | `vscode.lm.registerMcpServerDefinitionProvider()` | Programmatic MCP server registration   | Could intercept/wrap MCP calls                                   |
| Chat Participant API    | `vscode.chat.registerChatParticipant()`           | Custom @-mention assistants            | Control interaction flow                                         |

**Enforcement Comparison:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW ENFORCEMENT BY ENVIRONMENT                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Claude Code: HOOKS + MCP                                                   │
│  ─────────────────────────                                                  │
│  [PreToolUse Hook]──► BLOCK if wrong state ──► [MCP Tool]──► Database      │
│        │                                                                    │
│        └──► "Call update_session_state first"                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cursor: HOOKS + MCP (Claude-compatible!)                                   │
│  ─────────────────────────────────────────                                  │
│  [preToolUse Hook]──► BLOCK (exit 2) ──► [MCP Tool]──► Database            │
│        │                                                                    │
│        └──► Same as Claude Code! Can load Claude hooks directly             │
│                                                                             │
│  [.cursor/rules/]──► AI reads workflow rules ──► AI follows                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OpenCode: PLUGIN EVENTS + MCP                                              │
│  ─────────────────────────────                                              │
│  [tool.execute.before]──► Log start + can modify ──► [Tool Executes]       │
│        │                                                   │                │
│        │                                                   ▼                │
│        │                                           [tool.execute.after]     │
│        │                                                   │                │
│        │                                                   └── Log end      │
│        │                                                                    │
│        └──► Plugin can intercept and block (modify output)                  │
│                                                                             │
│  [AGENTS.md]──► AI reads workflow rules ──► AI follows                      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VS Code: INSTRUCTIONS + MCP (No hooks)                                     │
│  ──────────────────────────────────────                                     │
│  [copilot-instructions.md]──► AI reads ──► AI follows (hopefully)           │
│        │                                   │                                │
│        │                                   ▼                                │
│        │                         [MCP Tool]──► BLOCK if precondition fails  │
│        │                                   │                                │
│        └── "Use start_ticket_work first"   └──► "BLOCKED: ticket in_progress│
│                                                  already exists"            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Enforcement Strength Comparison:**

| Environment           | Can Block Tools             | Can Modify Params | Auto Telemetry | User Prompt           |
| --------------------- | --------------------------- | ----------------- | -------------- | --------------------- |
| **Claude Code**       | ✅ PreToolUse returns block | ❌ No             | ✅ Full        | ✅ UserPromptSubmit   |
| **Cursor**            | ✅ preToolUse exit code 2   | ❌ No             | ✅ Full        | ✅ beforeSubmitPrompt |
| **OpenCode (Plugin)** | ⚠️ Via output modification  | ✅ Yes            | ✅ Full        | ❌ No                 |
| **VS Code**           | ⚠️ MCP preconditions only   | ❌ No             | ⚠️ MCP only    | ❌ No                 |

#### Install Script Requirements

**File**: `install.sh`

```bash
#!/bin/bash

# ... existing install logic ...

install_mcp_server() {
  echo "📡 Configuring MCP server for all environments..."

  MCP_SERVER_PATH="$BRAIN_DUMP_ROOT/mcp-server/index.js"

  # 1. Claude Code (global)
  if [ -f "$HOME/.claude.json" ]; then
    CLAUDE_CONFIG="$HOME/.claude.json"
  else
    CLAUDE_CONFIG="$HOME/.claude/settings.json"
    mkdir -p "$HOME/.claude"
  fi

  # Add brain-dump MCP server to Claude Code config
  # Uses jq to merge into existing config
  jq --arg path "$MCP_SERVER_PATH" \
    '.mcpServers["brain-dump"] = {
      "command": "node",
      "args": [$path],
      "env": {}
    }' "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG.tmp" && mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
  echo "  ✓ Claude Code configured"

  # 2. OpenCode (global)
  OPENCODE_CONFIG="$HOME/.opencode/config.json"
  if [ -d "$HOME/.opencode" ]; then
    # OpenCode uses similar MCP config structure
    jq --arg path "$MCP_SERVER_PATH" \
      '.mcpServers["brain-dump"] = {
        "command": "node",
        "args": [$path]
      }' "$OPENCODE_CONFIG" > "$OPENCODE_CONFIG.tmp" && mv "$OPENCODE_CONFIG.tmp" "$OPENCODE_CONFIG"
    echo "  ✓ OpenCode configured"
  fi

  # 3. VS Code (global user settings)
  VSCODE_CONFIG="$HOME/.vscode/settings.json"
  if [ -d "$HOME/.vscode" ]; then
    # VS Code MCP extension uses different config structure
    jq --arg path "$MCP_SERVER_PATH" \
      '.["mcp.servers"]["brain-dump"] = {
        "command": "node",
        "args": [$path]
      }' "$VSCODE_CONFIG" > "$VSCODE_CONFIG.tmp" && mv "$VSCODE_CONFIG.tmp" "$VSCODE_CONFIG"
    echo "  ✓ VS Code configured"
  fi

  # 4. Cursor (global)
  CURSOR_CONFIG="$HOME/.cursor/settings.json"
  if [ -d "$HOME/.cursor" ]; then
    jq --arg path "$MCP_SERVER_PATH" \
      '.["mcp.servers"]["brain-dump"] = {
        "command": "node",
        "args": [$path]
      }' "$CURSOR_CONFIG" > "$CURSOR_CONFIG.tmp" && mv "$CURSOR_CONFIG.tmp" "$CURSOR_CONFIG"
    echo "  ✓ Cursor configured"
  fi
}

install_hooks() {
  echo "🪝 Installing workflow hooks for Claude Code..."

  HOOKS_DIR="$HOME/.claude/hooks"
  mkdir -p "$HOOKS_DIR"

  # Copy workflow enforcement hooks
  cp "$BRAIN_DUMP_ROOT/hooks/enforce-workflow-preconditions.sh" "$HOOKS_DIR/"
  cp "$BRAIN_DUMP_ROOT/hooks/document-workflow-action.sh" "$HOOKS_DIR/"
  cp "$BRAIN_DUMP_ROOT/hooks/capture-claude-tasks.sh" "$HOOKS_DIR/"

  chmod +x "$HOOKS_DIR"/*.sh

  # Update Claude Code settings to use hooks
  # ... hook configuration in settings.json ...

  echo "  ✓ Hooks installed to $HOOKS_DIR"
}

install_skills() {
  echo "📚 Installing workflow skills..."

  SKILLS_DIR="$HOME/.claude/commands"
  mkdir -p "$SKILLS_DIR"

  # Copy global skills (work in any project)
  cp "$BRAIN_DUMP_ROOT/.claude/commands/next-task.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/review-ticket.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/review-epic.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/demo.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/reconcile-learnings.md" "$SKILLS_DIR/"

  echo "  ✓ Skills installed to $SKILLS_DIR"
}

# Main install
install_mcp_server
install_hooks
install_skills
```

#### Uninstall Script Requirements

**File**: `uninstall.sh`

```bash
#!/bin/bash

uninstall_mcp_server() {
  echo "📡 Removing MCP server from all environments..."

  # 1. Claude Code
  for config in "$HOME/.claude.json" "$HOME/.claude/settings.json"; do
    if [ -f "$config" ]; then
      jq 'del(.mcpServers["brain-dump"])' "$config" > "$config.tmp" && mv "$config.tmp" "$config"
    fi
  done
  echo "  ✓ Claude Code cleaned"

  # 2. OpenCode
  if [ -f "$HOME/.opencode/config.json" ]; then
    jq 'del(.mcpServers["brain-dump"])' "$HOME/.opencode/config.json" > tmp && mv tmp "$HOME/.opencode/config.json"
    echo "  ✓ OpenCode cleaned"
  fi

  # 3. VS Code
  if [ -f "$HOME/.vscode/settings.json" ]; then
    jq 'del(.["mcp.servers"]["brain-dump"])' "$HOME/.vscode/settings.json" > tmp && mv tmp "$HOME/.vscode/settings.json"
    echo "  ✓ VS Code cleaned"
  fi

  # 4. Cursor
  if [ -f "$HOME/.cursor/settings.json" ]; then
    jq 'del(.["mcp.servers"]["brain-dump"])' "$HOME/.cursor/settings.json" > tmp && mv tmp "$HOME/.cursor/settings.json"
    echo "  ✓ Cursor cleaned"
  fi
}

uninstall_hooks() {
  echo "🪝 Removing workflow hooks..."

  rm -f "$HOME/.claude/hooks/enforce-workflow-preconditions.sh"
  rm -f "$HOME/.claude/hooks/document-workflow-action.sh"
  rm -f "$HOME/.claude/hooks/capture-claude-tasks.sh"

  # Remove hook configuration from settings (but keep other hooks)
  # ... careful removal of only brain-dump hooks ...

  echo "  ✓ Hooks removed"
}

uninstall_skills() {
  echo "📚 Removing workflow skills..."

  rm -f "$HOME/.claude/commands/next-task.md"
  rm -f "$HOME/.claude/commands/review-ticket.md"
  rm -f "$HOME/.claude/commands/review-epic.md"
  rm -f "$HOME/.claude/commands/demo.md"
  rm -f "$HOME/.claude/commands/reconcile-learnings.md"

  echo "  ✓ Skills removed"
}

# Main uninstall
uninstall_mcp_server
uninstall_hooks
uninstall_skills
```

#### Configuration Verification

Add a verification command to check all environments are configured:

```bash
brain-dump doctor
```

Output:

```
🩺 Brain Dump Environment Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP Server Configuration:
  ✓ Claude Code  - brain-dump MCP configured in ~/.claude/settings.json
  ✓ OpenCode     - brain-dump MCP configured in ~/.opencode/config.json
  ✗ VS Code      - MCP not configured (run: brain-dump install --vscode)
  ✓ Cursor       - brain-dump MCP configured in ~/.cursor/settings.json

Hooks (Claude Code only):
  ✓ enforce-workflow-preconditions.sh
  ✓ document-workflow-action.sh
  ✓ capture-claude-tasks.sh

Skills:
  ✓ /next-task
  ✓ /review-ticket
  ✓ /review-epic
  ✓ /demo
  ✓ /reconcile-learnings

Database:
  ✓ SQLite database at ~/.local/share/brain-dump/brain-dump.db
  ✓ All migrations applied
  ✓ Workflow tables exist

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: 1 issue found

To fix VS Code:
  brain-dump install --vscode
```

#### Per-Project vs Global Configuration

| Component      | Scope       | Location                      |
| -------------- | ----------- | ----------------------------- |
| MCP Server     | Global      | User config files             |
| Workflow Hooks | Global      | `~/.claude/hooks/`            |
| General Skills | Global      | `~/.claude/commands/`         |
| Project Skills | Per-Project | `.claude/commands/`           |
| Project Hooks  | Per-Project | `.claude/hooks/` (in project) |

**Rationale**:

- MCP server is the same for all projects (connects to same database)
- Workflow hooks enforce the same quality standards everywhere
- Skills like `/next-task` work the same everywhere
- Projects can ADD custom skills/hooks but not remove global ones

#### Required Changes to Existing Scripts

**Current State**: `install.sh` and `uninstall.sh` exist but may not handle all environments.

**Changes Needed**:

| File           | Current                       | Needed Change                            |
| -------------- | ----------------------------- | ---------------------------------------- |
| `install.sh`   | Installs for Claude Code only | Add OpenCode, VS Code, Cursor MCP config |
| `install.sh`   | May not install global hooks  | Add `install_hooks()` function           |
| `install.sh`   | May not install global skills | Add `install_skills()` function          |
| `uninstall.sh` | May only clean Claude Code    | Add cleanup for all 4 environments       |
| `uninstall.sh` | May not remove hooks          | Add `uninstall_hooks()` function         |
| `uninstall.sh` | May not remove skills         | Add `uninstall_skills()` function        |
| `cli/index.ts` | No `doctor` command           | Add `brain-dump doctor` verification     |

**New Files Needed**:

| File                                      | Purpose                                 |
| ----------------------------------------- | --------------------------------------- |
| `hooks/enforce-workflow-preconditions.sh` | PreToolUse hook for workflow gates      |
| `hooks/document-workflow-action.sh`       | PostToolUse hook for comments/telemetry |
| `.claude/commands/next-task.md`           | Global skill for picking next task      |
| `.claude/commands/review-ticket.md`       | Global skill for ticket review          |
| `.claude/commands/review-epic.md`         | Global skill for epic review            |
| `.claude/commands/demo.md`                | Global skill for demo generation        |
| `.claude/commands/reconcile-learnings.md` | Global skill for updating docs          |

**Environment Detection Logic**:

```bash
# Detect which environments are installed
detect_environments() {
  ENVS=""

  # Claude Code - check for claude CLI
  if command -v claude &> /dev/null; then
    ENVS="$ENVS claude-code"
  fi

  # OpenCode - check for opencode CLI
  if command -v opencode &> /dev/null; then
    ENVS="$ENVS opencode"
  fi

  # VS Code - check for code CLI or config dir
  if command -v code &> /dev/null || [ -d "$HOME/.vscode" ]; then
    ENVS="$ENVS vscode"
  fi

  # Cursor - check for cursor CLI or config dir
  if command -v cursor &> /dev/null || [ -d "$HOME/.cursor" ]; then
    ENVS="$ENVS cursor"
  fi

  echo "$ENVS"
}
```

**Config File Locations by OS**:

| Environment | macOS                                                     | Linux                                 | Windows                               |
| ----------- | --------------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| Claude Code | `~/.claude/settings.json`                                 | `~/.claude/settings.json`             | `%APPDATA%\claude\settings.json`      |
| OpenCode    | `~/.opencode/config.json`                                 | `~/.opencode/config.json`             | `%APPDATA%\opencode\config.json`      |
| VS Code     | `~/Library/Application Support/Code/User/settings.json`   | `~/.config/Code/User/settings.json`   | `%APPDATA%\Code\User\settings.json`   |
| Cursor      | `~/Library/Application Support/Cursor/User/settings.json` | `~/.config/Cursor/User/settings.json` | `%APPDATA%\Cursor\User\settings.json` |

**MCP Config Differences**:

```jsonc
// Claude Code / OpenCode (similar format)
// Location: ~/.claude/settings.json or ~/.opencode/config.json
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"]
    }
  }
}

// VS Code - Workspace config
// Location: .vscode/mcp.json (per-project, shareable with team)
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {}
    }
  }
}

// VS Code - User settings (global)
// Location: ~/Library/Application Support/Code/User/settings.json (macOS)
//           ~/.config/Code/User/settings.json (Linux)
// Run "MCP: Add Server" command and select "Global"

// Cursor (similar to VS Code)
// Location: .cursor/mcp.json or Cursor settings
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"]
    }
  }
}
```

**VS Code Additional Setup**:

VS Code requires enabling MCP features and optionally installing custom instructions:

```bash
# 1. Enable MCP in VS Code settings
# Add to settings.json or run via command palette:
# "chat.mcp.enabled": true
# "chat.mcp.discovery.enabled": true  # Auto-detect from Claude Desktop config

# 2. Install custom instructions for workflow enforcement
mkdir -p .github
cat > .github/copilot-instructions.md << 'EOF'
# Brain Dump Workflow

When working on Brain Dump tickets:

## Required Workflow
1. Start work: `start_ticket_work({ ticketId })`
2. Write micro-plan using TaskCreate
3. Implement changes
4. Validate: `pnpm check`
5. Complete: `complete_ticket_work({ ticketId, summary })`

## Telemetry
- Call `log_tool_event` for significant operations
- The MCP server tracks session automatically

## Status Flow
in_progress → ai_review → human_review → done
EOF

# 3. Optionally install agent skills
mkdir -p .github/skills
# Copy skill files from brain-dump installation
```

**VS Code MCP Server Trust**:

On first use, VS Code will prompt to trust the MCP server:

1. Server appears in Extensions view under "MCP Servers"
2. Click to start the server
3. Confirm trust when prompted
4. Server tools become available in Copilot chat

---

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
