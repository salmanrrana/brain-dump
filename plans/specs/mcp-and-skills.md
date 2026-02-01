# Plan: Universal Quality Workflow via Skills + MCP Architecture

## The Core Insight (from Anthropic Engineering Articles)

**MCP = Connectivity** (access to systems). **Skills = Expertise** (workflow knowledge).

Our Brain Dump MCP server already provides connectivity (50+ tools for ticket management, review, demo, telemetry). What's missing is a proper **skill** that teaches any AI agent — regardless of provider — WHEN and HOW to use those tools in the correct order.

Currently, the workflow expertise is scattered across CLAUDE.md (~300 lines of workflow docs), 9 commands, 23 hooks, and a 614-line AGENTS.md for OpenCode. The Anthropic articles say this should be ONE skill with progressive disclosure:

- **Tier 1 (~50 tokens)**: Skill metadata — always visible, triggers recognition
- **Tier 2 (~500 tokens)**: SKILL.md — loaded when working on a ticket
- **Tier 3 (2000+ tokens)**: Reference docs — loaded on demand for detail

## Strategy: "Get Claude Right First, Then Port"

### Phase 1: Create Universal `brain-dump-workflow` Skill

### Phase 2: Integrate into Claude Code (already works, make it cleaner)

### Phase 3: Integrate into OpenCode (fix the broken workflow)

### Phase 4: Reduce MCP Tool Surface for OpenCode

### Phase 5: Add "Always Build End-to-End" learning

---

## Phase 1: Create the Universal Skill

**Create** `.claude/skills/brain-dump-workflow/SKILL.md`

This is the core deliverable. Following the three-tier progressive disclosure model:

```yaml
---
name: brain-dump-workflow
description: >
  MANDATORY quality workflow for Brain Dump tickets. Defines the exact MCP tool
  call sequence every ticket must follow. Load this before starting any ticket work.
---
```

**SKILL.md content (~500 tokens):**

```markdown
# Brain Dump Universal Quality Workflow

## MANDATORY 5-Step Sequence

Every ticket MUST go through these steps. Never skip any.

### Step 1: Start Work

Call `start_ticket_work({ ticketId: "<id>" })` BEFORE writing any code.
This creates a git branch, sets status to in_progress, and posts a "Starting work" comment.

### Step 2: Implement + Verify

Write code, then run quality gates:

- `pnpm type-check` — must pass
- `pnpm lint` — must pass
- `pnpm test` — must pass
  Commit with format: `feat(<ticket-short-id>): <description>`

### Step 3: Complete Implementation

Call `complete_ticket_work({ ticketId: "<id>", summary: "<what you did>" })`
This moves ticket to ai_review and posts a work summary comment.

### Step 4: AI Review

Perform self-review of all changes. For each issue found:
Call `submit_review_finding({ ticketId, agent: "code-reviewer", severity, category, description })`
Fix critical/major issues, then call `mark_finding_fixed({ findingId, status: "fixed" })`
Verify: `check_review_complete({ ticketId })` — must return canProceedToHumanReview: true

### Step 5: Generate Demo + STOP

Call `generate_demo_script({ ticketId, steps: [{order, description, expectedOutcome, type}] })`
Include 3-7 manual test steps. Ticket moves to human_review.
**STOP HERE. Do NOT continue. Only humans can approve tickets.**

## DO NOT

- Skip any step above
- Set ticket status to "done" directly
- Continue working after generating demo
- Write code before calling start_ticket_work
```

**Create** `.claude/skills/brain-dump-workflow/reference/review-guide.md`

Detailed self-review checklist (extracted from current CLAUDE.md):

- Code quality checks
- Error handling patterns
- Simplification opportunities
- Test coverage considerations

**Create** `.claude/skills/brain-dump-workflow/reference/troubleshooting.md`

Common errors and recovery (extracted from current AGENTS.md):

- "Cannot proceed - open critical findings"
- "Ticket must be in ai_review"
- State enforcement block recovery

