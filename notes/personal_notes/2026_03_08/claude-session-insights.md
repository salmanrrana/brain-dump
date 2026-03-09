# Claude Code Usage Analysis Report

**Data:** 1,782 prompts | 222 sessions | 18 projects | 79 days (Dec 18, 2025 – Mar 8, 2026)

---

## What You Do Most Frequently

| Activity                 | % of All Prompts | Notes                                                 |
| ------------------------ | ---------------- | ----------------------------------------------------- |
| **Feature development**  | 47.3% (842)      | Your dominant mode — directing Claude to build things |
| **Workflow automation**  | 12.1% (216)      | Ralph sessions, ticket chaining, pipeline setup       |
| **Documentation/specs**  | 8.5% (151)       | Specs, plans, inception docs                          |
| **Bug fixing**           | 5.7% (101)       | Often cascading error-fix-error spirals               |
| **Learning/exploration** | 4.9% (87)        | Bitcoin Core, financial concepts, new codebases       |
| **Git/DevOps**           | 4.7% (83)        | Branch management, PRs, deploys — frequent pain point |
| **Meta/Claude config**   | 3.6% (65)        | Plugins, hooks, CLAUDE.md, memory                     |

**Your working style in numbers:**

- **Peak day:** Thursdays (25% of all activity — nearly 2x any other day)
- **Peak hour:** 3 PM. Core window 9am–5pm (57%), with a second wind 10pm–2am (10%)
- **Session pattern:** Bimodal. 57% of sessions are quick (1–3 prompts), but 20 marathon sessions (21+ prompts) contain 52% of all your work
- **Prompts are getting shorter over time** (224 chars → 109 chars) — you expect more from Claude with less instruction
- **Brain Dump dominates** at 51% of all prompts (914 combined brain-dumpy + brain-dump)

**Your projects reveal a product builder, not a feature builder:**

- Developer tooling (Brain Dump, Ralph, MCP, review pipeline)
- Fintech (FReady — FRED, CoinGecko, expert methodology scoring)
- Crypto (sat-tracker, auto-trader, llm-predict, utxo_viz)
- Healthcare education (hem-onc orientation slides, medcalc)
- Personal utility (workout-deck, kids-meal, playing-house)

---

## What Should Become Skills (Reusable Workflows)

These are patterns you repeat manually across sessions that should be one command.

### 1. `/interview-spec` — Spec Interview Kickoff

You use this **exact same prompt** across 4+ projects:

> "read this @spec.md and interview me in detail using the AskUserQuestionTool about literally anything: technical implementation, UI and UX, concerns, tradeoffs..."

This is your ritual for starting every project. Hardcode it.

### 2. `/fix-error` — Error Diagnosis & Fix

71 prompts paste error output + ask for a fix. 16% of error-fix attempts cascade into another error. A skill that: reads the error → correlates with recent changes → runs `pnpm check` → proposes root-cause fix before attempting anything, would cut error spirals significantly.

### 3. `/iterate-ui` — Visual Feedback Loop

Your marathon sessions (42.5 avg prompts) are dominated by `change → look → tweak → look → tweak`. A tight-loop skill that makes a change, presents it, and waits for accept/reject would formalize what you already do.

### 4. `/ship` — Commit, Push, PR in One Shot

123 git workflow prompts, frequent branch confusion ("why did it change to a different branch", "was this pushed to a PR or where was it pushed?"). You're already building this on the current branch — validate it solves the pain.

### 5. `/plan-and-execute` — Create Tickets Then Start

45 sessions contain "create ticket/epic" immediately followed by "now build it." Combine creation + kickoff.

---

## What Should Become Plugins (Standalone Cross-Project Tools)

These are patterns that repeat across multiple unrelated projects.

### 1. Project Kickoff Plugin

Your consistent ritual across 4+ projects: `spec.md → interview → breakdown → epics/tickets → start building`. This is project-agnostic and should work in any repo. Currently requires chaining `/inception` → `/breakdown` → `/next-task` manually.

### 2. Agent Review Panel Plugin

136 prompts reference agent-team delegation ("have the designer agent review", "have the QA agent review", "Team Seinfeld review"). You want multi-perspective review (design, QA, security, product) before shipping. This pattern appears in fianance-ready AND brain-dump. A `/review-panel` plugin dispatching to specialist agents would formalize your existing instinct.

### 3. Mobile Responsiveness Checker

Appears across sat-tracker (9x), fianance-ready (6x), scuffed (2x), kids-meal (1x). The pattern is always: build desktop → realize mobile is broken → request mobile fix → iterate. Automate the "realize" step.

