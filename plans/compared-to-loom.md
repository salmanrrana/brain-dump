# Brain Dump vs Loom: Analysis & Recommendations

> **Date**: January 2026
> **Purpose**: Document the differences between Brain Dump's Ralph system and Loom's agent architecture, with actionable recommendations adapted for our subscription-based Claude Code model.

---

## Table of Contents

1. [Architectural Difference: API vs Subscription](#architectural-difference-api-vs-subscription)
2. [What Makes Loom's Specs Effective](#what-makes-looms-specs-effective)
3. [Visual Comparisons](#visual-comparisons)
4. [Recommendations by Applicability](#recommendations-by-applicability)
5. [Implementation Priority Matrix](#implementation-priority-matrix)
6. [Our Unique Advantages](#our-unique-advantages)
7. [Action Items](#action-items)
8. [Epic 6 Alignment Review](#epic-6-alignment-review) ← **Current work tracking**

---

## Architectural Difference: API vs Subscription

### Loom (Direct API Access)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOOM'S ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   const response = await anthropic.messages.create({            │
│     model: 'claude-sonnet-4-...',                               │
│     system: "You are...",        ← FULL CONTROL                 │
│     messages: [...],             ← FULL HISTORY                 │
│     tools: [...],                ← CUSTOM TOOLS                 │
│     stream: true                 ← TOKEN BY TOKEN               │
│   });                                                           │
│                                                                 │
│   Capabilities:                                                 │
│   ✅ Intercept every tool call before/after execution           │
│   ✅ Inject messages mid-conversation                           │
│   ✅ Capture full transcript (structured JSON)                  │
│   ✅ Use Haiku for cheap side-tasks (commit messages)           │
│   ✅ Implement state machine in code                            │
│   ✅ Custom retry logic around each API call                    │
│   ✅ Stream tokens to UI in real-time                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Brain Dump (Subscription/CLI)

```
┌─────────────────────────────────────────────────────────────────┐
│                 BRAIN DUMP'S ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   # ralph.sh                                                    │
│   OUTPUT=$(claude -p "You are Ralph...")                        │
│                     ↑                                           │
│            Black box - we get text out                          │
│                                                                 │
│   What we CAN'T do:                                             │
│   ❌ Intercept tool calls (Claude Code handles internally)      │
│   ❌ Inject messages mid-conversation                           │
│   ❌ Get structured transcript (just stdout text)               │
│   ❌ Use different models for different tasks                   │
│   ❌ Implement state machine in OUR code                        │
│   ❌ Custom retry around Claude's internal API calls            │
│                                                                 │
│   What we CAN do:                                               │
│   ✅ Control the PROMPT that goes in                            │
│   ✅ Use MCP servers for custom tools                           │
│   ✅ Use Claude Code HOOKS (PreToolUse, PostToolUse, etc.)      │
│   ✅ Parse stdout for specific markers                          │
│   ✅ Use CLAUDE.md for persistent instructions                  │
│   ✅ Multiple iterations (loop in ralph.sh)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight

The fundamental difference: **Loom controls the agent loop, we control the agent instructions.**

This means our leverage points are:

1. **CLAUDE.md** - Persistent instructions Claude Code always reads
2. **MCP Tools** - Custom tools Claude can call
3. **Hooks** - Scripts that run on events (PreToolUse, PostToolUse, etc.)
4. **Prompt Quality** - What we pass to `claude -p`
5. **Spec Quality** - What Claude reads to understand tasks

---

## What Makes Loom's Specs Effective

### The Six-Layer Structure

Loom specs follow a consistent hierarchical pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. OVERVIEW (2-3 paragraphs)                                    │
│    - What is this? Why does it exist?                           │
├─────────────────────────────────────────────────────────────────┤
│ 2. REFERENCE TABLES                                             │
│    - Enums, states, events in tabular format                    │
│    - Quick lookup, complete coverage                            │
├─────────────────────────────────────────────────────────────────┤
│ 3. TYPE DEFINITIONS (with code)                                 │
│    - Full trait/interface signatures                            │
│    - Every method, every field documented                       │
├─────────────────────────────────────────────────────────────────┤
│ 4. STATE MACHINE (if applicable)                                │
│    - Explicit states and transitions                            │
│    - Mermaid diagrams for visualization                         │
├─────────────────────────────────────────────────────────────────┤
│ 5. DESIGN DECISIONS                                             │
│    - "Why X vs Y" with numbered rationale                       │
│    - Trade-offs explicitly stated                               │
├─────────────────────────────────────────────────────────────────┤
│ 6. IMPLEMENTATION GUIDE                                         │
│    - Step-by-step with code templates                           │
│    - Extension/integration patterns                             │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Modal Documentation

Loom uses different formats for different purposes:

| Format       | Purpose                | Example                              |
| ------------ | ---------------------- | ------------------------------------ |
| **Prose**    | Concepts, motivation   | "Retry logic is critical because..." |
| **Tables**   | Quick reference lookup | Config fields with defaults          |
| **Code**     | API contracts          | Full function signatures             |
| **Mermaid**  | Visual flows           | State machine diagrams               |
| **Examples** | Usage patterns         | Copy-paste ready code                |

### Explicit Design Decisions

Every spec includes "Why X vs Y" sections:

```markdown
### Why a Separate Crate?

1. Reusability: Both Anthropic and OpenAI clients share it
2. Testability: Can unit test in isolation
3. Single responsibility: HTTP retry ≠ API-specific logic

### Why NOT tower-retry or backoff?

1. Simplicity: Our needs are specific
2. Control: Custom logging and error classification
3. Minimal dependencies: Smaller binary
```

### Complete API Surface

Every method, every field documented:

```typescript
interface Tool {
  /** Unique identifier used by LLM to invoke this tool */
  name(): string;

  /** Human-readable description shown in tool registry */
  description(): string;

  /** JSON Schema defining valid input parameters */
  inputSchema(): JsonSchema;

  /** Execute with validated args and workspace context */
  invoke(args: ToolArgs, context: ToolContext): Promise<ToolResult>;
}
```

### The Core Principle

> **"Explicit over Implicit"**: Every decision that could be made is made upfront, documented, and explained. Claude becomes an executor of a well-defined plan rather than an improviser working from vague requirements.

---

## Visual Comparisons

### Example: Retry Strategy

#### Our PRD Item (~60 lines)

```
┌─────────────────────────────────────────────────────────────────┐
│ ## Context                                                      │
│ "Inspired by Loom's retry strategy..."                          │
│                                                                 │
│ ## Problem                                                      │
│ "Brain Dump's API calls don't have sophisticated retry..."      │
│                                                                 │
│ ## Implementation                                               │
│ interface RetryConfig { ... }   ← Partial type                  │
│ async function withRetry()      ← No full signature             │
│                                                                 │
│ ## Backoff Formula                                              │
│ delay = min(baseDelay * ...)    ← Math only, no table           │
│                                                                 │
│ ## Why Jitter?                                                  │
│ "Prevents thundering herd..."   ← One sentence                  │
│                                                                 │
│ ## Acceptance Criteria                                          │
│ - [ ] withRetry() wrapper works                                 │
│ - [ ] Jitter spreads retries                                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Loom's Spec (~300 lines)

```
┌─────────────────────────────────────────────────────────────────┐
│ ## Overview                                                     │
│ WHY it exists, not just WHAT it does                            │
├─────────────────────────────────────────────────────────────────┤
│ ## RetryConfig Structure                                        │
│ ┌──────────────────┬───────────┬─────────────────────────────┐  │
│ │ Field            │ Default   │ Description                 │  │
│ ├──────────────────┼───────────┼─────────────────────────────┤  │
│ │ max_attempts     │ 3         │ Max attempts before fail    │  │
│ │ base_delay       │ 200ms     │ Initial delay               │  │
│ │ max_delay        │ 5s        │ Maximum delay (cap)         │  │
│ │ backoff_factor   │ 2.0       │ Exponential multiplier      │  │
│ │ jitter           │ true      │ Add randomness?             │  │
│ └──────────────────┴───────────┴─────────────────────────────┘  │
│ Reference: crates/loom-http/src/retry.rs#L6-L32                 │
├─────────────────────────────────────────────────────────────────┤
│ ## Exponential Backoff (with table)                             │
│ ┌─────────┬─────────────────┬─────────────────┐                 │
│ │ Attempt │ Calculation     │ Delay           │                 │
│ ├─────────┼─────────────────┼─────────────────┤                 │
│ │ 0       │ 200ms × 2^0     │ 200ms           │                 │
│ │ 1       │ 200ms × 2^1     │ 400ms           │                 │
│ │ ...     │ ...             │ ...             │                 │
│ └─────────┴─────────────────┴─────────────────┘                 │
├─────────────────────────────────────────────────────────────────┤
│ ## RetryableError Trait (COMPLETE CODE)                         │
│ Full implementation, not just signature                         │
├─────────────────────────────────────────────────────────────────┤
│ ## Retryable vs Non-Retryable (with reasons)                    │
│ ┌──────┬───────────────────────┬────────────────────────────┐   │
│ │ Code │ Name                  │ Reason                     │   │
│ ├──────┼───────────────────────┼────────────────────────────┤   │
│ │ 429  │ Too Many Requests     │ Rate limit will reset      │   │
│ │ 400  │ Bad Request           │ Won't change (DON'T retry) │   │
│ └──────┴───────────────────────┴────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ ## Design Decisions                                             │
│ • Why separate crate (4 numbered reasons)                       │
│ • Why not tower-retry (4 numbered reasons)                      │
│ • Why jitter (with ASCII thundering herd diagram)               │
├─────────────────────────────────────────────────────────────────┤
│ ## Usage Examples                                               │
│ Complete copy-paste code for Anthropic and OpenAI clients       │
└─────────────────────────────────────────────────────────────────┘
```

#### Information Density Comparison

| Metric           | Our Spec   | Loom's Spec |
| ---------------- | ---------- | ----------- |
| Lines            | ~60        | ~300        |
| Types defined    | 1 partial  | 3 complete  |
| Tables           | 0          | 4           |
| Code examples    | 1 partial  | 6 complete  |
| Design decisions | 1 sentence | 3 sections  |
| Visuals          | 0          | 2           |
| Code references  | 0          | 5           |

### The Gap

```
┌─────────────────────────────────────────────────────────────────┐
│ WHAT CLAUDE MUST FIGURE OUT WITH OUR SPEC:                      │
├─────────────────────────────────────────────────────────────────┤
│ ❓ What's the full type signature of withRetry?                 │
│ ❓ What error types should be retryable?                        │
│ ❓ Should 500 be retried? (Not listed)                          │
│ ❓ What about connection errors? Timeouts?                      │
│ ❓ How do I log retry attempts?                                 │
│ ❓ Should I make this a separate module?                        │
│ ❓ How do I use it with different providers?                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ WHAT CLAUDE MUST FIGURE OUT WITH LOOM'S SPEC:                   │
├─────────────────────────────────────────────────────────────────┤
│ ✅ Nothing. Every question is answered.                         │
│    Just implement what's written.                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Recommendations by Applicability

### ✅ Fully Applicable (Do These)

These work regardless of API vs subscription:

#### 1. Hierarchical Spec Structure

Create specs with consistent sections: Overview → Types → State Machine → Design Decisions → Implementation Guide.

#### 2. Complete Type Definitions

Document every field, every method, every parameter. Don't leave Claude to invent them.

#### 3. Design Decision Records

Document "Why X vs Y" for architectural choices. Prevents Claude from second-guessing.

#### 4. Multi-Modal Documentation

Use tables for reference, code for contracts, diagrams for flows, prose for concepts.

#### 5. DO/DON'T Tables in CLAUDE.md

Loom's Svelte 5 table is brilliant:

```markdown
### Database Queries

| ✅ DO                     | ❌ DON'T            |
| ------------------------- | ------------------- |
| Use Drizzle ORM           | Raw SQL strings     |
| db.select().from(tickets) | db.run("SELECT...") |
```

#### 6. Verification Steps

Like Loom's deployment verification:

```markdown
After implementing a feature:

1. Run pnpm type-check (must pass)
2. Run pnpm lint (must pass)
3. Run pnpm test (must pass)
4. If UI change, manually verify in browser
```

### ⚠️ Partially Applicable (Adapt These)

#### 7. State Machine for Ralph

**Loom's approach**: Control the loop in code, track state programmatically.

**Our adaptation**: Use MCP tools as state transitions:

```typescript
// Add to MCP server
update_ticket_state(ticketId, state: 'analyzing' | 'implementing' | 'testing')
```

Then in Ralph's prompt:

```
After reading the spec, call update_ticket_state('analyzing')
Before writing code, call update_ticket_state('implementing')
Before running tests, call update_ticket_state('testing')
```

#### 8. Session Transcripts (Ticket 6.3)

**Loom's approach**: Serialize message array (they have it as JSON).

**Our adaptation**: Use MCP tools for logging:

```typescript
// Add to MCP server
log_thinking(sessionId, content: string)
log_action(sessionId, action: string, details: object)
```

Instruct Ralph to call these, creating a structured log without parsing stdout.

#### 9. PostToolsHook Pattern

**Loom's approach**: Run Haiku after tool execution.

**Our adaptation**: Use Claude Code hooks:

```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool": "Write" },
        "command": "./scripts/maybe-commit.sh"
      }
    ]
  }
}
```

### ❌ Not Directly Applicable (API-Only)

These require direct API access:

| Feature                     | Why Not Applicable                   |
| --------------------------- | ------------------------------------ |
| Switch models mid-session   | Can't call Haiku for commits         |
| Programmatic state machine  | Can't control Claude's internal loop |
| Token-level streaming       | Claude Code handles internally       |
| Intercept/modify tool calls | Claude Code handles internally       |
| Custom retry around API     | Claude Code handles internally       |

---

## Implementation Priority Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    EFFORT vs IMPACT MATRIX                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HIGH IMPACT, LOW EFFORT (DO FIRST)                             │
│  ─────────────────────────────────────                          │
│  □ Add DO/DON'T tables to CLAUDE.md                             │
│  □ Add verification steps to CLAUDE.md                          │
│  □ Create plans/spec-template.md                                │
│  □ Add Design Decisions sections to existing specs              │
│  □ Use tables + code + visuals in specs                         │
│                                                                 │
│  HIGH IMPACT, MEDIUM EFFORT                                     │
│  ─────────────────────────────────────                          │
│  □ Split prd.json into separate spec files                      │
│  □ Upgrade Ralph prompt with detailed instructions              │
│  □ Add MCP tools for state tracking                             │
│                                                                 │
│  MEDIUM IMPACT, HIGHER EFFORT                                   │
│  ─────────────────────────────────────                          │
│  □ Session transcripts via MCP logging                          │
│  □ Claude Code hooks for automation                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Our Unique Advantages

Things we have that Loom had to build:

### 1. Claude Code's Built-in Tools

- Read, Write, Edit, Bash, Glob, Grep, WebFetch, etc.
- Battle-tested, maintained by Anthropic
- Loom built all of these from scratch

### 2. MCP Protocol

- brain-dump MCP server is powerful
- Custom tools without building an agent framework
- Easier to extend than Loom's tightly-coupled tools

### 3. Simpler Architecture

- No Rust, no async complexity, no crate management
- Node.js + SQLite is easier to extend
- Lower barrier to adding features

### 4. Subscription Benefits

- No API costs to worry about
- Claude Code improvements come free
- Extended thinking, new tools automatically available

### 5. Existing Infrastructure

- TanStack Start (React 19 + Vite + Nitro)
- Drizzle ORM with migrations
- Full-text search via FTS5
- Docker sandbox mode

---

## Action Items

### Immediate (This Week)

- [ ] Add DO/DON'T tables to CLAUDE.md
- [ ] Add verification checklist to CLAUDE.md
- [ ] Create `plans/spec-template.md`
- [ ] Convert one ticket to full spec format (as template)

### Short-term (This Month)

- [ ] Upgrade Ralph prompt with detailed instructions
- [ ] Split remaining PRD items into separate specs
- [ ] Add Design Decisions to all specs

### Medium-term (Next Month)

- [ ] Add MCP tools for state tracking
- [ ] Implement session logging via MCP
- [ ] Explore Claude Code hooks

---

## References

- **Loom Repository**: https://github.com/ghuntley/loom
- **Loom Specs**: https://github.com/ghuntley/loom/tree/trunk/specs
- **Loom AGENTS.md**: https://github.com/ghuntley/loom/blob/trunk/AGENTS.md
- **Claude Code Hooks**: Check Claude Code documentation for hook configuration

---

## Appendix: Loom's AGENTS.md Structure

For reference, Loom's AGENTS.md includes:

1. **Specifications** - How to use specs (assume not implemented, check code first)
2. **Commands** - Exact build/test commands (Nix and Cargo)
3. **Deployment** - How trunk pushes auto-deploy
4. **Database Migrations** - Location, naming, rebuild requirements
5. **Local Testing** - Commands for local verification
6. **Weaver Troubleshooting** - K8s debugging commands
7. **Architecture** - Crate overview, routing rules
8. **Svelte 5** - DO/DON'T table for framework patterns
9. **Code Style** - Formatting, errors, async, imports, naming
10. **Internationalization** - String naming conventions
11. **Design Principle** - When to create shared services

This structure is worth emulating in our CLAUDE.md.

---

## Epic 6 Alignment Review

> **Last Reviewed**: January 16, 2026
> **Epic**: 6. Loom-Inspired Infrastructure Improvements

This section tracks which tickets in Epic 6 align with our subscription-based architecture and which need adjustment.

### Key Decision: Hooks as Guides, Not Just Gatekeepers

A critical insight from our architecture review: **Claude Code hooks can guide behavior, not just block it.**

When a hook blocks an action and returns a message, Claude sees that message and responds to it. This enables "enforcing" behavior through feedback loops:

```
┌─────────────────────────────────────────────────────────────────┐
│              HOOKS AS GUIDES (not just gatekeepers)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Claude: "I'll write the file now"                             │
│              │                                                  │
│              ▼                                                  │
│   PreToolUse Hook: "BLOCKED - You haven't called                │
│   update_session_state('implementing') yet. You MUST call       │
│   that tool FIRST, then retry this Write operation."            │
│              │                                                  │
│              ▼                                                  │
│   Claude: "Got it, I need to call update_session_state first"   │
│   *calls update_session_state('implementing')*                  │
│   *then retries the Write*                                      │
│                                                                 │
│   Result: Agent is GUIDED to correct behavior                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

This approach gives us **enforcement through feedback** rather than just prevention, bridging the gap between API-level control and prompt-only guidance.

### Alignment Summary

| Ticket | Title               | Status            | Alignment        | Notes                                     |
| ------ | ------------------- | ----------------- | ---------------- | ----------------------------------------- |
| 6.1    | Secret redaction    | ✅ Done           | ✅ Good          | Pure infrastructure, no API needed        |
| 6.2    | SSE streaming       | ✅ **Superseded** | ✅ Resolved      | Replaced by 7.7 MCP Event Emission        |
| 6.3    | Session persistence | ✅ Done           | ✅ **Excellent** | Uses MCP tools correctly                  |
| 6.4    | Retry strategy      | ✅ Done           | ✅ Good          | Pure infrastructure                       |
| 6.5    | Error hierarchy     | ✅ Done           | ✅ Good          | Pure infrastructure                       |
| 6.6    | Git metadata        | ✅ Done           | ✅ **Excellent** | Auto-captures via git commands            |
| 6.7    | PostToolsHook       | ✅ **Closed**     | ❌ Incompatible  | Requires API - architecturally impossible |
| 6.8    | Property testing    | ✅ Done           | ✅ Good          | Pure testing infrastructure               |
| 6.9    | Layered config      | ✅ Done           | ✅ Good          | Pure infrastructure                       |
| 6.10   | State machine       | ✅ **Superseded** | ✅ Resolved      | Replaced by 7.11 + 7.13                   |
| 6.11   | Diátaxis docs       | ✅ Done           | ✅ Good          | Documentation only                        |
| 6.12   | Health check        | ✅ Done           | ✅ Good          | Pure infrastructure                       |
| 6.13   | Embedded Ralph UI   | ✅ **Superseded** | ✅ Resolved      | See "6.13 Resolution" below               |

### What Worked Well

#### 6.3 Session Persistence - The Correct Pattern

Our implementation uses MCP tools for Claude to log its own actions:

```
┌─────────────────────────────────────────────────────────────────┐
│ THE MCP-BASED PATTERN (subscription-compatible)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Claude Code                    MCP Server                     │
│   ┌─────────┐                   ┌─────────────┐                 │
│   │  Ralph  │ ── calls ──────>  │ MCP Tools   │                 │
│   │         │    MCP tools      │             │                 │
│   │         │                   │ • create_   │                 │
│   │         │ <── returns ────  │   session   │                 │
│   │         │    structured     │ • add_      │                 │
│   │         │    data           │   message   │                 │
│   └─────────┘                   │ • complete_ │                 │
│                                 │   session   │                 │
│                                 └─────────────┘                 │
│                                                                 │
│   ✅ Reliable, stable, under our control                        │
│   ✅ Works with subscription model                              │
│   ✅ Structured data, not stdout parsing                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

This pattern should be applied to other tickets that need runtime data.

### Tickets Requiring Changes

#### 6.2 SSE Streaming - Needs Rework

**Current spec relies on:**

```
Parse Claude CLI output to extract:
- Text responses (`event: text`)
- Tool calls (`event: tool`)
- File changes (`event: file`)
```

**Problem**: Claude CLI output format is not stable. Could break with any update.

**Recommended fix**: Use MCP event emission instead:

```typescript
// Add new MCP tool
server.tool("emit_ralph_event", {
  sessionId: string,
  event: {
    type: "thinking" | "tool_start" | "tool_end" | "file_change" | "progress",
    data: object,
  },
});
```

Instruct Ralph to call `emit_ralph_event` at key points. SSE endpoint reads from session events, not stdout.

---

#### 6.7 PostToolsHook with Haiku - INCOMPATIBLE

**Current spec requires:**

```typescript
// THIS REQUIRES API ACCESS - NOT POSSIBLE WITH SUBSCRIPTION
const response = await anthropic.messages.create({
  model: 'claude-3-haiku-20240307',
  ...
});
```

**Options:**

| Option            | Description                          | Recommendation |
| ----------------- | ------------------------------------ | -------------- |
| Remove            | Acknowledge not achievable           | ❌ Loses value |
| Claude Code Hooks | Use hooks without AI commit messages | ✅ Recommended |
| Defer             | Mark as [FUTURE: Requires API]       | ⚠️ Acceptable  |

**Recommended adaptation**: Use Claude Code hooks for auto-commit without AI-generated messages:

```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": "Edit" },
        "command": "./scripts/post-edit-hook.sh"
      }
    ]
  }
}
```

The hook script can:

- Auto-commit with template messages (e.g., `chore: auto-commit after edit`)
- Update progress.txt
- Emit events to UI

**What we lose**: AI-generated commit messages
**What we keep**: Auto-commit without polluting Claude's context

---

#### 6.10 State Machine - Needs Adaptation

**Current spec assumes:**

```typescript
// This implies WE control when transitions happen
function transition(state: RalphState, event: RalphEvent): RalphState {
  switch (state.type) {
    case 'idle':
      if (event.type === 'start') { ... }
  }
}
```

**Problem**: With subscription, Claude controls its own loop. We can't intercept between states.

**Recommended fix**: Change from **control** to **observability**:

```typescript
// Instead of controlling, OBSERVE via MCP
server.tool("update_session_state", {
  sessionId: string,
  state: 'analyzing' | 'implementing' | 'testing' | 'committing',
  metadata?: object
})
```

Update Ralph's prompt:

```
When you start analyzing the spec, call update_session_state('analyzing')
When you start writing code, call update_session_state('implementing')
When you start running tests, call update_session_state('testing')
```

**What we get:**

- UI shows accurate progress
- Session history includes state transitions
- Better debugging

**What we lose:**

- Can't enforce state transitions
- Can't inject behavior between states
- Claude might skip calling the tool

---

#### 6.13 Embedded Ralph UI - RESOLVED (Superseded)

**Decision**: Ticket closed. Goals decomposed into achievable pieces.

**Why the original approach was problematic:**

```
Option A: Direct Anthropic API ← Requires API key, loses subscription
Option B: PTY wrapper         ← Fragile, breaks with CLI updates
Option C: ACP Protocol        ← Not available yet
```

**Resolution**: The terminal window IS the embedded UI. We achieve the same goals through:

```
┌─────────────────────────────────────────────────────────────────┐
│                    RALPH VISIBILITY APPROACH                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LIVE viewing    →  Terminal window (already works)             │
│  STATE tracking  →  Hooks enforce + MCP records → DB → UI       │
│  PAST viewing    →  Session history in modal (6.3 ✅)           │
│  AT-A-GLANCE     →  Ralph status on ticket card (7.12)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**What moved to ticket 7.12 "Track and Display Branch/PR Status":**

