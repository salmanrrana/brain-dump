# Brain Dump Workflow - OpenCode Integration

This document guides AI agents working with Brain Dump projects in OpenCode.

## Overview: Universal Quality Workflow (UQW)

The Universal Quality Workflow is a **mandatory 4-phase workflow** that ensures all code goes through rigorous quality gates before human approval. Unlike traditional workflows, UQW treats AI review as a **quality enforcement gate** (not optional) that happens before any code is pushed.

**Key Principle**: All code must pass automated review and be verified to work before reaching humans.

### Why This Matters

Traditional development: Write → Push → Code Review → Fix

Brain Dump Ralph workflow: Write → **Automated Review** → Fix Issues → Demo → Human Approval → Push

This prevents pushing incomplete or low-quality code, saving review time and maintaining quality standards.

## Ralph Sessions: Entry Point to UQW

A **Ralph session** is your isolated work context for completing a single ticket. When you start working on a ticket:

1. **Ralph session is created** (tracks your progress through all 4 phases)
2. **`.claude/ralph-state.json` file is written** (tracks your current state)
3. **Plugins watch for state violations** (block Write/Edit unless state is valid)
4. **Telemetry starts capturing** (all tool usage, prompts, duration)

### When Ralph Sessions Start

Ralph sessions are **automatic** when you call `start_ticket_work`. Do NOT create them manually.

```
start_ticket_work({ ticketId: "a0b46674-873e-4540-941c-43249bc475de" })
↓
Creates: .claude/ralph-state.json
Creates: Ralph session record in database
Enabled: State enforcement plugins
Enabled: Telemetry capture
```

## Ralph State Machine: The 4 Phases

The Ralph workflow enforces **7 states** organized into **4 phases**:

```
Phase 1 (Implementation):
  idle → analyzing → implementing → testing → committing

Phase 2 (AI Review):
  in_progress → ai_review → [submit findings] → [fix issues] → [verify complete]

Phase 3 (Demo Generation):
  ai_review → [generate demo] → human_review

Phase 4 (Human Approval):
  human_review → [wait for submit_demo_feedback] → done
```

### States Explained

| State            | Purpose                  | What You Do                        | Can Write Code?  |
| ---------------- | ------------------------ | ---------------------------------- | ---------------- |
| **idle**         | Session just started     | Read spec, understand requirements | ❌               |
| **analyzing**    | Understanding phase      | Read ticket, PRD, existing code    | ❌               |
| **implementing** | Active development       | Write code, run tests, fix bugs    | ✅               |
| **testing**      | Verification phase       | Run full test suite, debug         | ✅               |
| **committing**   | Git operations           | Create commits                     | ✅               |
| **ai_review**    | Automated quality review | Review agents analyze, you fix     | ✅ (only fixing) |
| **reviewing**    | Final self-check         | Final review before demo           | ✅ (minor fixes) |

### Valid State Transitions

```
idle → analyzing                       (always allowed)
analyzing → implementing               (start coding)
implementing → testing                 (run tests)
testing → implementing                 (fix failures)
implementing → committing              (ready to commit)
committing → implementing              (continue work)
committing → reviewing                 (done implementing)
reviewing → implementing               (found issues)
reviewing → done                       (skip to done - rare)

[At complete_ticket_work boundary]
implementing/testing/committing/reviewing → ai_review  (move to phase 2)

[In ai_review phase]
ai_review → ai_review                  (stays until complete)

[At check_review_complete boundary]
ai_review → ready for generate_demo    (check returns complete: true)

[At generate_demo boundary]
ai_review → human_review               (auto-transition when demo generated)

[At submit_demo_feedback boundary]
human_review → done                    (human approves)
human_review → ai_review               (human rejects, need more fixes)
```

### CRITICAL: Only 3 States Allow Code Writing

The **state enforcement plugin blocks Write/Edit unless you're in one of these states**:

- ✅ `implementing` - Writing new code
- ✅ `testing` - Fixing test failures
- ✅ `committing` - (After implementing, before next phase)

If you try to write code in any other state, the plugin will **BLOCK** you with an error:

```
STATE ENFORCEMENT: You are in 'analyzing' state but tried to write/edit code.
You MUST first call: update_session_state({ sessionId: "xyz", state: "implementing" })
```

