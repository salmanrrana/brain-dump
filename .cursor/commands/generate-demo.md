---
name: generate-demo
description: Generate demo script for human review
---

Call `mcp__brain-dump__generate_demo_script` after AI review is complete.

This will:
- Create step-by-step manual testing instructions
- Move ticket to `human_review` status
- Block further work until human approval

Prerequisites:
- Ticket must be in `ai_review` status
- All critical/major review findings must be fixed
- `check_review_complete` must return `canProceedToHumanReview: true`

Example:
```
generate_demo_script({
  ticketId: "abc-123-...",
  steps: [
    { step: 1, description: "Run pnpm test src/feature.test.ts", expected: "All tests pass" },
    { step: 2, description: "Start dev server and navigate to /feature", expected: "Feature renders correctly" },
    { step: 3, description: "Click submit button", expected: "Form submits successfully" }
  ]
})
```
