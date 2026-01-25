---
description: Generate demo script for human review approval
---

# Generate Demo Script

You are generating a demo script for a ticket that has passed AI review and is ready for human approval.

## Prerequisites

- Ticket must be in `ai_review` status
- All critical and major findings must be fixed
- `check_review_complete({ ticketId })` must return `canProceedToHumanReview: true`

## Steps

### Step 1: Verify Ticket is Ready

```
check_review_complete({ ticketId: "<ticket-id>" })
```

If not ready:

- Check for open critical/major findings
- Fix remaining issues first
- Re-run review if needed

### Step 2: Understand the Ticket

Read the ticket description and acceptance criteria:

```
# Get ticket details from start_ticket_work response or database
```

List the key functionality that needs to be demonstrated.

### Step 3: Design Demo Steps

Create a logical sequence of steps that:

1. **Setup**: Any prerequisites (start server, navigate to page)
2. **Happy Path**: Main functionality working as expected
3. **Edge Cases**: Any important edge cases from acceptance criteria
4. **Verification**: Final state verification

Each step should have:

- **order**: Step number (1, 2, 3...)
- **description**: What the reviewer should do
- **expectedOutcome**: What they should see/verify
- **type**: manual | visual | automated

### Step 4: Generate Demo Script

```
generate_demo_script({
  ticketId: "<ticket-id>",
  steps: [
    {
      order: 1,
      description: "Start the dev server with `pnpm dev`",
      expectedOutcome: "Server starts on http://localhost:4242",
      type: "manual"
    },
    {
      order: 2,
      description: "Open http://localhost:4242 in browser",
      expectedOutcome: "Brain Dump app loads with kanban board visible",
      type: "visual"
    },
    {
      order: 3,
      description: "Click on a ticket in the 'human_review' column",
      expectedOutcome: "Ticket modal opens showing demo panel",
      type: "manual"
    },
    {
      order: 4,
      description: "Verify the DemoPanel shows all demo steps",
      expectedOutcome: "Steps are listed with pass/fail buttons",
      type: "visual"
    },
    {
      order: 5,
      description: "Click 'Approve' after marking all steps passed",
      expectedOutcome: "Ticket moves to 'done' column",
      type: "manual"
    }
  ]
})
```

### Step 5: Confirm Transition

After generating the demo:

- Ticket status changes to `human_review`
- A progress comment is added: "Demo script generated with X steps"
- The Brain Dump UI will show the demo panel in the ticket detail

### Step 6: STOP and Wait

**DO NOT continue working.** The human reviewer must:

1. Open Brain Dump UI
2. Navigate to the ticket
3. Run through demo steps
4. Mark each step passed/failed
5. Submit feedback via `submit_demo_feedback`

## Demo Step Guidelines

### Good Demo Steps

```
✓ "Navigate to /projects/123/tickets"
  Expected: "Ticket list loads with filters visible"

✓ "Enter 'bug' in the search box"
  Expected: "Results filter to show only tickets containing 'bug'"

✓ "Click the delete button on ticket #42"
  Expected: "Confirmation modal appears asking for confirmation"
```

### Bad Demo Steps

```
✗ "Test the feature" (too vague)
✗ "Check it works" (no specific verification)
✗ "Run the tests" (use type: automated instead)
```

### Step Types

| Type      | When to Use                      | Example                              |
| --------- | -------------------------------- | ------------------------------------ |
| manual    | User performs an action          | "Click the submit button"            |
| visual    | User visually confirms something | "Verify the success message appears" |
| automated | System runs a command/test       | "Run `pnpm test` - all tests pass"   |

## Important

- Keep demo scripts concise (5-10 steps typically)
- Focus on acceptance criteria from the ticket
- Include both happy path and key edge cases
- Make steps specific and verifiable
- The human reviewer will use this to approve/reject the work

## After Demo Generation

The ticket is now in `human_review`. Possible outcomes:

1. **Approved**: Human calls `submit_demo_feedback({ passed: true })` → ticket moves to `done`
2. **Rejected**: Human calls `submit_demo_feedback({ passed: false, feedback: "..." })` → ticket stays in `human_review` with feedback for you to address

If rejected, read the feedback and iterate on the fix.