This is not a bug - it's the workflow ensuring you follow the proper sequence.

## Phase 1: Implementation (You Are Here Initially)

### Step 1: Start Work

Always start by calling `start_ticket_work`:

```typescript
start_ticket_work({ ticketId: "a0b46674-873e-4540-941c-43249bc475de" });
// Output: Branch created, session initialized, state = idle
```

This automatically:

- Creates a git branch: `feature/a0b46674-add-uqw-workflow-guidance`
- Initializes Ralph session with tracking
- Writes `.claude/ralph-state.json` with current state
- Enables state enforcement via plugins
- Starts telemetry capture

### Step 2: Analyze Requirements

Transition to `analyzing` state:

```typescript
update_session_state({
  sessionId: "34fc2df5-...",
  state: "analyzing",
  metadata: { message: "Reading ticket spec and understanding requirements" },
});
```

In this state:

- Read the ticket description carefully
- Review acceptance criteria
- Check any linked files or attachments
- Review CLAUDE.md for project patterns
- Ask questions if requirements are unclear

**Important**: You CANNOT write code yet. This prevents accidental changes while planning.

### Step 3: Write Code

Transition to `implementing` state:

```typescript
update_session_state({
  sessionId: "34fc2df5-...",
  state: "implementing",
  metadata: { message: "Writing code for feature X" },
});
```

Now you can:

- Edit existing files ✅
- Create new files ✅
- Write tests ✅
- Make commits ✅

If you're blocked by the state enforcement plugin, you're in the wrong state. Call `update_session_state` first.

### Step 4: Run Tests

Transition to `testing` state:

```typescript
update_session_state({
  sessionId: "34fc2df5-...",
  state: "testing",
  metadata: { message: "Running full test suite" },
});
```

Run quality checks:

```bash
pnpm type-check    # TypeScript type checking
pnpm lint          # Code style
pnpm test          # Unit tests
```

All must pass. If tests fail, go back to `implementing` to fix.

### Step 5: Commit

Transition to `committing` state:

```typescript
update_session_state({
  sessionId: "34fc2df5-...",
  state: "committing",
  metadata: { message: "Committing completed work" },
});
```

Create a commit with proper format:

```bash
git commit -m "feat(a0b46674): Add UQW workflow guidance to AGENTS.md"
#           ^^  ticket ID  ^^ description
```

Commit message format:

- `feat(id):` for new features
- `fix(id):` for bug fixes
- `refactor(id):` for refactoring
- `docs(id):` for documentation
- `test(id):` for test improvements

The commit tracking plugin will output:

```
═══════════════════════════════════════════════════════════════
[Brain Dump] Commit Tracking - Link to Ticket
═══════════════════════════════════════════════════════════════

Commit: a1b2c3d (feat: Add UQW workflow guidance)
Ticket: a0b46674

Suggested MCP command:
mcp__brain-dump__link_commit_to_ticket({
  ticketId: "a0b46674-873e-4540-941c-43249bc475de",
  commitHash: "a1b2c3d"
})

If PR exists on branch:
mcp__brain-dump__link_pr_to_ticket({
  ticketId: "a0b46674-873e-4540-941c-43249bc475de",
  prNumber: 123
})
═══════════════════════════════════════════════════════════════
```

You can copy-paste these commands to link your work.

### Step 6: Complete Implementation

When code is written, tested, and committed, mark implementation complete:

```typescript
complete_ticket_work({
  ticketId: "a0b46674-873e-4540-941c-43249bc475de",
  summary:
    "Created comprehensive AGENTS.md with full UQW guidance including state machine, error recovery, and AI review workflow",
});
```

This automatically:

- Validates: `pnpm type-check && pnpm lint && pnpm test` (must all pass)
- Moves ticket to `ai_review` status
- Creates a work summary comment
- Initializes `review_iteration: 1`
- Prepares for Phase 2: AI Review

**⚠️ CRITICAL**: If validation fails, fix the issues and try again.

## Phase 2: AI Review (Mandatory Quality Gate)

After completing implementation, you **MUST** perform AI review. This is not optional.

### Step 1: Run Review Agents

Three review agents analyze your code in parallel:

1. **code-reviewer** - Code quality, patterns, project guidelines
2. **silent-failure-hunter** - Error handling, edge cases, silent failures
3. **code-simplifier** - Unnecessary complexity, clarity, duplication

These agents focus on:

- **Type Safety**: All types correct, no `any` unless justified
- **Error Handling**: All errors handled, no silent failures
- **Edge Cases**: Boundary conditions handled correctly
- **Performance**: No unnecessary re-renders, efficient queries
- **Testing**: Tests cover user-facing behavior
- **Code Quality**: Clear naming, no duplication, follows patterns
- **Maintainability**: Comments explain "why", code is readable

### Step 2: Self-Review Checklist (For OpenCode)

Since OpenCode doesn't have access to external review agents, you must perform self-review:

```
Code Quality Review
─────────────────────────────────────────
□ Code follows CLAUDE.md project patterns
□ No hardcoded values (use constants)
□ No commented-out code
□ Comments explain "why" not "what"
□ Variable/function names are clear
□ No code duplication
□ No unnecessary complexity

Type Safety Review
─────────────────────────────────────────
□ TypeScript: pnpm type-check passes
□ No `any` types (unless justified with comment)
□ All function parameters typed
□ All return types explicit
□ No implicit `undefined` cases

Error Handling Review
─────────────────────────────────────────
□ All try-catch blocks handle errors properly
□ No silent error suppression
□ Database queries check for null/undefined
□ API calls handle errors
□ Error messages are user-friendly

Testing Review
─────────────────────────────────────────
□ New code has tests
□ Tests verify user behavior (not internals)
□ Edge cases tested
□ All tests pass: pnpm test
□ No brittle mocking

Performance Review
─────────────────────────────────────────
□ No N+1 queries
□ Proper pagination for large datasets
□ React components memoized appropriately
□ No unnecessary re-renders
□ Database indexes used correctly
```

### Step 3: Submit Findings

For each issue you find, submit a finding:

```typescript
submit_review_finding({
  ticketId: "a0b46674-873e-4540-941c-43249bc475de",
  agent: "code-reviewer", // Which review concern
  severity: "critical", // critical | major | minor | suggestion
  category: "type-safety", // type-safety | error-handling | performance | etc.
  description: "State file parsing doesn't validate required fields",
  filePath: ".opencode/plugins/brain-dump-state-enforcement.ts",
  lineNumber: 42,
  suggestedFix: "Add Zod schema to validate state file structure",
});
```

**Severity Guidelines**:

- **critical**: Bug that breaks functionality or causes crashes
- **major**: Bug that causes incorrect behavior or error handling issue
- **minor**: Code quality issue, not a bug
- **suggestion**: Nice-to-have improvement

**Even if no issues found**: Submit a summary comment with `add_ticket_comment`:

```typescript
add_ticket_comment({
  ticketId: "a0b46674-873e-4540-941c-43249bc475de",
  content:
    "## AI Review (Iteration 1)\n\nNo critical or major issues found.\n\n✅ Code follows project patterns\n✅ Type safety verified\n✅ Error handling complete\n✅ Tests pass",
  author: "ralph",
  type: "work_summary",
});
```

### Step 4: Fix Critical/Major Issues

For each critical or major finding:

1. Transition back to `implementing` state
2. Make code changes to fix the issue
3. Run `pnpm test` to verify fix
4. Commit the fix
5. Mark finding as fixed:

```typescript
mark_finding_fixed({
  findingId: "finding-abc-123",
  status: "fixed",
  fixDescription: "Added Zod validation schema to parse state file safely",
});
```

Loop until all critical/major findings are resolved.

### Step 5: Verify Review Complete

Check if all critical/major issues are resolved:

```typescript
check_review_complete({ ticketId: "a0b46674-873e-4540-941c-43249bc475de" });
// Returns: {
//   complete: true,
//   openCritical: 0,
//   openMajor: 0,
//   openMinor: 2,
//   canProceedToHumanReview: true
// }
```

The review marker plugin will automatically create `.claude/.review-completed` when this returns `complete: true`.

**⚠️ CRITICAL**: Cannot proceed to Phase 3 until this returns `canProceedToHumanReview: true`.