---

## What Should Become Agents (Autonomous Subagents)

### 1. Error Diagnosis Agent

Before attempting any fix, this agent would: run `pnpm check`, read recent git diff, correlate the error with changed code, and produce a root-cause analysis. This targets the 11 error-after-error cascades found in your history.

### 2. Review-to-Fix Agent

Current flow: review agents find issues → you say "fix every single issue from critical to low" → Claude fixes. An agent that takes review findings as input and autonomously fixes them (with a diff summary for your approval) would close this loop.

### 3. Pre-Ship Verification Agent

You say "make sure" in **132 prompts** (8% of everything). An agent that runs after every code change — type-check, lint, test, mobile viewport check, git status — would eliminate the need to ask.

### 4. Ralph Auto-Continue Improvement

Ralph sessions average only 4.8 prompts because you have to manually type "continue to the next ticket" **14+ times** across your history. The `AUTO_SPAWN_NEXT_TICKET` env var exists but is opt-in. Ralph should auto-advance by default.

---

## What Belongs in CLAUDE.md

### 1. Auto-verify after every code change

> After completing any code modification, automatically run `pnpm check` before reporting success.

This eliminates ~132 "make sure" prompts (8% of your total usage).

### 2. Always check mobile after UI changes

> After any UI change, verify the component renders correctly at mobile viewport widths (375px, 768px).

This eliminates the desktop→mobile pain cycle that repeats across 4 projects.

### 3. Confirm before destructive git ops

> Never push to main, force push, or delete branches without explicit user confirmation — even if asked to "just push it."

You've had frustration exits (`/clear`) after pushes to wrong branches and unwanted file pushes. The existing safety language is too permissive.

### 4. Ralph auto-advance as default

> In Ralph sessions, automatically continue to the next ticket after completing one. Do not stop and wait for user confirmation unless the ticket fails or encounters a blocking issue.

This makes the autonomous workflow actually autonomous.

---

## Key Insight

Your most impactful investment isn't any single skill or plugin — it's **closing the gaps between the automation you've already built**. You have `/inception`, `/breakdown`, `/next-task`, `/review`, `/review-ticket`, `/demo`, and `/reconcile-learnings` as individual skills. But you still manually chain them. The biggest return would be a **pipeline orchestrator** that connects these existing skills into continuous flows where you only intervene for decisions, not handoffs.

---

## Appendix: Detailed Statistics

### Category Breakdown (Full)

| Category              | Count | %     |
| --------------------- | ----- | ----- |
| Feature Development   | 842   | 47.3% |
| Workflow Automation   | 216   | 12.1% |
| Documentation         | 151   | 8.5%  |
| Bug Fixing            | 101   | 5.7%  |
| Learning/Exploration  | 87    | 4.9%  |
| DevOps/Git            | 83    | 4.7%  |
| Meta/Claude-Config    | 65    | 3.6%  |
| Plugin/Skill/Hook Dev | 56    | 3.1%  |
| Testing               | 38    | 2.1%  |
| Code Review           | 36    | 2.0%  |
| UI/Styling            | 26    | 1.5%  |
| Slash Commands (misc) | 25    | 1.4%  |
| Project Setup         | 15    | 0.8%  |
| Architecture/Design   | 14    | 0.8%  |
| Database              | 14    | 0.8%  |
| Refactoring           | 13    | 0.7%  |

### Project Usage

| Project                  | Prompts | %     | Active Days |
| ------------------------ | ------- | ----- | ----------- |
| brain-dumpy (pre-rename) | 461     | 25.9% | 5 days      |
| brain-dump               | 453     | 25.4% | 54 days     |
| fianance-ready           | 395     | 22.2% | 10 days     |
| ~/code (hem-onc slides)  | 154     | 8.6%  | 1 day       |
| sat-tracker              | 68      | 3.8%  | 11 days     |
| llm-predict              | 56      | 3.1%  | 1 day       |
| auto-trader              | 31      | 1.7%  | 1 day       |
| kids-meal                | 23      | 1.3%  | 1 day       |
| scuffed                  | 11      | 0.6%  | 1 day       |
| Others (7 projects)      | 40      | 2.2%  | various     |

### Time-of-Day Patterns

| Time Block            | Prompts | %     |
| --------------------- | ------- | ----- |
| Afternoon (12-15)     | 555     | 31.1% |
| Morning (08-11)       | 452     | 25.4% |
| Evening (16-19)       | 297     | 16.7% |
| Night (20-23)         | 232     | 13.0% |
| Late Night (00-03)    | 185     | 10.4% |
| Early Morning (04-07) | 61      | 3.4%  |

