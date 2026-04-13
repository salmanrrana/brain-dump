# Universal Quality Workflow Per Provider

This document explains how the Universal Quality Workflow moves a ticket forward in each supported provider, what the LLM is expected to do at each step, and what technology actually drives that step.

The providers implemented in this repo are:

- Claude Code
- Cursor Editor
- Cursor Agent CLI
- VS Code / Copilot Chat
- Copilot CLI
- Codex
- OpenCode

## Core idea

The workflow itself is provider-agnostic. The same Brain Dump MCP tools and core business logic move the ticket:

- `workflow.start-work`
- `session.create`
- `session.update-state`
- `comment.add`
- `workflow.complete-work`
- `review.submit-finding`
- `review.mark-fixed`
- `review.check-complete`
- `review.generate-demo`
- `session.complete`

The provider differences are about how the LLM gets told to do those steps, and what enforces them:

- Prompt/context/agent instructions tell the LLM what to do.
- The MCP server and core logic actually mutate ticket state.
- Hooks or plugins sometimes add enforcement around writes, pushes, commit linking, or telemetry.

## Canonical workflow source

The shared workflow instructions come from `src/api/ralph-prompts.ts`.

- `WORKFLOW_PHASES` defines the phase order: implementation -> AI review -> demo -> stop.
- `VERIFICATION_CHECKLIST` requires `pnpm type-check`, `pnpm lint`, `pnpm test`, plus a `comment.add` test report before `complete-work`.
- `buildImplementationPrompt()` and `buildReviewPrompt()` are the canonical LLM instructions for Ralph-style flows.

Key references:

- `src/api/ralph-prompts.ts:48`
- `src/api/ralph-prompts.ts:65`
- `src/api/ralph-prompts.ts:88`
- `src/api/ralph-prompts.ts:126`

## What actually moves ticket state

These are the real workflow engines, regardless of provider:

- `core/workflow.ts:startWork()` creates/checks out branch, sets ticket to `in_progress`, initializes workflow state, and posts the initial progress comment.
- `core/workflow.ts:completeWork()` validates that a fresh `test_report` comment exists, moves ticket to `ai_review`, and posts the work summary comment.
- `core/review.ts:submitFinding()` requires ticket status `ai_review`.
- `core/review.ts:generateDemo()` requires ticket status `ai_review`, requires all critical/major findings fixed, and moves the ticket to `human_review`.
- `core/session.ts` writes `.claude/ralph-state.json`, which hooks/plugins read for enforcement.

Key references:

- `core/workflow.ts:97`
- `core/workflow.ts:250`
- `core/review.ts:156`
- `core/review.ts:347`
- `core/session.ts:214`

## Provider matrix

| Provider               | How the LLM is guided                                                 | What actually moves workflow                    | Extra enforcement / automation                                                                      |
| ---------------------- | --------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Claude Code            | Ralph prompt, slash commands, installed skills, hooks messaging       | MCP server + core workflow/review/session logic | Claude hooks block writes in wrong state; hooks also help with commit linking and local guard rails |
| Cursor Editor          | Ralph context file, global subagents, skills, Cursor rule/docs        | MCP server + core workflow/review/session logic | Cursor hooks block writes in wrong state                                                            |
| Cursor Agent CLI       | Same Ralph prompt, headless `agent --force --approve-mcps --trust -p` | MCP server + core workflow/review/session logic | Optional/shared Cursor hook setup; explicit `CURSOR_AGENT=1` env detection                          |
| VS Code / Copilot Chat | `.github/copilot-instructions.md`, agents, prompts, skills            | MCP server + core workflow/review/session logic | No hooks; only MCP preconditions and instructions                                                   |
| Copilot CLI            | Copilot prompt/context, agents, shared skills                         | MCP server + core workflow/review/session logic | Global hook blocks writes in wrong state; MCP self-instrumentation handles telemetry                |
| Codex                  | Brain Dump context file / prompt plus MCP config                      | MCP server + core workflow/review/session logic | No provider-specific hook enforcement in this repo                                                  |
| OpenCode               | Agent docs, AGENTS.md, context/prompt, skills                         | MCP server + core workflow/review/session logic | OpenCode plugins can guard review/push and track lifecycle events                                   |

## Shared step-by-step workflow

For every provider, the intended ticket flow is:

1. Start ticket
2. Create session
3. Move session through `analyzing`, `implementing`, `testing`, `committing`, `reviewing`
4. Add a `test_report` comment
5. Complete implementation to move to `ai_review`
6. Submit findings and fix them
7. Check review completion
8. Generate demo to move to `human_review`
9. Complete the session and stop