## Phase 3: Demo Generation

### Generate Demo Script

After review is complete, generate a demo script for human verification:

```typescript
generate_demo_script({
  ticketId: "a0b46674-873e-4540-941c-43249bc475de",
  steps: [
    {
      order: 1,
      description: "Start dev server with `pnpm dev`",
      expectedOutcome: "Server runs on localhost:4242 with no errors",
      type: "manual",
    },
    {
      order: 2,
      description: "Open `.opencode/AGENTS.md` in editor",
      expectedOutcome:
        "File contains all required sections: Overview, State Machine, State Enforcement, Phase 1-4 guidance",
      type: "visual",
    },
    {
      order: 3,
      description: "Search for 'STATE ENFORCEMENT' in file",
      expectedOutcome: "Found 1 result with clear error message example and fix instructions",
      type: "manual",
    },
    {
      order: 4,
      description: "Search for 'AI Review Workflow' in file",
      expectedOutcome: "Found section with complete workflow including MCP commands",
      type: "manual",
    },
    {
      order: 5,
      description: "Search for 'self-review checklist' in file",
      expectedOutcome:
        "Found comprehensive checklist for code quality, type safety, error handling, testing, performance",
      type: "visual",
    },
  ],
});
```

This automatically:

- Validates all critical/major findings are fixed
- Creates demo script record
- Moves ticket to `human_review` status
- Provides steps for human verification

## Phase 4: STOP AND WAIT FOR HUMAN APPROVAL

**⚠️ CRITICAL**: After `generate_demo_script` succeeds, **YOU MUST STOP**.

Do NOT:

- ❌ Call `submit_demo_feedback` (only humans can do this)
- ❌ Move ticket to `done` (only humans can do this)
- ❌ Start another ticket (complete your current one first)

The human reviewer will:

1. Run through demo steps
2. Verify functionality works
3. Call `submit_demo_feedback({ ticketId, passed: true, feedback: "..." })`
4. Ticket moves to `done`

Complete your Ralph session:

```typescript
complete_ralph_session({
  sessionId: "34fc2df5-...",
  outcome: "success",
});
```

Output `PRD_COMPLETE` if all tickets are done or in human_review.

## Common Errors & How to Fix Them

### Error: "STATE ENFORCEMENT: You are in 'analyzing' state..."

**Problem**: You tried to write/edit code but you're not in `implementing`, `testing`, or `committing` state.

**Fix**: Call `update_session_state` with the correct state:

```typescript
update_session_state({
  sessionId: "34fc2df5-8b42-4829-a9e2-ea42dd8b2c3d",
  state: "implementing",
});
// Then retry your Write/Edit operation
```

### Error: "CODE REVIEW REQUIRED before push"

**Problem**: You tried to push code but the review guard plugin detected uncommitted changes without a fresh review marker.

**Fix**: Run the review phase:

1. Ensure you're in `ai_review` status (call `complete_ticket_work` first if needed)
2. Perform self-review using the checklist above
3. Submit any findings: `submit_review_finding(...)`
4. Run `check_review_complete()` to verify all critical/major issues are fixed
5. The review marker plugin will create `.claude/.review-completed`
6. Now you can push

### Error: "Cannot generate demo - unresolved findings"

**Problem**: You called `generate_demo_script` but critical or major findings are still open.

**Fix**:

1. Get open findings: `get_review_findings({ ticketId, severity: 'critical' })`
2. For each finding, fix the code and call: `mark_finding_fixed({ findingId, status: 'fixed' })`
3. Verify: `check_review_complete({ ticketId })` must return `canProceedToHumanReview: true`
4. Now you can generate demo

### Error: "Cannot start ticket - previous ticket still in review"

**Problem**: You tried to start a new ticket but a previous ticket is still waiting for human approval in `human_review` status.

**Fix**:

1. Wait for human reviewer to approve the previous ticket via `submit_demo_feedback`
2. Or if the demo is approved, ticket will move to `done` automatically
3. Then you can start the new ticket

### Error: "Marker file is stale - fresh review needed"

**Problem**: The `.claude/.review-completed` marker exists but is older than 30 minutes. Code has changed since review.

**Fix**:

1. Run review again on the new changes
2. The marker will be updated with a fresh timestamp
3. Then push will work

## Workflow Decision Tree

When stuck, use this flowchart:

```
Are you at the start?
├─ YES: Call start_ticket_work()
└─ NO: Continue...

Are you in Ralph mode (do you see STATE ENFORCEMENT errors)?
├─ YES: You're in a Ralph session. Continue...
└─ NO: You might not be in proper Ralph mode. Verify .claude/ralph-state.json exists

Can you write code right now?
├─ YES (not blocked by state enforcement): You're in correct state
└─ NO (blocked): Call update_session_state({ state: 'implementing' })

Have you finished implementing and committed?
├─ YES: Call complete_ticket_work(ticketId, summary)
└─ NO: Keep implementing

Are you now in ai_review status?
├─ YES: Continue to review phase
└─ NO: Something went wrong with complete_ticket_work

Have you performed self-review?
├─ YES: Continue...
└─ NO: Use the self-review checklist above

Have you fixed all critical/major findings?
├─ YES: Call check_review_complete()
└─ NO: Fix them and mark as fixed

Does check_review_complete() return canProceedToHumanReview: true?
├─ YES: Call generate_demo_script()
└─ NO: You still have open critical/major findings

Did generate_demo_script() succeed?
├─ YES: STOP. Wait for human approval via submit_demo_feedback()
└─ NO: Check the error message for what needs fixing
```

## Why OpenCode Needs This Documentation

Unlike Claude Code which uses interactive shell hooks, OpenCode uses TypeScript plugins that **throw errors**. Here's why this guide is critical:

**Claude Code with Hooks**:

```
Claude: tries to write file
Hook: BLOCKS with inline error message
Claude: sees error, reads error message, calls specified MCP tool
Claude: retry succeeds
```

**OpenCode with Plugins**:

```
Claude: tries to write file
Plugin: throws Error("STATE ENFORCEMENT: ...")
Claude: sees error in chat
Claude: MUST READ THIS GUIDE to understand what to do
Claude: calls update_session_state() based on reading this guide
Claude: retry succeeds
```

Without this guide, OpenCode AI would see errors but wouldn't know how to recover.

## Key Differences from Claude Code

| Aspect            | Claude Code                           | OpenCode                      |
| ----------------- | ------------------------------------- | ----------------------------- |
| State Enforcement | Interactive hook feedback             | Error thrown to chat          |
| Recovery Path     | Hook message tells exactly what to do | Must read AGENTS.md           |
| Review Process    | External agents provide feedback      | Self-review with checklist    |
| Guidance Style    | Reactive (error → fix)                | Proactive (docs guide ahead)  |
| User Experience   | Guided step-by-step                   | More autonomous, pre-educated |

The key insight: **OpenCode AI must understand the full workflow upfront** (hence this document), while Claude Code AI learns interactively (hence the hooks).

## Available MCP Tools

All tools are automatically available through the Brain Dump MCP server:

### Ticket Management

- `start_ticket_work` - Begin working on a ticket
- `complete_ticket_work` - Mark ticket ready for review
- `list_tickets` - See available work
- `get_tickets_for_file` - Find tickets related to a file

### Review & Quality

- `submit_review_finding` - Post a code review finding
- `mark_finding_fixed` - Mark a finding as resolved
- `get_review_findings` - Get review findings for a ticket
- `check_review_complete` - Verify all critical issues are fixed

### Demo & Approval

- `generate_demo_script` - Create human review demo
- `get_demo_script` - Retrieve demo for a ticket
- `update_demo_step` - Update step status during review
- `submit_demo_feedback` - Human reviewer approval/rejection

### Telemetry

- `start_telemetry_session` - Begin tracking session
- `log_tool_event` - Record tool usage
- `log_prompt_event` - Record user prompts
- `end_telemetry_session` - Finalize session

### Project Management

- `list_projects` - See your projects
- `list_tickets` - See available tickets in project
- `create_ticket` - Create a new ticket
- `list_epics` - See project epics

## Best Practices

### 1. Start Work Properly

Always call `start_ticket_work` before implementation:

```
This creates a git branch and sets up tracking
Enables automatic telemetry capture (via plugin)
Links commits to the ticket
```