### Day-of-Week Patterns

| Day       | Prompts | %     |
| --------- | ------- | ----- |
| Thursday  | 447     | 25.1% |
| Monday    | 261     | 14.6% |
| Sunday    | 261     | 14.6% |
| Tuesday   | 246     | 13.8% |
| Wednesday | 230     | 12.9% |
| Saturday  | 192     | 10.8% |
| Friday    | 145     | 8.1%  |

### Session Length Patterns

| Session Type             | Sessions | % of Sessions | Prompts | % of Prompts |
| ------------------------ | -------- | ------------- | ------- | ------------ |
| 1 prompt (quick fire)    | 37       | 16.7%         | 37      | 2.1%         |
| 2-3 prompts (short)      | 89       | 40.1%         | 201     | 11.3%        |
| 4-5 prompts (medium)     | 24       | 10.8%         | 105     | 5.9%         |
| 6-10 prompts (focused)   | 33       | 14.9%         | 258     | 14.5%        |
| 11-20 prompts (deep)     | 19       | 8.6%          | 264     | 14.8%        |
| 21-50 prompts (marathon) | 15       | 6.8%          | 458     | 25.7%        |
| 51+ prompts (ultra)      | 5        | 2.3%          | 459     | 25.8%        |

### Slash Command Usage

| Command             | Count | Purpose           |
| ------------------- | ----- | ----------------- |
| /rate-limit-options | 26    | Check rate limits |
| /resume             | 18    | Resume sessions   |
| /model              | 18    | Switch models     |
| /clear              | 14    | Clear context     |
| /plugin             | 13    | Plugin management |
| /mcp                | 10    | MCP tools         |
| /agents             | 7     | Agent management  |
| /exit               | 4     | Exit sessions     |
| /init               | 3     | Project init      |
| /passes             | 3     | Check passes      |
| /doctor             | 2     | Health check      |

### Session Archetypes

| Archetype                | Count | %     |
| ------------------------ | ----- | ----- |
| Ralph autonomous session | 57    | 25.7% |
| Other/mixed              | 50    | 22.5% |
| Planning/epic management | 32    | 14.4% |
| Single prompt session    | 25    | 11.3% |
| Learning/exploration     | 24    | 10.8% |
| Build + ship             | 13    | 5.9%  |
| Build-only               | 11    | 5.0%  |
| Bug fix session          | 7     | 3.2%  |
| Presentation editing     | 2     | 0.9%  |
| Build + review           | 1     | 0.5%  |

### Usage Evolution by Week

| Week     | Prompts | Top Project      |
| -------- | ------- | ---------------- |
| 2025-W50 | 14      | bitcoin          |
| 2025-W51 | 61      | sat-tracker      |
| 2025-W52 | 76      | fianance-ready   |
| 2026-W00 | 80      | fianance-ready   |
| 2026-W01 | 575     | fianance-ready   |
| 2026-W02 | 383     | brain-dumpy      |
| 2026-W03 | 8       | brain-dump       |
| 2026-W04 | 91      | brain-dump       |
| 2026-W06 | 119     | brain-dump       |
| 2026-W07 | 30      | brain-dump       |
| 2026-W08 | 28      | brain-dump       |
| 2026-W09 | 314     | ~/code (hem-onc) |
| 2026-W10 | 3       | scuffed          |

### Prompt Sophistication Over Time

| Period | Dates       | Avg Length | @ Refs | Slash Cmds | Ticket Refs | Structured Score |
| ------ | ----------- | ---------- | ------ | ---------- | ----------- | ---------------- |
| 1      | 12/18-01/06 | 224 chars  | 37     | 12         | 4           | 67               |
| 2      | 01/06-01/09 | 198 chars  | 26     | 27         | 45          | 118              |
| 3      | 01/09-01/12 | 103 chars  | 6      | 47         | 43          | 107              |
| 4      | 01/12-02/18 | 154 chars  | 8      | 29         | 46          | 96               |
| 5      | 02/18-03/08 | 109 chars  | 11     | 21         | 27          | 72               |

### Pain Points Identified

1. **Rate Limiting** (26 hits, 8 sessions) — `/rate-limit-options` is the #1 most-used slash command
2. **"Not Working" Loops** (16 occurrences) — UI bugs persisting across multiple fix attempts
3. **Frustration Exits** (14 sessions ending in `/clear`) — pushes to wrong branches, unwanted file changes, agent not following instructions
4. **Ralph "Continue" Fatigue** (14+ manual nudges) — defeats the purpose of autonomous operation
5. **Git Branch Confusion** (5+ sessions) — "why did it change to a different branch", "was this pushed to a PR?"

