---
name: ralph-autonomous
description: Use this skill when Ralph is working autonomously through Brain Dump backlogs. Covers ticket selection, implementation patterns, and autonomous workflow management.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: autonomous
---

# Ralph Autonomous Workflow

This skill guides Ralph when working autonomously through Brain Dump backlogs without direct user supervision.

## Autonomous Mode Principles

### Core Philosophy

- **No User Input Required**: Ralph makes decisions independently
- **Context-Driven**: Uses PRD and progress files for guidance
- **Incremental Progress**: One ticket per session, verify completion
- **Self-Documenting**: Logs all decisions and progress via MCP

### Decision Framework

Ralph evaluates tickets based on:

1. **Priority** (high > medium > low)
2. **Dependencies** (foundational work first)
3. **Complexity** (quick wins vs major features)
4. **Current Context** (progress from previous sessions)

## Canonical Workflow

The workflow sequence is generated from the canonical Brain Dump workflow spec.

<!-- BEGIN GENERATED: workflow-sequence -->

## Generated Workflow

Status flow: `backlog -> ready -> in_progress -> ai_review -> ai_verification -> done`

### Step 1: Implementation

start-work -> create or reuse a session -> implement -> validate -> commit -> complete-work. Skip this phase only when the selected ticket is already in ai_review.

- `workflow({ action: "start-work", ticketId })`
- `session({ action: "create", ticketId }) or session({ action: "get", ticketId })`
- `comment({ action: "add", ticketId, content, commentType: "test_report" })`
- `workflow({ action: "complete-work", ticketId, summary })`

### Step 2: AI Review

Start with get-review-context: it returns the acceptance criteria, work history, the exact in-scope changed-file list, prior findings (never re-file resolved ones), and the blocking-findings budget. Review only the in-scope files for regressions, acceptance gaps, and maintainability (reuse existing patterns; keep junior-readable). Submit only concrete NEW blocking findings, fix critical/major findings, then check completion.

- `review({ action: "get-review-context", ticketId })`
- `review({ action: "submit-finding", ticketId, agent, severity, category, description })`
- `review({ action: "mark-fixed", findingId, fixStatus: "fixed" })`
- `review({ action: "check-complete", ticketId })`

### Step 3: Demo

Generate 3-7 test steps after review completion, including criterion coverage references plus automation specs for visual/automated UI, API, command, or file checks. Before API/UI steps, inspect the target project's docs and build/runtime config and declare app.start as spawn-safe argv (with {port}/{host} tokens and optional project-relative cwd); never assume npm or pnpm. Every acceptance criterion must be proven by executable automation — coverageRationale is rejected at generate-demo. If a required command is outside the default allowlist (make, go, npx, ...), declare its exact argv in the project's .brain-dump/verify.json commands array; if a criterion cannot be automated, reword the criterion to match what automation can prove. This moves the ticket to ai_verification for runner certification.

- `review({ action: "generate-demo", ticketId, steps }) with covers references and automation specs on visual/automated steps`

### Step 4: Stop

STOP after generate-demo. generate-demo already completed the ticket's active sessions during the verification handoff — an explicit session complete afterwards is unnecessary (though harmless if called: it returns the recorded completion). Never run verification or move the ticket to done yourself.



### Implementation Discipline

- Before editing, map each acceptance criterion to the existing production entry point and nearby tests. Search for components, helpers, services, and patterns that already own the behavior.
- Extend or reuse the established implementation instead of adding a parallel path. New shared logic must be wired through the real production caller; replace superseded ticket-owned logic rather than leaving two competing implementations.
- Keep the diff minimal and match the codebase's existing style. Prefer explicit code a junior engineer can trace; use the smallest local or established abstraction that removes concrete duplication, never a speculative framework or dependency.
- Preserve existing behavior outside the ticket and add focused regression coverage at the changed boundary. Before handoff, inspect the final diff for dead code, duplicate logic, and acceptance criteria implemented only in tests but not reachable in production.

### Validation Gates

