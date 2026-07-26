# Troubleshooting

Common errors and recovery steps for the Brain Dump workflow.

## "STATE ENFORCEMENT: You are in 'analyzing' state..."

**Problem**: You tried to write/edit code but you're not in a state that allows code writing.

**Fix**: Call the **session** tool:

```
action: "update-state"
sessionId: "<session-id>"
state: "implementing"
```

Then retry your Write/Edit operation. Only `implementing`, `testing`, and `committing` states allow code changes.

## "CODE REVIEW REQUIRED before push"

**Problem**: The review guard detected you're trying to push without completing review.

**Fix**:

1. Call the **workflow** tool with `action: "complete-work"` if not already in `ai_review`
2. Perform review (self-review or use review agents)
3. Submit findings via the **review** tool with `action: "submit-finding"`
4. Fix critical/major issues
5. Call the **review** tool with `action: "check-complete"` -- must return `canProceedToVerification: true`
6. Now you can push

## "Cannot proceed - open critical findings"

**Problem**: You tried to generate a demo but critical/major findings are still open.

**Fix**:

1. Get open findings: call the **review** tool with `action: "get-findings"`, `ticketId`, `severity: "critical"`
2. Fix each finding in code
3. Mark fixed: call the **review** tool with `action: "mark-fixed"`, `findingId`, `fixStatus: "fixed"`
4. Verify: call the **review** tool with `action: "check-complete"` -- must return `canProceedToVerification: true`
5. Now you can generate the demo

## "Ticket must be in ai_review to submit findings"

**Problem**: You tried to submit a review finding for a ticket not in `ai_review` status.

**Fix**: Call the **workflow** tool with `action: "complete-work"`, `ticketId`, and `summary` first to move the ticket to `ai_review`.

## A previous ticket sits in `ai_verification`

**Problem**: A ticket is in `ai_verification` awaiting runner certification.

**Fix**: Leave it to the runner — `ai_verification` tickets are the runner's, not yours, and `start-work` on a _different_ ticket is not blocked by them. If it stays stuck or blocked, see the verification recovery section below.

## Verification failed or blocked the ticket

**Problem**: The verification runner recorded failures, or the ticket is blocked with a verification reason.

**Fix** (the full recovery path):

1. Inspect what happened: **review** tool, `action: "get-verification-history"`, `ticketId` (run verdicts and evidence) and `action: "get-verification-job"`, `ticketId` (queued/running/blocked job state).
2. Fix the actual cause in code (or the demo spec / environment) and validate it with the project's own commands.
3. If the ticket is **blocked**: clear the blocker with `action: "resolve-verification-failure"` — requires `rootCause`, `classification` (connectivity | environment | demo-spec | product-defect | other), `fixCommits`, and `validation` (the exact commands and results proving the fix). This returns the ticket to `ai_review`.
4. Mark every verification finding your fix addressed: `action: "mark-fixed"`, `findingId`, `fixStatus: "fixed"`.
5. `action: "check-complete"` → must allow handoff, then `action: "generate-demo"` to re-enter verification.

For a legacy ticket stranded in the retired `human_review` status, use `action: "repair-legacy-handoff"`, which moves it to `ai_verification` (with a demo) or `ai_review` (without one).

## "Review loop limit" — ticket blocked after repeated review rounds

**Problem**: `complete-work` refused and blocked the ticket because it burned 3 implement → review rounds without reaching done (the review-round circuit breaker).

**Fix**: This needs a human decision. Read the open blocking findings, then either close disputed/hypothetical ones (`action: "mark-fixed"`, `fixStatus: "wont_fix"`) or fix the real issues, unblock the ticket (which resets the round budget), and re-run `complete-work` with a fresh test_report.

## "[severity gate]" note on a submitted finding

**Problem**: Your critical/major finding was recorded as `minor` — either the 5-open-blocker budget was full, or on a repair round the finding didn't touch a file changed since the last verification handoff.

**Fix**: Accept it. The observation is preserved and visible; it just doesn't block. Do not re-submit re-worded or at a different line.

## "Marker file is stale - fresh review needed"

**Problem**: The `.claude/.review-completed` marker is older than the hook's TTL (5 minutes for the Stop reminder, 30 minutes for the push gate). The hooks check marker age only.

**Fix**: Re-run `/review` on your current changes; the skill refreshes the marker when the pipeline finishes.

## "Ticket not found"

**Problem**: The ticket ID doesn't match any ticket in the database.

**Fix**:

- Call the **ticket** tool with `action: "list"` and `projectId` to see available tickets
- Verify the ticket ID is spelled correctly
- Confirm you're working in the correct project

## Decision Tree (When Stuck)

```
Are you at the start?
|-- YES: Call workflow tool, action: "start-work", ticketId: "<id>"
|-- NO: Continue...

Can you write code right now?
|-- YES (no enforcement errors): You're in the correct state
|-- NO (blocked): Call session tool, action: "update-state", state: "implementing"

Have you finished implementing and committed?
|-- YES: Call workflow tool, action: "complete-work", ticketId, summary
|-- NO: Keep implementing

Are you in ai_review status?
|-- YES: Continue to review phase
|-- NO: Call workflow tool, action: "complete-work" first

Have you fixed all critical/major findings?
|-- YES: Call review tool, action: "check-complete", ticketId
|-- NO: Fix them and call review tool, action: "mark-fixed"

Does check-complete return canProceedToVerification: true?
|-- YES: Call review tool, action: "generate-demo", ticketId, steps
|-- NO: Still have open critical/major findings

Did generate-demo succeed?
|-- YES: STOP. Wait for AI verification runner certification.
|-- NO: Check error message and fix the issue.
```