### Workflow Patterns

| Pattern                          | Count |
| -------------------------------- | ----- |
| Ralph/BD auto-prompt (temp file) | 116   |
| Epic/ticket management           | 62    |
| Spec creation                    | 36    |
| Inception prompt (auto-spawn)    | 20    |
| Next ticket selection            | 19    |
| Quick affirmative (yes/go)       | 12    |
| Read-then-act pattern            | 12    |
| Continuation prompt              | 12    |

### Per-Project Deep Dive

#### brain-dumpy (v1) — 461 prompts, 68 sessions, Jan 8–13 (5 days)

The original Brain Dump. Started as "I want a JIRA replacement for personal use." Built kanban UI, Ralph autonomous mode, MCP server, cross-provider support. Hit rate limits heavily. Pioneered the inception agent pattern.

#### brain-dump (v2) — 453 prompts, 78 sessions, Jan 13–Mar 8 (ongoing)

Matured Brain Dump. Focus shifted to meta-features: epic detail pages, MCP tool consolidation, install/uninstall scripts, multi-machine debugging, UI polish (themes, LetterGlitch), workflow refactoring, token optimization. The project where the user lives.

#### fianance-ready — 395 prompts, 22 sessions, Dec 31–Jan 9 (10 days)

Financial analysis tool inspired by Luke Gromen, Lyn Alden, Jerry Parker, Michael Beer. FRED/CoinGecko APIs, expert methodology scoring, watchlist, auth/payment. Used Claude as financial educator. "Explain like I'm 12" philosophy throughout.

#### hem-onc-orientation — 161 prompts, 2 sessions, Mar 5 (single day)

Hematology/oncology nursing orientation slides. NOT a software project. Slide-by-slide medical content editing (AML, ALL, APL, MDS, aplastic anemia). Attributed to "Cydney Rana, APRN." Shows deep clinical knowledge in the user's circle.

#### sat-tracker — 68 prompts, 5 sessions, Dec 23–Jan 3

Bitcoin satoshi-to-dollar converter. Strong aesthetic preferences — vintage computer, 8-bit gaming themes (DOOM/Pokemon/Mario). Very design-focused.

#### llm-predict — 56 prompts, 10 sessions, Jan 8–10

Prediction market concept. Non-custodial crypto betting on AI performance. More planning/business discussion than coding. Entrepreneurial thinking.

#### auto-trader — 31 prompts, 4 sessions, Jan 10

Automated trading system. Quick exploration, likely spun off from finance-ready.

#### workout-deck — 8 prompts, 2 sessions, Jan 9–12

YouTube workout video saver with interval timers. Primarily built BY Ralph autonomously. Used as test bed for Brain Dump workflow.

#### playing-house — 4 prompts, 3 sessions, Feb 23–28

Almost entirely delegated to Ralph. User only interacted to merge, review, and adjust database choices (Convex).

#### medcalc — 7 prompts, 1 session, Feb 15

Medical calculator. Deployment troubleshooting, converted to plain HTML/CSS/JS for simpler hosting.

#### scuffed — 11 prompts, 3 sessions, Mar 7–8

New project in planning. Railway deployment, mobile site, backend test coverage. Very recent.

### Existing Automation Inventory

**Slash Commands (10):** /breakdown, /demo, /extended-review, /inception, /next-task, /reconcile-learnings, /review, /review-epic, /review-ticket

**Plugins (11):** frontend-design, code-review, agent-sdk-dev, plugin-dev, hookify, feature-dev, commit-commands, security-guidance, code-simplifier, context7, pr-review-toolkit

**Hooks (10):** State enforcement (pre-write), review enforcement (pre-push), commit linking (post-commit), task capture (post-TodoWrite), code change detection (on-stop), review completion marking, extended review chaining, library detection, next-ticket spawning (2 variants)

**Memory Files:** MEMORY.md (critical patterns), component-patterns.md, server-security.md

### Developer Profile Summary

Product-minded builder who uses AI as a full development team — architect, engineer, tester, reviewer, deployer. Has built a sophisticated meta-layer (Brain Dump + Ralph + hooks + review pipeline) that turns Claude Code into an autonomous development pipeline. Domain interests span fintech, healthcare education, crypto, and developer tooling. Works fast, thinks in products not features, cares deeply about UX accessibility ("explain like I'm 12"). Actively exploring whether Brain Dump could become a business — a JIRA replacement for teams who want AI-native project management without the bloat.