- Before complete-work: Discover and run this project's validation commands from docs/config.
- Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.
- Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.
- If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.
- Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.
- Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.
- For API/UI demo steps, inspect README/AGENTS/CLAUDE docs plus native build files and declare one app.start argv that actually boots this project on {port}; do not infer every app is Node-based.
- Before authoring a demo, read the project's .brain-dump/verify.json (if present) and reuse its exact start command and declared commands; never hardcode a port or loopback origin — the runner boots on a random free port.
- In UI demo steps, waitFor a selector that only exists once real data has rendered (a populated row, not a static heading) before clicking or asserting; a mutation fired against a still-loading page settles every widget into an error state.
- Do not assert live third-party data (e.g. a fresh 'Last fetched' timestamp) unless the verification environment seeds it; assert the honest empty/error copy or an API-level contract instead.
- To prove a file was deleted, use a file step with a notExists assertion — never contains/notContains against a missing file; for grep-style command steps, set expectedExitCode to what the command actually returns.
- Before session completion, generate-demo must have been called and the ticket must be in ai_verification.
- If verification blocked the ticket and you have fixed and validated the cause, call review resolve-verification-failure (rootCause, classification, fixCommits, validation) to clear the blocker and return the ticket to ai_review. Then mark each open verification finding addressed by the fix as fixed before check-complete — never leave a fixed ticket blocked.

### Hard Guards

- Do not use local substitutes for Brain Dump MCP/CLI workflow actions.
- Do not skip review check-complete before generate-demo.
- Do not run verification yourself.
- Do not move tickets to done yourself.
- Do not continue to another ticket after demo handoff.

<!-- END GENERATED: workflow-sequence -->

### Ticket Selection Algorithm

```typescript
// Pseudo-code for Ralph's selection logic
function selectTicket(prdTickets: PrdTicket[]): Ticket {
  // Filter: only tickets Ralph still needs to advance
  const incomplete = prdTickets.filter((t) => !t.passes);

  // plans/prd.json does not include live Brain Dump status. Fetch each
  // incomplete ticket before applying status-aware selection rules.
  const tickets = incomplete.map((t) => ticket.get({ ticketId: t.id }));

  // Resume AI review before starting fresh implementation work.
  const inReview = tickets.filter((t) => t.status === "ai_review");
  if (inReview.length > 0) {
    return inReview[0];
  }

  // Sort by priority, then dependencies
  const runnable = tickets.filter((t) => ["backlog", "ready", "in_progress"].includes(t.status));
  const sorted = runnable.sort((a, b) => {
    if (a.priority !== b.priority) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return dependencyCount(a) - dependencyCount(b);
  });

  // Choose optimal ticket
  return sorted[0]; // Highest priority, least blocked
}
```

## Intelligent Decision Making

### When Stuck on Implementation

```bash
# Log the issue (valid commentType values: comment, work_summary, test_report, progress, change_request)
brain-dump comment add --ticket <ticketId> --content "Blocked: [specific issue]." --type progress

# Note it in plans/progress.txt for the next iteration, then stop this
# iteration. The Ralph loop (not you) decides what runs next; never start a
# second ticket inside one invocation.
```

### Handling Dependencies

If selected ticket has unmet dependencies:

1. **Check if dependency ticket exists**

   ```bash
   dependency_tickets = tickets.filter(t =>
     selectedTicket.dependencies.includes(t.id)
   )
   ```

2. **If dependency exists** → Work on dependency first
3. **If dependency missing** → Create dependency ticket

### Scope Creep Prevention

```bash
# Before starting implementation
verify_ticket_scope(ticket) {
  estimated_time = estimate_complexity(ticket)
  if (estimated_time > 4_hours) {
    # Break into smaller tickets
    split_ticket(ticket)
    return smallest_piece()
  }
}
```

## Code Implementation Patterns

### Read Before Writing

```bash
# Always understand existing patterns
find_similar_implementations(ticket.description)
read_existing_components(ticket.related_area)
```

### Minimal Changes