### 2. Commit Frequently

Create meaningful commits with the ticket ID:

```
git commit -m "feat(abc-123): Implement user authentication"
Commits are automatically linked to the ticket
```

### 3. Run Tests Before Completing

Always verify:

```
pnpm type-check    # TypeScript
pnpm lint          # Code style
pnpm test          # Unit tests
```

### 4. Complete Work Explicitly

Call `complete_ticket_work` when done:

```
This moves ticket to ai_review status
Triggers automatic AI review via agents
```

### 5. Fix Review Findings

For critical/major findings:

```
1. Read the finding description
2. Make fixes in code
3. Commit with `feat(ticket-id): Fix <issue>`
4. Test fixes: pnpm test
5. Mark finding as fixed: mark_finding_fixed(findingId)
```

### 6. Generate Demo When Ready

After all critical/major issues are fixed:

```
1. Analyze what needs human verification
2. Create demo steps covering:
   - Setup/prerequisites
   - Core functionality
   - Edge cases
   - Visual confirmation points
3. Call generate_demo_script with steps
4. Human reviewer will run demo
```

### 7. Learn from Completed Work

When ticket reaches 'done':

```
Extract learnings and update project docs
Call: reconcile_learnings({ ticketId, learnings })
```

## Code Quality Standards

Minimum requirements before completing work:

### Type Safety

- [ ] TypeScript: `pnpm type-check` passes
- [ ] No `any` types unless justified
- [ ] All function parameters typed
- [ ] All return types explicit

### Testing

- [ ] Unit tests for new functions
- [ ] Integration tests for workflows
- [ ] Tests verify user-facing behavior (not internals)
- [ ] `pnpm test` passes fully

### Code Style

- [ ] ESLint: `pnpm lint` passes
- [ ] No console.log in production code
- [ ] Comments explain "why" not "what"
- [ ] No dead code or commented-out lines

### Database (if schema changes)

- [ ] Migration file created: `pnpm db:generate`
- [ ] Migration runs: `pnpm db:migrate`
- [ ] Backup tested: `pnpm brain-dump backup` + restore

## Common Patterns

### Pattern: Feature Implementation

1. Start ticket: `start_ticket_work(ticketId)`
2. Implement feature in code
3. Add tests
4. Run: `pnpm type-check && pnpm lint && pnpm test`
5. Commit: `git commit -m "feat(id): Feature name"`
6. Complete: `complete_ticket_work(ticketId, summary)`
7. Fix review findings
8. Generate demo
9. Wait for human approval

### Pattern: Bug Fix

Same as feature, but commit message is `fix(id):` instead of `feat(id):`

### Pattern: Refactor

1. Create ticket for refactoring work
2. Make changes (no behavior changes)
3. Commit: `refactor(id): What changed`
4. Tests must all pass (no new test coverage needed for pure refactors)
5. Complete work

### Pattern: Documentation

1. Changes are NOT code changes
2. You may skip test execution
3. Commit: `docs(id): What was documented`

## Environment Variables

If using OpenCode plugin telemetry:

```bash
# Optional: Set project path if not auto-detected
CURSOR_PROJECT_DIR=/path/to/project

# Optional: Disable telemetry
BRAIN_DUMP_TELEMETRY_ENABLED=false
```

## Troubleshooting

### "Ticket not found"

- Use `list_tickets` to see available tickets
- Check ticket ID is spelled correctly
- Verify you're in the correct project

### "Cannot proceed - open critical findings"

- Review findings: `get_review_findings(ticketId, severity: 'critical')`
- Fix code for each finding
- Mark fixed: `mark_finding_fixed(findingId)`
- Only after all critical/major are fixed can you generate demo

### "Telemetry session not active"

- If using hooks: check hooks are installed
- If using plugin: plugin is running automatically
- Call `start_telemetry_session` manually if needed

## References

- **Spec**: `plans/specs/universal-quality-workflow.md`
- **MCP Tools**: `mcp-server/tools/`
- **Project CLAUDE.md**: Contains project-specific guidelines

## Questions?

Refer to the Brain Dump documentation at the project root:

- `CLAUDE.md` - Development guidelines
- `README.md` - Project overview
- `docs/` - Detailed documentation