**Create** `.claude/skills/brain-dump-workflow/scripts/run-quality-checks.sh`

```bash
#!/bin/bash
# Runs all quality gates and reports results
pnpm type-check && pnpm lint && pnpm test
```

### Files:

- Create: `.claude/skills/brain-dump-workflow/SKILL.md`
- Create: `.claude/skills/brain-dump-workflow/reference/review-guide.md`
- Create: `.claude/skills/brain-dump-workflow/reference/troubleshooting.md`
- Create: `.claude/skills/brain-dump-workflow/scripts/run-quality-checks.sh`

---

## Phase 2: Integrate into Claude Code

Claude Code already works, but the workflow instructions are scattered across 300+ lines in CLAUDE.md. Simplify by referencing the skill.

### 2a. Slim Down CLAUDE.md

In the "Universal Quality Workflow" section of CLAUDE.md, replace the detailed workflow description with a reference to the skill:

```markdown
## Universal Quality Workflow

Brain Dump uses a mandatory quality workflow for all tickets. When working on any ticket,
load the `brain-dump-workflow` skill for the complete tool call sequence.

### Status Flow

backlog → ready → in_progress → ai_review → human_review → done

### Quick Reference

1. `start_ticket_work({ ticketId })` → before writing code
2. Implement + `pnpm check`
3. `complete_ticket_work({ ticketId, summary })` → after committing
4. Self-review + `submit_review_finding()` → for each issue
5. `generate_demo_script({ ticketId, steps })` → then STOP
```

Keep the existing hook documentation, DO/DON'T tables, testing philosophy, etc. Only the workflow PROCEDURE moves to the skill.

### 2b. Update Commands to Reference Skill

Existing commands (/next-task, /review, /demo) continue to work. Add a line at the top of each:

```
Load the brain-dump-workflow skill for context on the full workflow.
```

### Files:

- Modify: `CLAUDE.md` (slim down UQW section, ~150 lines removed)
- Modify: `.claude/commands/next-task.md` (add skill reference)
- Modify: `.claude/commands/review-ticket.md` (add skill reference)
- Modify: `.claude/commands/demo.md` (add skill reference)

---

## Phase 3: Integrate into OpenCode

This is the main fix. Replace the plugin-heavy approach with skill + minimal config.

### 3a. Copy Skill to OpenCode

The same skill works in OpenCode. Copy it to `.opencode/skills/brain-dump-workflow/`.

### 3b. Rewrite AGENTS.md (~50 lines)

Replace the 614-line document with:

```markdown
# Brain Dump - OpenCode Integration

## BEFORE Starting Any Ticket

Load the `brain-dump-workflow` skill. It contains the mandatory 5-step quality
workflow with exact MCP tool calls for each step.

## Essential Tools (in order)

1. `start_ticket_work` → creates branch, starts tracking
2. `complete_ticket_work` → moves to review phase
3. `submit_review_finding` → logs review issues
4. `check_review_complete` → verifies review done
5. `generate_demo_script` → creates human test steps

## Quality Gates

Run before completing: `pnpm type-check && pnpm lint && pnpm test`

## Rules

- NEVER skip steps
- NEVER set ticket to "done" (only humans approve)
- STOP after generating demo script
```

### 3c. Create Ralph Agent

**Create** `.opencode/agents/ralph.md`

```markdown
---
description: Brain Dump Ralph - autonomous ticket implementation agent
mode: primary
tools:
  write: true
  edit: true
  bash: true
  skill: true
  brain-dump_*: true
permission:
  "*": "allow"
---

You are Ralph, an autonomous AI agent. Load the brain-dump-workflow skill
immediately and follow its 5-step sequence exactly.
```

### 3d. Remove Most Plugins

The skill replaces the need for:

- `brain-dump-state-enforcement.ts` → Skill tells agent when to write code
- `brain-dump-auto-pr.ts` → Skill covers this in start_ticket_work output
- `brain-dump-commit-tracking.ts` → Non-essential for workflow comments
- `brain-dump-utils.ts` → Only used by removed plugins