The sections below explain how each provider gets through those steps.

## Claude Code

### How Claude Code starts the ticket

There are two common start paths:

- Interactive Claude usage: the LLM is instructed to call `workflow.start-work({ ticketId })` and then `session.create({ ticketId })`.
- Ralph launch from Brain Dump UI: the server can bootstrap `startWork(...)` before Claude even starts, then launch Claude with the canonical Ralph prompt.

References:

- `docs/environments/claude-code.md:33`
- `src/api/ralph.ts:320`
- `src/api/ralph-script.ts:518`

### How Claude Code sends the first comment

The initial "Started work on ticket" progress comment is not handwritten by the LLM. It is created by core workflow logic inside `startWork()`.

Reference:

- `core/workflow.ts:210`

### How Claude Code moves through each step

1. Start work
   `workflow.start-work` or server-side `startWork(...)` creates/checks out the branch, sets `in_progress`, initializes workflow state, and adds the starting progress comment.

2. Start session
   The LLM calls `session.create({ ticketId })`. This creates the Ralph session and writes `.claude/ralph-state.json`.

3. Move between states
   The LLM calls `session.update-state(...)`. Claude hooks read `.claude/ralph-state.json` and block Write/Edit if the state is not one of `implementing`, `testing`, or `committing`.

4. Add test report comment
   The prompt explicitly requires `comment.add({ commentType: "test_report" })` before `complete-work`. If `author` is omitted, Brain Dump auto-detects it.

5. Complete implementation
   `workflow.complete-work` checks for a fresh `test_report` comment, moves the ticket to `ai_review`, and writes the work summary comment.

6. AI review
   Claude is instructed to call `review.submit-finding`, `review.mark-fixed`, and `review.check-complete`.

7. Demo handoff
   `review.generate-demo` moves the ticket to `human_review`.

8. End session
   Claude calls `session.complete` and stops.

### What technology pushes the workflow along

- Prompt/skill: Ralph prompt and Claude skills tell the LLM which MCP calls to make.
- MCP server: `mcp-server/tools/workflow.ts`, `session.ts`, `review.ts`, `comment.ts`.
- Core logic: `core/workflow.ts`, `core/session.ts`, `core/review.ts`.
- Hooks: Claude hooks enforce state around writes and provide inline feedback.

References:

- `docs/environments/claude-code.md:77`
- `src/api/ralph-prompts.ts:91`
- `mcp-server/tools/workflow.ts:238`
- `mcp-server/tools/session.ts:127`
- `mcp-server/tools/review.ts:148`

## Cursor Editor

### How Cursor starts the ticket

Brain Dump launches Cursor with a generated context file for Ralph-style work.

- The UI/server may already bootstrap `startWork(...)` before opening Cursor.
- Cursor then receives the same canonical workflow via the generated context file.

References:

- `docs/environments/cursor.md:33`
- `src/api/ralph.ts:341`
- `src/api/ralph.ts:364`
- `src/api/ralph-prompts.ts:309`

### How Cursor sends the first comment

Same as Claude Code: the first progress comment is generated by `core/workflow.ts:startWork()`.

Reference:

- `core/workflow.ts:210`

### How Cursor moves through each step

The step sequence is the same as Claude Code. The important difference is the provider shell/editor layer:

1. Start ticket via `workflow.start-work` or server bootstrap.
2. Create session with `session.create`.
3. Use `session.update-state` as work progresses.
4. Add `comment.add` test report.
5. Call `workflow.complete-work`.
6. Use review MCP actions.
7. Call `review.generate-demo`.
8. Call `session.complete`.

### What technology pushes the workflow along

- Prompt/context: generated Ralph context file.
- MCP server and core logic: same shared engine.
- Cursor hooks: installed in `~/.cursor/hooks.json`; these provide state enforcement before writes.
- Cursor subagents/commands/rules: help guide the LLM toward the correct MCP sequence.

References:

- `docs/environments/cursor.md:57`
- `docs/environments/cursor.md:110`
- `scripts/setup-cursor.sh:403`

## Cursor Agent CLI

### How Cursor Agent starts the ticket

Cursor Agent is the headless Cursor path. Brain Dump launches it with a prompt using:

`agent --force --approve-mcps --trust -p "..."`

or the `cursor-agent` binary fallback.

References:

- `src/api/ralph-script.ts:80`
- `src/api/ralph-script.ts:98`
- `src/api/terminal.ts:1079`