- Ralph status badge on kanban cards (analyzing/implementing/testing)
- Ralph status in ticket modal header
- Link to Ralph session history
- Real-time status updates via MCP state tracking

**What we lose**: Token-level streaming in the UI (user must watch terminal)
**What we gain**: Stable, maintainable architecture that won't break with Claude CLI updates

---

### The Subscription-Compatible Pattern

When adapting Loom features, follow this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADAPTATION CHECKLIST                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. Does the feature require API access?                         │
│    □ Calling specific models (Haiku, etc.)                      │
│    □ Intercepting tool calls                                    │
│    □ Injecting messages mid-conversation                        │
│    □ Token-level streaming                                      │
│                                                                 │
│    If YES → Consider if MCP tools can provide similar value     │
│                                                                 │
│ 2. Does the feature rely on parsing Claude output?              │
│    □ Extracting structured data from text                       │
│    □ Detecting tool usage from stdout                           │
│    □ Parsing streaming responses                                │
│                                                                 │
│    If YES → Use MCP tools for Claude to report data instead     │
│                                                                 │
│ 3. Does the feature require controlling the agent loop?         │
│    □ State machine enforcement                                  │
│    □ Conditional branching based on responses                   │
│    □ Retry logic around API calls                               │
│                                                                 │
│    If YES → Convert to observability (Claude reports state)     │
│                                                                 │
│ 4. Is the feature pure infrastructure?                          │
│    □ Doesn't interact with Claude at runtime                    │
│    □ Works on data before/after Claude runs                     │
│    □ Is configuration, testing, or tooling                      │
│                                                                 │
│    If YES → ✅ Fully compatible, implement as designed          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Updated Epic 6 Checklist

#### ✅ Complete & Well-Aligned

- [x] 6.1 Secret redaction
- [x] 6.3 Session persistence (excellent MCP implementation)
- [x] 6.4 Retry strategy
- [x] 6.5 Error hierarchy
- [x] 6.6 Git metadata (excellent auto-capture)
- [x] 6.8 Property testing
- [x] 6.9 Layered configuration
- [x] 6.11 Diátaxis docs
- [x] 6.12 Health check

#### ✅ Resolved via Alternative Approach (Epic 7)

- [x] 6.2 SSE streaming → **Superseded** by 7.7 MCP Event Emission System
- [x] 6.7 PostToolsHook → **Closed** (requires API access we don't have)
- [x] 6.10 State machine → **Superseded** by 7.11 + 7.13 (observability + enforcement)
- [x] 6.13 Embedded Ralph UI → **Superseded** (see above)
  - Live viewing: Terminal window (already works)
  - State tracking: Hooks + MCP → ticket 7.11, 7.13
  - Past viewing: Session history via 6.3
  - Ralph status display: Added to ticket 7.12