Keep as safety nets:

- `brain-dump-review-guard.ts` → Hard block on push without review
- `brain-dump-review-marker.ts` → Required by review-guard
- `brain-dump-telemetry.ts` → Observability (if plugin API works)

### 3e. Fix Launch Prompt (context.ts)

**Modify** `src/api/context.ts` lines 151-179

Replace the vague "When Complete" section with skill-aware instructions:

```typescript
contextParts.push("## MANDATORY Workflow");
contextParts.push("Load the brain-dump-workflow skill and follow its 5-step sequence.");
contextParts.push("");
contextParts.push("Quick reference:");
contextParts.push(
  `1. \`start_ticket_work({ ticketId: "${ticket.id}" })\` → FIRST, before any code`
);
contextParts.push("2. Write code → run \`pnpm type-check && pnpm lint && pnpm test\` → commit");
contextParts.push(
  `3. \`complete_ticket_work({ ticketId: "${ticket.id}", summary: "..." })\` → after committing`
);
contextParts.push(
  "4. Self-review → \`submit_review_finding()\` for each issue → fix → \`check_review_complete()\`"
);
contextParts.push(
  `5. \`generate_demo_script({ ticketId: "${ticket.id}", steps: [...] })\` → then STOP`
);
contextParts.push("");
contextParts.push("These steps are MANDATORY. The Brain Dump MCP server is configured.");
```

This ensures the workflow instructions appear in EVERY OpenCode launch — Edit Ticket modal, Edit Epic modal, any entry point.

### Files:

- Create: `.opencode/skills/brain-dump-workflow/` (copy from `.claude/skills/`)
- Rewrite: `.opencode/AGENTS.md` (614 → ~50 lines)
- Create: `.opencode/agents/ralph.md`
- Delete: `.opencode/plugins/brain-dump-state-enforcement.ts`
- Delete: `.opencode/plugins/brain-dump-auto-pr.ts`
- Delete: `.opencode/plugins/brain-dump-commit-tracking.ts`
- Delete: `.opencode/plugins/brain-dump-utils.ts`
- Modify: `src/api/context.ts` (lines 151-179)

---

## Phase 4: Reduce MCP Tool Surface for OpenCode

The multi-agent article warns: "Managing 15-20+ tools where model spends significant context understanding options" causes problems. Our MCP server exposes 50+ tools. For OpenCode with weaker/varied models, whitelist only essential tools.

**Modify** `.opencode/opencode.json`:

```json
{
  "mcp": {
    "brain-dump": {
      "type": "local",
      "command": ["npx", "tsx", "<absolute-path>/mcp-server/index.ts"],
      "enabled": true
    }
  },
  "tools": {
    "brain-dump_start_ticket_work": true,
    "brain-dump_complete_ticket_work": true,
    "brain-dump_submit_review_finding": true,
    "brain-dump_mark_finding_fixed": true,
    "brain-dump_check_review_complete": true,
    "brain-dump_generate_demo_script": true,
    "brain-dump_add_ticket_comment": true,
    "brain-dump_create_ralph_session": true,
    "brain-dump_update_session_state": true,
    "brain-dump_complete_ralph_session": true,
    "brain-dump_list_tickets": true,
    "brain-dump_*": false
  }
}
```

This reduces from 50+ tools to ~11 essential ones, dramatically reducing context waste and improving tool selection accuracy.

### Files:

- Modify: `.opencode/opencode.json`

---

## Phase 5: Update Setup Script + CLAUDE.md Learning

### 5a. Update `scripts/setup-opencode.sh`

- Copy skill directory to `~/.config/opencode/skills/brain-dump-workflow/`
- Copy Ralph agent to `~/.config/opencode/agents/ralph.md`
- Remove deleted plugins from copy list
- Update verification output

### 5b. Add "Always Build End-to-End" Learning to CLAUDE.md

```markdown
## Development Learnings

### Always Build End-to-End

When implementing features, always verify the complete chain:

- Frontend trigger (button click, modal action) →
- API/server function →
- Backend logic →
- Observable output (UI update, database change, terminal output)

Never build backend logic without connecting the frontend.
Never build a frontend trigger without verifying it calls the right backend.
Test the FULL flow, not just individual pieces.
```

### Files:

- Modify: `scripts/setup-opencode.sh`
- Modify: `CLAUDE.md` (add Development Learnings section)

---

## What Gets Removed from PR #97

| Item                               | Action  | Reason                             |
| ---------------------------------- | ------- | ---------------------------------- |
| `brain-dump-state-enforcement.ts`  | DELETE  | Skill replaces guidance            |
| `brain-dump-auto-pr.ts`            | DELETE  | Skill covers via MCP output        |
| `brain-dump-commit-tracking.ts`    | DELETE  | Non-essential complexity           |
| `brain-dump-utils.ts`              | DELETE  | Only used by deleted plugins       |
| Current AGENTS.md (614 lines)      | REWRITE | → ~50 lines referencing skill      |
| `brain-dump-review-guard.ts`       | KEEP    | Safety net for push without review |
| `brain-dump-review-marker.ts`      | KEEP    | Required by review-guard           |
| `brain-dump-telemetry.ts`          | KEEP    | Observability value                |
| `src/api/start-ticket-workflow.ts` | KEEP    | Core workflow logic                |
| `docs/uqw-multi-environment.md`    | KEEP    | Reference documentation            |
| `scripts/setup-opencode.sh`        | UPDATE  | Copy skill instead of plugins      |

## Verification Plan

### Claude Code (should still work)

1. Run `/next-task` on a test ticket → verify "Starting work" comment appears
2. Complete implementation → verify `complete_ticket_work` posts summary
3. Run `/review` → verify findings submitted and comments posted
4. Run `/demo` → verify demo script generated and ticket moves to human_review
5. Verify skill loads: in a session, check that `brain-dump-workflow` appears in skill list

### OpenCode (the fix)

1. **From Edit Ticket modal**: Click "Start with OpenCode" → verify prompt includes workflow instructions → verify AI calls `start_ticket_work`
2. **From Edit Epic modal**: Same verification
3. **From terminal**: Run `opencode` in any project → verify AGENTS.md loaded → verify skill available → verify AI follows 5-step workflow
4. **Full workflow**: Complete a ticket end-to-end → verify ALL comments appear on ticket (starting work, summary, findings, demo steps)
5. **Tool surface**: Verify only ~11 tools exposed (not 50+)

### Quality Gates

- `pnpm type-check` passes
- `pnpm lint` passes
- `pnpm test` passes

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    SKILL LAYER                       │
│         brain-dump-workflow/SKILL.md                 │
│   (Universal - same file works everywhere)           │
│                                                      │
│   Tier 1: Metadata (~50 tokens, always visible)     │
│   Tier 2: SKILL.md (~500 tokens, loaded on demand)  │
│   Tier 3: reference/ (2000+ tokens, deep detail)    │
└───────────────┬─────────────────┬───────────────────┘
                │                 │
    ┌───────────▼──────┐  ┌──────▼─────────────┐
    │   CLAUDE CODE    │  │     OPENCODE        │
    │                  │  │                     │
    │ CLAUDE.md refs   │  │ AGENTS.md refs      │
    │ skill            │  │ skill               │
    │ Commands call    │  │ Ralph agent has      │
    │ MCP tools        │  │ skill in prompt      │
    │ Hooks enforce    │  │ Minimal plugins      │
    │ (safety nets)    │  │ (review-guard only)  │
    └───────────────┬──┘  └──┬──────────────────┘
                    │         │
         ┌──────────▼─────────▼──────────┐
         │       MCP SERVER              │
         │   (Connectivity Layer)         │
         │                               │
         │  start_ticket_work            │
         │  complete_ticket_work         │
         │  submit_review_finding        │
         │  generate_demo_script         │
         │  ... (50+ tools available)    │
         └───────────────────────────────┘
```