- Only implement what's in acceptance criteria
- No "gold plating" or extra features
- Follow existing conventions exactly

### Testing Requirements

```typescript
// Every ticket must pass these checks
interface TicketCompletion {
  validation_run: boolean; // project-specific validation was run or explicitly unavailable
  validation_summary: string; // exact pass/fail/skipped results
  acceptance_met: boolean; // All AC items verified
  no_regressions: boolean; // No existing functionality broken
}
```

## Progress Tracking

### Session Logging

Ralph automatically logs:

```bash
# Ticket decisions and progress use commentType "progress"
brain-dump comment add --ticket <ticketId> --content "Selected ticket: <title>. Reason: <reason>" --type progress

brain-dump comment add --ticket <ticketId> --content "Completed: <component>. Next: <next step>" --type progress

# Validation results use commentType "test_report" (required before complete-work)
brain-dump comment add --ticket <ticketId> --content "pnpm check: pass; pnpm test src/x.test.ts: pass" --type test_report
```

### Progress Updates in File

```bash
# plans/progress.txt - persistent context
echo "$(date): Ralph completed ticket ${ticketId}" >> plans/progress.txt
echo "Next session context: ${next_priorities}" >> plans/progress.txt
```

## Quality Assurance

### Pre-Completion Checklist

Before calling `workflow "complete-work"()`:

```typescript
const completion_checklist = {
  code_quality: verify_style_conventions(),
  error_handling: verify_error_boundaries(),
  performance: no_performance_regressions(),
  documentation: updated_docs_if_needed(),
  testing: all_tests_passing(),
  acceptance: all_criteria_met(),
};

if (!completion_checklist.all_true()) {
  fix_remaining_issues();
}
```

### Self-Correction

If Ralph makes mistakes:

1. **Detect** through testing or review
2. **Log** the issue transparently
3. **Correct** immediately
4. **Document** lessons learned

## Emergency Procedures

### MCP Server Down

Stop and report the MCP outage. Do not create local branches, update statuses, or continue ticket work through local substitutes.

### Database Issues

Stop and report the database error. Workflow state must remain auditable through Brain Dump tools.

## Optimization Patterns

### Learning from History

Ralph improves over time by analyzing:

- Previous implementation choices
- Common blockers and patterns
- Estimation accuracy
- Code quality feedback

### Batch Operations

When multiple similar tickets exist:

```typescript
// Batch similar work for efficiency
similar_tickets = find_similar_tickets(current);
if (similar_tickets.length > 1) {
  implement_common_base();
  complete_individual_variants();
}
```

## Communication Style

### Autonomous Updates

Ralph provides updates without being asked:

- Every 30 minutes during long tasks
- When major decisions are made
- When blockers are encountered
- Before moving to next ticket

### Transparency

All decision-making is documented:

```bash
comment "add"(ticketId,
  `Decision: Chose approach X over Y because:
  1. Performance: 50% faster
  2. Maintainability: Less code
  3. Compatibility: Works with existing system`,
  "ralph",
  "decision")
```

## Session Completion

### Final Status Report

When all tickets are complete:

```bash
echo "PRD_COMPLETE"  # Signal completion

# Generate summary
comment "add"("project-complete",
  `All ${total_tickets} tickets completed.
  Total time: ${elapsed_time}.
  Key achievements: ${highlights}`,
  "ralph",
  "summary")
```

### Handoff Preparation

```bash
# Prepare for next session
update_progress_file_with_next_steps()
identify_remaining_dependencies()
suggest_priorities_for_next_session()
```

## Troubleshooting

### Common Issues

1. **Ticket selection conflicts** → Use priority matrix
2. **Implementation ambiguity** → Choose simplest approach that meets AC
3. **Test failures** → Fix before proceeding
4. **Scope creep** → Split ticket or defer features

### Recovery Patterns

- Never skip a ticket without logging why
- Always leave the codebase in a working state
- Document any temporary workarounds

This skill ensures Ralph works effectively and autonomously while maintaining high code quality and transparency.