### How Cursor Agent sends the first comment

Same as other Ralph-style providers: `startWork()` creates the initial progress comment.

Reference:

- `core/workflow.ts:210`

### How Cursor Agent moves through each step

It follows the same MCP sequence as Claude/Cursor, but in a headless terminal-style runtime:

1. Start via server bootstrap or `workflow.start-work`.
2. Create session with `session.create`.
3. Update session states.
4. Add `comment.add` test report.
5. Call `workflow.complete-work`.
6. Submit and resolve review findings.
7. Generate demo.
8. Complete session.

### What technology pushes the workflow along

- Prompt: same canonical Ralph prompt from `getRalphPrompt()`.
- Runtime launcher: `cursor-agent` CLI with `CURSOR_AGENT=1` exported for environment detection.
- MCP server/core logic: same shared engine.
- Optional/shared Cursor hook setup: same state-file-based enforcement model can be used here.

References:

- `mcp-server/lib/environment.ts:196`
- `README.md:286`
- `scripts/setup-cursor.sh:599`

## VS Code / Copilot Chat

### How VS Code starts the ticket

VS Code is instruction-driven rather than hook-driven.

- Brain Dump opens VS Code with a generated context file.
- Copilot Chat is guided by `.github/copilot-instructions.md`, prompts, and optional agents.
- The LLM is expected to call `workflow.start-work` itself unless the Brain Dump launch path already pre-bootstrapped state.

References:

- `docs/environments/vscode.md:33`
- `src/api/ralph.ts:362`
- `.github/copilot-instructions.md:7`

### How VS Code sends the first comment

The starting progress comment still comes from `startWork()` in core, not from freeform chat text.

Reference:

- `core/workflow.ts:210`

### How VS Code moves through each step

1. The LLM calls `workflow.start-work`.
2. The LLM calls `session.create`.
3. The LLM manually follows instructions to call `session.update-state`.
4. The LLM manually calls `comment.add` for the `test_report`.
5. The LLM calls `workflow.complete-work`.
6. The LLM runs review actions.
7. The LLM calls `review.generate-demo`.
8. The LLM calls `session.complete`.

### What technology pushes the workflow along

- Prompt/instructions: `.github/copilot-instructions.md` and prompt definitions.
- MCP server/core logic: the only real enforcer of state changes.
- No hooks: VS Code has no automatic pre-write blocker in this repo.
- Soft enforcement: invalid MCP actions fail with structured errors because the tool preconditions reject them.

References:

- `docs/environments/vscode.md:61`
- `docs/environments/vscode.md:101`
- `mcp-server/prompts/instructions.ts:13`

## Copilot CLI

### How Copilot CLI starts the ticket

Brain Dump launches Copilot CLI with the generated context prompt and prefers `--yolo` for Ralph-style autonomous sessions, falling back to broader tool approval flags only when needed for older CLI versions.

The LLM then calls:

- `workflow.start-work`
- `session.create`

References:

- `docs/environments/copilot-cli.md:55`
- `docs/environments/copilot-cli.md:102`
- `src/api/ralph-launchers.ts:266`

### How Copilot CLI sends the first comment

The first progress comment is still created by `startWork()` inside the shared core workflow.

Reference:

- `core/workflow.ts:210`

### How Copilot CLI moves through each step

1. Start ticket with `workflow.start-work`.
2. Create session with `session.create`.
3. Move through session states with `session.update-state`.
4. Add `comment.add` test report.
5. Call `workflow.complete-work`.
6. Submit findings, mark fixed, check complete.
7. Generate demo.
8. Complete session.

### What technology pushes the workflow along

- Prompt/context: Copilot CLI prompt and installed agents/skills.
- MCP server/core logic: shared workflow engine.
- Hook: `~/.copilot/hooks.json` can run `enforce-state-before-write.sh` before tool use.
- Environment detection: `COPILOT_CLI=1` in MCP config tells Brain Dump which author/provider is active.

References:

- `docs/environments/copilot-cli.md:221`
- `docs/environments/copilot-cli.md:260`
- `mcp-server/lib/environment.ts:47`
- `mcp-server/lib/environment.ts:150`

## Codex

### How Codex starts the ticket

Codex is started with a context file or prompt. The Brain Dump UI launch path can pre-bootstrap the ticket state server-side first, then open Codex.

References:

- `docs/environments/codex.md:31`
- `docs/environments/codex.md:33`
- `src/api/terminal.ts:901`
- `src/api/codex-launch.ts:14`

### How Codex sends the first comment

