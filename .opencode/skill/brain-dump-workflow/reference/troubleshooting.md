# Troubleshooting

Common errors and recovery steps for the Brain Dump workflow.

## "STATE ENFORCEMENT: You are in 'analyzing' state..."

**Problem**: You tried to write/edit code but you're not in a state that allows code writing.

**Fix**: Call `update_session_state` with the correct state:

```
update_session_state({
  sessionId: "<session-id>",
  state: "implementing"
})
```

Then retry your Write/Edit operation. Only `implementing`, `testing`, and `committing` states allow code changes.

## "CODE REVIEW REQUIRED before push"

**Problem**: The review guard detected you're trying to push without completing review.

**Fix**:

1. Call `complete_ticket_work` if not already in `ai_review`
2. Perform review (self-review or use review agents)
3. Submit findings via `submit_review_finding`
4. Fix critical/major issues
5. Run `check_review_complete({ ticketId })` -- must return `canProceedToHumanReview: true`
6. Now you can push

## "Cannot proceed - open critical findings"

**Problem**: You tried to generate a demo but critical/major findings are still open.

**Fix**:

1. Get open findings: `get_review_findings({ ticketId, severity: "critical" })`
2. Fix each finding in code
3. Mark fixed: `mark_finding_fixed({ findingId, status: "fixed" })`
4. Verify: `check_review_complete({ ticketId })` must return `canProceedToHumanReview: true`
5. Now you can generate the demo

## "Ticket must be in ai_review to submit findings"

**Problem**: You tried to submit a review finding for a ticket not in `ai_review` status.

**Fix**: Call `complete_ticket_work({ ticketId, summary })` first to move the ticket to `ai_review`.

## "Cannot start ticket - previous ticket still in review"

**Problem**: A previous ticket is in `human_review` status awaiting human approval.

**Fix**: Wait for the human reviewer to approve or reject the previous ticket via `submit_demo_feedback`. Then start your new ticket.

## "Marker file is stale - fresh review needed"

**Problem**: The `.claude/.review-completed` marker is older than 30 minutes or code changed since review.

**Fix**: Re-run the review process on your current changes. The marker will be refreshed.

## "Ticket not found"

**Problem**: The ticket ID doesn't match any ticket in the database.

**Fix**:

- Use `list_tickets({ projectId })` to see available tickets
- Verify the ticket ID is spelled correctly
- Confirm you're working in the correct project

## Decision Tree (When Stuck)

```
Are you at the start?
|-- YES: Call start_ticket_work({ ticketId })
|-- NO: Continue...

Can you write code right now?
|-- YES (no enforcement errors): You're in the correct state
|-- NO (blocked): Call update_session_state({ state: "implementing" })

Have you finished implementing and committed?
|-- YES: Call complete_ticket_work({ ticketId, summary })
|-- NO: Keep implementing

Are you in ai_review status?
|-- YES: Continue to review phase
|-- NO: Call complete_ticket_work first

Have you fixed all critical/major findings?
|-- YES: Call check_review_complete({ ticketId })
|-- NO: Fix them and mark_finding_fixed

Does check_review_complete return canProceedToHumanReview: true?
|-- YES: Call generate_demo_script({ ticketId, steps })
|-- NO: Still have open critical/major findings

Did generate_demo_script succeed?
|-- YES: STOP. Wait for human approval.
|-- NO: Check error message and fix the issue.
```
