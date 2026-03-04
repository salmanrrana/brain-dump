# Universal Quality Workflow: Architecture Evolution

This document compares the **old architecture** (pre-refactor) with the **new architecture** (post cross-provider workflow pack refactor) through detailed diagrams.

---

## 1. High-Level Overview: Before vs After

### BEFORE: Hook-Heavy, File-Dependent Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GLOBAL INSTALL FOOTPRINT (~150+ files)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ~/.claude/hooks/ (24 shell scripts)                                        │
│  ├── Telemetry hooks (6)           ← fire on every tool call               │
│  ├── State recording hooks (2)     ← fire on every state change            │
│  ├── PR creation hook (1)          ← fires after start-work                │
│  ├── Pending-link hooks (2)        ← fire on session start + sync          │
│  ├── Telemetry merge utility (1)   ← reconfigures settings.json            │
│  └── Enforcement/utility hooks (10)← still needed                          │
│                                                                             │
│  ~/.claude/agents/ (9 persona files, ~27KB loaded into EVERY conversation)  │
│  ├── code-reviewer.md              ├── react-best-practices.md             │
│  ├── silent-failure-hunter.md      ├── cruft-detector.md                   │
│  ├── code-simplifier.md            ├── senior-engineer.md                  │
│  ├── context7-library-compliance.md├── inception.md                        │
│  └── breakdown.md                                                           │
│                                                                             │
│  ~/.claude/skills/ (8 skill directories — all global)                       │
│  ├── brain-dump-workflow/     ├── tanstack-query/                           │
│  ├── review/                  ├── tanstack-mutations/                       │
│  ├── review-aggregation/      ├── tanstack-forms/                           │
│  ├── tanstack-errors/         └── tanstack-types/                           │
│                                                                             │
│  ~/.claude/commands/ (9 command files)                                       │
│                                                                             │
│  Temp files created at runtime:                                              │
│  ├── .claude/telemetry-queue.jsonl       (queued events)                    │
│  ├── .claude/telemetry-session.json      (active session ID)                │
│  ├── .claude/tool-correlation-*.txt      (one per tool call!)               │
│  ├── .claude/pending-links.json          (unlinked commits/PRs)             │
│  └── .claude/ralph-state.json            (Ralph session state)              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AFTER: MCP-Centric, Lean Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GLOBAL INSTALL FOOTPRINT (~25 files)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ~/.claude/hooks/ (10 shell scripts — only what can't be MCP-internal)      │
│  ├── enforce-state-before-write.sh    (PreToolUse)                          │
│  ├── enforce-review-before-push.sh    (PreToolUse)                          │
│  ├── link-commit-to-ticket.sh         (PostToolUse)                         │
│  ├── spawn-next-ticket.sh             (PostToolUse)                         │
│  ├── spawn-after-pr.sh                (PostToolUse)                         │
│  ├── capture-claude-tasks.sh          (PostToolUse)                         │
│  ├── chain-extended-review.sh         (SubagentStop)                        │
│  ├── check-for-code-changes.sh        (Stop)                               │
│  ├── mark-review-completed.sh         (Stop)                               │
│  └── detect-libraries.sh              (Utility)                             │
│                                                                             │
│  ~/.claude/agents/ (EMPTY — all personas inlined into commands)              │
│                                                                             │
│  ~/.claude/skills/ (3 workflow skills — project skills stay local)           │
│  ├── brain-dump-workflow/                                                    │
│  ├── review/                                                                │
│  └── review-aggregation/                                                    │
│                                                                             │
│  ~/.claude/commands/ (9 command files — now self-contained with personas)    │
│                                                                             │
│  Temp files at runtime:                                                      │
│  └── .claude/ralph-state.json            (Ralph session state — only one!)  │
│                                                                             │
│  MCP Server (all absorbed logic lives here now):                             │
│  ├── Self-telemetry middleware           (replaces 6 hooks + 5 temp files)  │
│  ├── autoPr in workflow start-work       (replaces 1 hook)                  │
│  ├── checkUnlinkedItems() in start-work  (replaces 2 hooks + 1 temp file)  │
│  ├── State info in session responses     (replaces 1 hook)                  │
│  └── 4 MCP prompt endpoints              (universal knowledge delivery)     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Telemetry Pipeline: Before vs After

### BEFORE: External Hook Chain with Temp File Message-Passing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OLD TELEMETRY PIPELINE                               │
│                    (6 hooks, 5+ temp files per session)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SessionStart                                                               │
│  ┌──────────────────────────────────┐                                       │
│  │ start-telemetry-session.sh       │                                       │
│  │ ├─ Read .claude/ralph-state.json │                                       │
│  │ ├─ Detect active ticket          │                                       │
│  │ └─ OUTPUT: "Call telemetry       │                                       │
│  │    tool with action: start"      │◄── AI must act on this prompt         │
│  └──────────────────────────────────┘                                       │
│         │                                                                   │
│         ▼                                                                   │
│  AI calls: telemetry { action: "start", ticketId: "..." }                   │
│  MCP writes: .claude/telemetry-session.json ← { sessionId: "abc" }          │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  Every Tool Call (PreToolUse → PostToolUse)                                  │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │ log-tool-start.sh (PreToolUse)   │  │ log-tool-end.sh (PostToolUse)    │ │
│  │ ├─ Generate correlation UUID     │  │ ├─ Read correlation file          │ │
│  │ ├─ Write to temp file:           │  │ │   .claude/tool-correlation-     │ │
│  │ │   .claude/tool-correlation-    │  │ │   <hash>.txt                    │ │
│  │ │   <hash>.txt                   │  │ ├─ Calculate duration:            │ │
│  │ ├─ Append to queue:              │  │ │   end_time - start_time         │ │
│  │ │   .claude/telemetry-queue.jsonl│  │ ├─ Append to queue:               │ │
│  │ └─ Record: { tool, start_time,  │  │ │   .claude/telemetry-queue.jsonl │ │
│  │    correlationId }               │  │ └─ Record: { tool, duration,      │ │
│  └──────────────────────────────────┘  │    correlationId, success }        │ │
│                                        └──────────────────────────────────┘ │
│  UserPromptSubmit                                                           │
│  ┌──────────────────────────────────┐                                       │
│  │ log-prompt.sh                    │                                       │
│  │ └─ Append prompt to queue:       │                                       │
│  │    .claude/telemetry-queue.jsonl │                                       │
│  └──────────────────────────────────┘                                       │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  Stop (conversation ending)                                                 │
│  ┌──────────────────────────────────┐                                       │
│  │ end-telemetry-session.sh         │                                       │
│  │ ├─ Read .claude/telemetry-       │                                       │
│  │ │   session.json for sessionId   │                                       │
│  │ ├─ Flush queue from .jsonl       │                                       │
│  │ ├─ OUTPUT: "Call telemetry       │                                       │
│  │ │   tool with action: end"       │◄── AI must act on this prompt         │
│  │ ├─ Clean up temp files:          │                                       │
│  │ │   ├─ telemetry-queue.jsonl     │                                       │
│  │ │   ├─ telemetry-session.json    │                                       │
│  │ │   └─ tool-correlation-*.txt    │                                       │
│  │ └─ (multiple files per session!) │                                       │
│  └──────────────────────────────────┘                                       │
│                                                                             │
│  PROBLEMS:                                                                  │
│  • AI must manually call telemetry start/end (can forget or skip)           │
│  • Temp files for correlation IDs (one per tool call = filesystem spam)     │
│  • Queue file grows unbounded during session                                │
│  • Hooks are Claude Code specific — Cursor/VS Code can't use them           │
│  • Race conditions possible with concurrent tool calls writing same queue   │
│  • ~6 hooks firing on EVERY tool call adds latency                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AFTER: MCP Self-Instrumentation Middleware

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEW TELEMETRY PIPELINE                               │
│                  (0 hooks, 0 temp files, invisible middleware)               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MCP Server Startup                                                         │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │ instrumentServer(server, db, detectEnvironment)       │                   │
│  │ ├─ Patches McpServer.tool() to wrap every handler    │                   │
│  │ └─ Excludes "telemetry" tool from self-instrumentation│                  │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  Every Tool Call (automatic, invisible)                                      │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │         Instrumented Tool Handler Wrapper             │                   │
│  │                                                       │                   │
│  │  1. resolveSession()                                  │                   │
│  │     ├─ Check module-level cache for active session   │                   │
│  │     ├─ If no cache → read .claude/ralph-state.json   │                   │
│  │     ├─ If ticket found → check DB for open session   │                   │
│  │     ├─ If no session → auto-create one               │                   │
│  │     └─ Cache sessionId in memory (no temp file!)     │                   │
│  │                                                       │                   │
│  │  2. const correlationId = randomUUID()  ← in memory  │                   │
│  │  3. const startTime = Date.now()                      │                   │
│  │  4. Log START event → DB directly                     │                   │
│  │                                                       │                   │
│  │  5. result = await originalHandler(params)            │                   │
│  │                                                       │                   │
│  │  6. const duration = Date.now() - startTime           │                   │
│  │  7. Log END event → DB directly (with duration)       │                   │
│  │  8. return result                                     │                   │
│  │                                                       │                   │
│  │  catch(err):                                          │                   │
│  │     Log ERROR event → DB directly                     │                   │
│  │     re-throw                                          │                   │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  MCP Server Shutdown (SIGTERM/SIGINT)                                        │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │ endActiveSession(db)                                  │                   │
│  │ ├─ Read cached sessionId from memory                 │                   │
│  │ ├─ Compute final statistics                          │                   │
│  │ └─ Mark session as completed in DB                   │                   │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                             │
│  IMPROVEMENTS:                                                              │
│  • Zero temp files — all state in memory or DB                              │
│  • AI never needs to call telemetry start/end (fully automatic)             │
│  • Works in ALL environments (Cursor, VS Code, OpenCode, Codex)             │
│  • No hook latency on every tool call                                       │
│  • No race conditions (each call is self-contained)                         │
│  • Graceful shutdown ensures no orphaned sessions                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. PR Creation Flow: Before vs After

### BEFORE: PostToolUse Hook with Text Parsing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OLD PR CREATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AI calls: workflow { action: "start-work", ticketId: "abc" }               │
│         │                                                                   │
│         ▼                                                                   │
│  MCP tool returns text:                                                     │
│  "Created branch feature/abc-fix-bug. Ticket set to in_progress."           │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │ create-pr-on-ticket-start.sh (PostToolUse hook)      │                   │
│  │                                                       │                   │
│  │ 1. Parse text output with grep/sed to extract:        │                   │
│  │    ├─ Branch name (fragile regex on tool output text) │                   │
│  │    └─ Ticket ID (from tool params or output)          │                   │
│  │                                                       │                   │
│  │ 2. git add --allow-empty                              │                   │
│  │    git commit -m "WIP: start work on ticket abc"      │                   │
│  │                                                       │                   │
│  │ 3. git push -u origin feature/abc-fix-bug             │                   │
│  │         │                                             │                   │
│  │         ▼  (network call — can fail silently)          │                   │
│  │                                                       │                   │
│  │ 4. gh pr create --draft                               │                   │
│  │    --title "fix: bug description"                     │                   │
│  │    --body "Ticket: abc"                               │                   │
│  │         │                                             │                   │
│  │         ▼  (network call — can fail silently)          │                   │
│  │                                                       │                   │
│  │ 5. OUTPUT: "Link PR to ticket: call workflow          │                   │
│  │    { action: link-pr, prNumber: 42 }"                 │                   │
│  │         │                                             │                   │
│  │         ▼  AI must act on this prompt                  │                   │
│  │                                                       │                   │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                             │
│  PROBLEMS:                                                                  │
│  • Text parsing is fragile — output format change = broken hook             │
│  • Shell command interpolation risk (branch names with special chars)       │
│  • Hook errors are silent (PostToolUse can't block the AI)                  │
│  • AI must manually call link-pr after hook runs                            │
│  • Only works in Claude Code (PostToolUse hooks not universal)              │
│  • Two network calls (push + gh) that can independently fail               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AFTER: MCP-Internal autoPr Parameter

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEW PR CREATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AI calls: workflow { action: "start-work", ticketId: "abc", autoPr: true } │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────────┐                   │
│  │ MCP Tool: workflow start-work (all-in-one)            │                   │
│  │                                                       │                   │
│  │ 1. Create branch: feature/abc-fix-bug                 │                   │
│  │ 2. Set ticket status → in_progress                    │                   │
│  │ 3. Write .claude/ralph-state.json                     │                   │
│  │                                                       │                   │
│  │ 4. if (autoPr) {                                      │                   │
│  │      execFileSync("git", ["commit", "--allow-empty",  │                   │
│  │        "-m", "WIP: start work"])                       │                   │
│  │      ── safe: no shell interpolation ──               │                   │
│  │                                                       │                   │
│  │      execFileSync("git", ["push", "-u", "origin",     │                   │
│  │        branchName])                                    │                   │
│  │      ── safe: no shell interpolation ──               │                   │
│  │                                                       │                   │
│  │      execFileSync("gh", ["pr", "create", "--draft",   │                   │
│  │        "--title", ticketTitle, "--body", body])        │                   │
│  │      ── safe: no shell interpolation ──               │                   │
│  │                                                       │                   │
│  │      Link PR to ticket automatically (same process)   │                   │
│  │    }                                                  │                   │
│  │                                                       │                   │
│  │ 5. checkUnlinkedItems()                               │                   │
│  │    ── surface any unlinked commits/PRs ──             │                   │
│  │                                                       │                   │
│  │ 6. Return complete response with:                     │                   │
│  │    ├─ Branch name                                     │                   │
│  │    ├─ PR URL (if created)                             │                   │
│  │    ├─ Ticket context                                  │                   │
│  │    └─ Unlinked items warning (if any)                 │                   │
│  └──────────────────────────────────────────────────────┘                   │
│                                                                             │
│  IMPROVEMENTS:                                                              │
│  • Single atomic operation — all-or-nothing                                 │
│  • execFileSync — no shell injection possible                               │
│  • PR linked automatically (no AI action needed)                            │
│  • Errors are returned in tool response (not lost in hook stderr)           │
│  • Works in ALL environments (any MCP client)                               │
│  • No text parsing — structured data throughout                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Agent Persona Loading: Before vs After

### BEFORE: Always-Loaded Global Agent Files

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OLD AGENT PERSONA ARCHITECTURE                            │
│               (~27KB / ~10K tokens loaded into EVERY conversation)           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ~/.claude/agents/                                                           │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │ code-reviewer.md (3KB)  │  │ react-best-practices.md │                   │
│  │ • Full persona          │  │ (5KB)                   │                   │
│  │ • All review rules      │  │ • Vercel patterns       │                   │
│  │ • Output format spec    │  │ • Performance rules     │                   │
│  └─────────────────────────┘  └─────────────────────────┘                   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │ silent-failure-hunter.md│  │ cruft-detector.md (5KB) │                   │
│  │ (4KB)                   │  │ • Dead code rules       │                   │
│  │ • Error handling rules  │  │ • Comment quality rules │                   │
│  │ • Catch block analysis  │  │ • Test quality rules    │                   │
│  └─────────────────────────┘  └─────────────────────────┘                   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │ context7-library-       │  │ senior-engineer.md      │                   │
│  │ compliance.md (3KB)     │  │ (4KB)                   │                   │
│  │ • Library version check │  │ • Architecture review   │                   │
│  │ • API usage patterns    │  │ • Synthesis rules       │                   │
│  └─────────────────────────┘  └─────────────────────────┘                   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │ inception.md (6KB)      │  │ breakdown.md (5KB)      │                   │
│  │ • Interview flow        │  │ • Ticket sizing rules   │                   │
│  │ • Spec generation       │  │ • Epic structure        │                   │
│  └─────────────────────────┘  └─────────────────────────┘                   │
│                                                                             │
│         ALL OF THIS ──────────────────────────────────────┐                 │
│         LOADED INTO ──────────────────────────────────────┤                 │
│         EVERY SINGLE ─────────────────────────────────────┤                 │
│         CONVERSATION ─────────────────────────────────────┤                 │
│                                                           ▼                 │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │            Claude Code Context Window                     │               │
│  │  ┌─────────────────────────────────────────────────┐     │               │
│  │  │ System prompt + CLAUDE.md          (~5K tokens) │     │               │
│  │  ├─────────────────────────────────────────────────┤     │               │
│  │  │ Agent personas (ALWAYS loaded)    (~10K tokens) │ ◄── WASTE           │
│  │  ├─────────────────────────────────────────────────┤     │               │
│  │  │ User conversation                  (variable)   │     │               │
│  │  └─────────────────────────────────────────────────┘     │               │
│  │                                                           │               │
│  │  Even when user asks "what's the weather?" these          │               │
│  │  10K tokens of review/inception personas are loaded.      │               │
│  └──────────────────────────────────────────────────────────┘               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AFTER: On-Demand Inline Personas in Commands

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NEW AGENT PERSONA ARCHITECTURE                            │
│            (0 tokens loaded by default, on-demand only)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ~/.claude/agents/  ← EMPTY DIRECTORY (nothing loaded by default)           │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  Normal conversation:                                                        │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │            Claude Code Context Window                     │               │
│  │  ┌─────────────────────────────────────────────────┐     │               │
│  │  │ System prompt + CLAUDE.md          (~5K tokens) │     │               │
│  │  ├─────────────────────────────────────────────────┤     │               │
│  │  │ (nothing else pre-loaded!)                      │ ◄── CLEAN           │
│  │  ├─────────────────────────────────────────────────┤     │               │
│  │  │ User conversation                  (variable)   │     │               │
│  │  └─────────────────────────────────────────────────┘     │               │
│  └──────────────────────────────────────────────────────────┘               │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  When user runs /extended-review:                                            │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │  /extended-review command file                            │               │
│  │  (self-contained — personas embedded in Agent prompts)    │               │
│  │                                                           │               │
│  │  Agent(subagent_type: "Explore", model: "sonnet") ───────┤               │
│  │  ├─ prompt includes react-best-practices persona inline  │               │
│  │  ├─ prompt includes context7 compliance persona inline   │               │
│  │  ├─ prompt includes cruft-detector persona inline         │               │
│  │  └─ prompt includes senior-engineer persona inline        │               │
│  │                                                           │               │
│  │  Personas loaded ONLY into subagent context windows       │               │
│  │  Main conversation context is NOT polluted                │               │
│  └──────────────────────────────────────────────────────────┘               │
│                                                                             │
│  When user runs /inception:                                                  │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │  /inception command file                                  │               │
│  │  ├─ Full inception persona embedded directly              │               │
│  │  └─ Only loaded when /inception is invoked                │               │
│  └──────────────────────────────────────────────────────────┘               │
│                                                                             │
│  When user runs /breakdown:                                                  │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │  /breakdown command file                                  │               │
│  │  ├─ Full breakdown persona embedded directly              │               │
│  │  └─ Only loaded when /breakdown is invoked                │               │
│  └──────────────────────────────────────────────────────────┘               │
│                                                                             │
│  RESULT: ~10K tokens saved in EVERY conversation                             │
│  Personas only loaded when their specific command is invoked                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Cross-Provider Knowledge Delivery: Before vs After

### BEFORE: File Installation Per Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              OLD: Provider-Specific File Installation                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  setup-claude-code.sh copies to ~/.claude/                                   │
│  ├── hooks/ (24 scripts)                                                     │
│  ├── agents/ (9 files)                                                       │
│  ├── skills/ (8 directories)                                                 │
│  └── commands/ (9 files)                                                     │
│                                                                             │
│  setup-cursor.sh copies to ~/.cursor/                                        │
│  ├── rules/ (brain-dump-workflow.md, review rules)                           │
│  └── hooks/ (6 hooks — subset, different format)                             │
│                                                                             │
│  setup-copilot.sh copies to ~/.copilot/                                      │
│  ├── instructions/ (workflow instructions)                                   │
│  └── hooks/ (global hooks, different config format)                          │
│                                                                             │
│  Each provider needed:                                                       │
│  • Its own setup script                                                     │
│  • Its own hook configuration format                                         │
│  • Its own skill/rule/instruction format                                    │
│  • Manual re-runs when workflow changes                                      │
│                                                                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │ Claude │  │ Cursor │  │Copilot │  │  VS    │  │OpenCode│               │
│  │  Code  │  │        │  │  CLI   │  │  Code  │  │        │               │
│  ├────────┤  ├────────┤  ├────────┤  ├────────┤  ├────────┤               │
│  │24 hooks│  │6 hooks │  │6 hooks │  │  N/A   │  │  N/A   │               │
│  │9 agents│  │ rules  │  │instruct│  │        │  │        │               │
│  │8 skills│  │        │  │        │  │        │  │        │               │
│  │9 cmds  │  │        │  │        │  │        │  │        │               │
│  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘               │
│       │           │           │           │           │                     │
│       └───────────┴───────────┴─────┬─────┴───────────┘                     │
│                                     │                                       │
│                              ┌──────┴──────┐                                │
│                              │  SQLite DB  │                                │
│                              │  (shared)   │                                │
│                              └─────────────┘                                │
│                                                                             │
│  PROBLEM: N providers × M assets = N×M files to maintain                    │
│  Workflow knowledge duplicated across provider-specific formats              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AFTER: MCP-Centric Universal Delivery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              NEW: MCP as Universal Knowledge + Logic Layer                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │ Claude │  │ Cursor │  │Copilot │  │  VS    │  │OpenCode│               │
│  │  Code  │  │        │  │  CLI   │  │  Code  │  │        │               │
│  ├────────┤  ├────────┤  ├────────┤  ├────────┤  ├────────┤               │
│  │10 hooks│  │1 hook  │  │        │  │        │  │        │               │
│  │3 skills│  │1 rule  │  │        │  │        │  │        │               │
│  │9 cmds  │  │        │  │        │  │        │  │        │               │
│  │(local) │  │(local) │  │(none!) │  │(none!) │  │(none!) │               │
│  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘               │
│       │           │           │           │           │                     │
│       └───────────┴───────────┴─────┬─────┴───────────┘                     │
│                                     │ MCP Protocol                          │
│                              ┌──────┴──────┐                                │
│                              │  MCP Server │                                │
│                              │             │                                │
│                              │ ┌─────────┐ │                                │
│                              │ │ 9 Tools │ │ ← workflow, ticket, session... │
│                              │ └─────────┘ │                                │
│                              │ ┌─────────┐ │                                │
│                              │ │4 Prompts│ │ ← workflow, code-review,       │
│                              │ │         │ │   silent-failure, simplifier   │
│                              │ └─────────┘ │                                │
│                              │ ┌─────────┐ │                                │
│                              │ │  Self-  │ │ ← auto telemetry, autoPr,     │
│                              │ │Telemetry│ │   pending-link checks         │
│                              │ └─────────┘ │                                │
│                              │             │                                │
│                              └──────┬──────┘                                │
│                                     │                                       │
│                              ┌──────┴──────┐                                │
│                              │  SQLite DB  │                                │
│                              └─────────────┘                                │
│                                                                             │
│  RESULT: MCP config entry is the ONLY required per-provider touch           │
│  All workflow knowledge delivered via MCP prompts (universal protocol)       │
│  All automation logic runs inside MCP (no hooks needed)                     │
│  Provider-specific files only for things that MUST be local                 │
│  (Claude Code hooks for PreToolUse blocking — only capability unique to it) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Complete Hook Inventory: Before vs After

### BEFORE: 24 Hooks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OLD HOOK INVENTORY (24)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TELEMETRY (6 hooks) ──────────────────────────────── REMOVED               │
│  ├── start-telemetry-session.sh        SessionStart     │                   │
│  ├── end-telemetry-session.sh          Stop              │ → MCP self-      │
│  ├── log-tool-start.sh                 PreToolUse        │   telemetry      │
│  ├── log-tool-end.sh                   PostToolUse       │   middleware     │
│  ├── log-tool-failure.sh               PostToolUseFailure│                   │
│  └── log-prompt.sh                     UserPromptSubmit  │                   │
│                                                                             │
│  TELEMETRY VARIANTS (3 hooks) ─────────────────────── REMOVED               │
│  ├── log-prompt-telemetry.sh           UserPromptSubmit  │                   │
│  ├── log-tool-telemetry.sh             Pre/PostToolUse   │ → Consolidated   │
│  └── merge-telemetry-hooks.sh          Utility           │   into above     │
│                                                                             │
│  STATE RECORDING (2 hooks) ────────────────────────── REMOVED               │
│  ├── record-state-change.sh            PostToolUse       │ → MCP session    │
│  └── enforce-session-before-work.sh    PreToolUse        │   response       │
│                                                                             │
│  PR CREATION (1 hook) ─────────────────────────────── REMOVED               │
│  └── create-pr-on-ticket-start.sh      PostToolUse       │ → autoPr param  │
│                                                                             │
│  PENDING LINKS (2 hooks) ──────────────────────────── REMOVED               │
│  ├── check-pending-links.sh            SessionStart      │ → checkUnlinked │
│  └── clear-pending-links.sh            Utility           │   Items()       │
│                                                                             │
│  ─────────────────────────────────────────────────────────                   │
│  14 HOOKS REMOVED (absorbed into MCP server)                                │
│  ─────────────────────────────────────────────────────────                   │
│                                                                             │
│  ENFORCEMENT (2 hooks) ────────────────────────────── KEPT                  │
│  ├── enforce-state-before-write.sh     PreToolUse        │ Must be local:   │
│  └── enforce-review-before-push.sh     PreToolUse        │ blocks tool use  │
│                                                                             │
│  GIT TRACKING (1 hook) ────────────────────────────── KEPT                  │
│  └── link-commit-to-ticket.sh          PostToolUse       │ Post-commit msg  │
│                                                                             │
│  SPAWN (2 hooks) ──────────────────────────────────── KEPT                  │
│  ├── spawn-next-ticket.sh              PostToolUse       │ Terminal spawn   │
│  └── spawn-after-pr.sh                 PostToolUse       │ (env-gated)     │
│                                                                             │
│  TASK SYNC (1 hook) ───────────────────────────────── KEPT                  │
│  └── capture-claude-tasks.sh           PostToolUse       │ TodoWrite → DB   │
│                                                                             │
│  REVIEW CHAIN (2 hooks) ───────────────────────────── KEPT                  │
│  ├── chain-extended-review.sh          SubagentStop      │ Review pipeline  │
│  └── check-for-code-changes.sh         Stop              │ Review reminder  │
│                                                                             │
│  REVIEW MARKER (1 hook) ───────────────────────────── KEPT                  │
│  └── mark-review-completed.sh          Stop              │ .review-completed│
│                                                                             │
│  UTILITY (1 hook) ─────────────────────────────────── KEPT                  │
│  └── detect-libraries.sh              Utility            │ context7 helper  │
│                                                                             │
│  ─────────────────────────────────────────────────────────                   │
│  10 HOOKS REMAINING (require local execution / can't be MCP)                │
│  ─────────────────────────────────────────────────────────                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. The Failed Workflow-Pack Attempt

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW-PACK: ATTEMPTED & REVERTED                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GOAL: Package ALL remaining workflow assets into a single                   │
│  self-contained, versionable, installable pack.                             │
│                                                                             │
│  workflow-pack/                                                              │
│  ├── manifest.json         ← SHA256 checksums for every file                │
│  ├── install-receipt.json  ← track what was installed where                 │
│  │                                                                          │
│  ├── providers/                                                              │
│  │   ├── claude/                                                             │
│  │   │   ├── adapter.sh    ← install hooks into ~/.claude/settings.json     │
│  │   │   └── hooks.json    ← hook config in Claude format                   │
│  │   ├── cursor/                                                             │
│  │   │   ├── adapter.sh    ← install rules into ~/.cursor/                  │
│  │   │   └── plugin.json   ← Cursor plugin format                          │
│  │   ├── copilot/                                                            │
│  │   │   └── adapter.sh                                                      │
│  │   └── vscode/                                                             │
│  │       └── adapter.sh                                                      │
│  │                                                                          │
│  ├── hooks/                ← all 10 remaining hooks                          │
│  │   ├── enforce-state-before-write.sh                                       │
│  │   ├── enforce-review-before-push.sh                                       │
│  │   └── ... (8 more)                                                        │
│  │                                                                          │
│  ├── agents/               ← agent persona files                             │
│  │   └── (moved here from ~/.claude/agents/)                                 │
│  │                                                                          │
│  ├── commands/             ← all 9 commands                                  │
│  │   ├── breakdown.md                                                        │
│  │   └── ... (8 more)                                                        │
│  │                                                                          │
│  └── skills/               ← all skills                                      │
│      ├── brain-dump-workflow/                                                 │
│      └── ... (more)                                                          │
│                                                                             │
│  Ownership markers added to every file:                                      │
│  ---                                                                         │
│  owner: brain-dump-workflow-pack@1.0.0                                       │
│  ---                                                                         │
│                                                                             │
│  ═══════════════════════════════════════════════════════════                 │
│                                                                             │
│  WHY IT WAS REVERTED:                                                        │
│                                                                             │
│  The 3 commits were reverted immediately. The subsequent work took a         │
│  more conservative approach:                                                 │
│  • Instead of building the pack infrastructure → just clean up what          │
│    the MCP absorption already made unnecessary                               │
│  • Remove absorbed hooks, inline agents, trim global skills                 │
│  • The pack infrastructure (manifest checksums, provider adapters,          │
│    install receipts) remains as future work in the plan                     │
│                                                                             │
│  The plan (plans/simplify-bd-workflow.md) describes this as Phase 2-5,       │
│  while Phase 1 (MCP absorption) is what actually shipped.                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Setup Script Footprint: Before vs After

### BEFORE

```
setup-claude-code.sh installed:
├── 24 hook scripts       → ~/.claude/hooks/
├── 9 agent personas      → ~/.claude/agents/
├── 8 skill directories   → ~/.claude/skills/
├── 9 command files        → ~/.claude/commands/
├── settings.json patches → ~/.claude/settings.json (24 hook entries)
└── Total: ~50+ files, ~150KB, ~10K tokens always in context
```

### AFTER

```
setup-claude-code.sh installs:
├── 10 hook scripts       → ~/.claude/hooks/        (14 removed)
├── 0 agent personas      → (none — dir empty)      (9 removed)
├── 3 skill directories   → ~/.claude/skills/       (5 made local-only)
├── 9 command files        → ~/.claude/commands/     (now self-contained)
├── settings.json patches → ~/.claude/settings.json (10 hook entries)
├── Cleanup: removes old hooks/agents/skills from prior installs
└── Total: ~22 files, ~80KB, ~0 extra tokens in context
```

---

## 9. Data Flow Summary: Before vs After

### BEFORE: Hub-and-Spoke Through Filesystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────┐                                                               │
│  │ Claude   │                                                               │
│  │ Code     │                                                               │
│  └────┬─────┘                                                               │
│       │                                                                     │
│       ├──── PreToolUse ────► hook reads ralph-state.json                     │
│       │                      hook reads telemetry-session.json               │
│       │                      hook writes tool-correlation-*.txt             │
│       │                      hook writes telemetry-queue.jsonl              │
│       │                                                                     │
│       ├──── PostToolUse ───► hook reads tool-correlation-*.txt              │
│       │                      hook writes telemetry-queue.jsonl              │
│       │                      hook reads MCP output text (fragile!)           │
│       │                      hook runs git/gh commands                       │
│       │                      hook writes pending-links.json                 │
│       │                                                                     │
│       ├──── SessionStart ──► hook reads pending-links.json                  │
│       │                      hook reads ralph-state.json                     │
│       │                      hook prompts AI (text output)                  │
│       │                                                                     │
│       ├──── Stop ──────────► hook reads telemetry-queue.jsonl               │
│       │                      hook reads telemetry-session.json              │
│       │                      hook deletes temp files                        │
│       │                      hook prompts AI (text output)                  │
│       │                                                                     │
│       └──── MCP call ──────► MCP server ──► SQLite DB                       │
│                                                                             │
│  Temp files used as inter-hook communication:                                │
│  .claude/ralph-state.json          (session state)                           │
│  .claude/telemetry-session.json    (telemetry session ID)                   │
│  .claude/telemetry-queue.jsonl     (event queue)                             │
│  .claude/tool-correlation-*.txt    (one per tool call!)                      │
│  .claude/pending-links.json        (unlinked commits/PRs)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AFTER: Direct MCP Communication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌──────────┐                                                               │
│  │ Any AI   │ (Claude Code, Cursor, VS Code, OpenCode, Copilot)             │
│  │ Client   │                                                               │
│  └────┬─────┘                                                               │
│       │                                                                     │
│       ├──── PreToolUse ────► 2 enforcement hooks read ralph-state.json      │
│       │                      (Claude Code only — blocks Write/Push)          │
│       │                                                                     │
│       ├──── PostToolUse ───► 4 utility hooks                                │
│       │                      (link-commit, spawn, capture-tasks)             │
│       │                                                                     │
│       ├──── SubagentStop ──► 1 review chain hook                            │
│       │                                                                     │
│       ├──── Stop ──────────► 2 review reminder/marker hooks                 │
│       │                                                                     │
│       └──── MCP call ──────► MCP server                                     │
│                              ├── Tool handler                               │
│                              ├── Self-telemetry middleware (automatic)       │
│                              │   ├── correlationId (in memory)              │
│                              │   ├── duration tracking (in memory)          │
│                              │   └── session auto-create (in memory + DB)   │
│                              ├── autoPr logic (in start-work)               │
│                              ├── checkUnlinkedItems (in start-work)         │
│                              └──► SQLite DB                                 │
│                                                                             │
│  Temp files:                                                                 │
│  .claude/ralph-state.json    (session state — the ONLY temp file)           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Quantified Impact

| Metric                         | Before                   | After                         | Change        |
| ------------------------------ | ------------------------ | ----------------------------- | ------------- |
| Global hook scripts            | 24                       | 10                            | **-58%**      |
| Global agent files             | 9                        | 0                             | **-100%**     |
| Global skill dirs              | 8                        | 3                             | **-63%**      |
| Temp files at runtime          | 5+ types                 | 1                             | **-80%**      |
| Context tokens (always loaded) | ~10K+                    | ~0                            | **-100%**     |
| Hook events per tool call      | ~3 (pre+post+telemetry)  | ~1 (pre only, if enforcement) | **-67%**      |
| Provider-specific setup needed | Full (per provider)      | MCP config only               | **Universal** |
| AI manual actions required     | 2+ (telemetry start/end) | 0                             | **-100%**     |
| Cross-provider parity          | Partial (hooks vary)     | Full (MCP is universal)       | **Complete**  |