The initial progress comment still comes from `startWork()` in core.

Reference:

- `core/workflow.ts:210`

### How Codex moves through each step

Codex follows the same MCP workflow after launch:

1. `workflow.start-work`
2. `session.create`
3. `session.update-state`
4. `comment.add` test report
5. `workflow.complete-work`
6. Review actions
7. `review.generate-demo`
8. `session.complete`

### What technology pushes the workflow along

- Prompt/context file: the main guidance layer.
- MCP server/core logic: the actual workflow engine.
- MCP config: `~/.codex/config.toml` wires Codex to Brain Dump.
- No provider-specific hook/plugin enforcement is documented here the way Claude/Cursor/Copilot/OpenCode do it.

References:

- `docs/environments/codex.md:45`
- `mcp-server/lib/environment.ts:50`
- `mcp-server/lib/environment.ts:165`

## OpenCode

### How OpenCode starts the ticket

OpenCode can run Brain Dump through agent docs, AGENTS instructions, or the Ralph prompt, depending on launch mode.

Brain Dump also supports launching OpenCode with a project plus initial prompt/context.

References:

- `docs/environments/opencode.md:33`
- `src/api/ralph-script.ts:57`
- `src/api/terminal.ts:654`

### How OpenCode sends the first comment

Same shared mechanism: `startWork()` posts the starting progress comment.

Reference:

- `core/workflow.ts:210`

### How OpenCode moves through each step

1. OpenCode agent/prompt tells the LLM to call `workflow.start-work`.
2. The LLM calls `session.create`.
3. The LLM moves through session states.
4. The LLM adds the `test_report` comment.
5. The LLM calls `workflow.complete-work`.
6. The LLM uses review MCP actions.
7. The LLM calls `review.generate-demo`.
8. The LLM calls `session.complete`.

### What technology pushes the workflow along

- Prompt/agent docs: OpenCode agent instructions and project AGENTS guidance.
- MCP server/core logic: actual ticket mutation and validation.
- OpenCode plugins: can observe lifecycle events and can block dangerous actions like push-before-review.
- Environment detection: `OPENCODE=1` can be used to identify provider for comment authorship and telemetry.

Important nuance: current repo guidance says telemetry is handled by MCP self-instrumentation, even though older OpenCode docs also describe plugin event capture. So the authoritative workflow engine is MCP; plugins are optional provider-side helpers.

References:

- `docs/environments/opencode.md:53`
- `.opencode/plugins/brain-dump-review-guard.ts:1`
- `mcp-server/lib/environment.ts:46`
- `.opencode/AGENTS.md`

## Where the comments come from

There are three main comment sources across all providers:

1. Start-work progress comment
   Created automatically in `core/workflow.ts:startWork()`.

2. Test report comment
   The LLM must add this explicitly via `comment.add({ commentType: "test_report" })` before `complete-work`.

3. Work summary, review, and demo comments
   These are created by workflow/review logic when the MCP actions run.

References:

- `core/workflow.ts:210`
- `core/workflow.ts:346`
- `mcp-server/tools/review.ts:166`
- `mcp-server/tools/review.ts:265`
- `mcp-server/tools/comment.ts:63`

## Best explanation to give people

If you need the short explanation when presenting this:

1. The workflow itself is not owned by Claude, Cursor, Copilot, Codex, or OpenCode.
2. Brain Dump's MCP server and core workflow code are the real workflow engine.
3. Each provider differs only in how it guides or constrains the LLM:

- Claude Code, Cursor, and Copilot CLI use hooks.
- OpenCode uses plugins plus agent guidance.
- VS Code and Codex mostly rely on prompts, instructions, and MCP preconditions.

4. The same MCP actions move the ticket through `in_progress`, `ai_review`, and `human_review`.
5. The same core functions generate the audit comments and validations.

## Most important implementation references

- Canonical workflow prompt: `src/api/ralph-prompts.ts`
- Launch orchestration: `src/api/ralph.ts`
- Backend-specific Ralph execution: `src/api/ralph-script.ts`
- Provider launchers: `src/api/ralph-launchers.ts`
- Shared workflow core: `core/workflow.ts`
- Shared session core: `core/session.ts`
- Shared review core: `core/review.ts`
- MCP workflow tool: `mcp-server/tools/workflow.ts`
- MCP session tool: `mcp-server/tools/session.ts`
- MCP review tool: `mcp-server/tools/review.ts`
- MCP comment tool: `mcp-server/tools/comment.ts`
- Provider/environment detection: `mcp-server/lib/environment.ts`
