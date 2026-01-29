---
name: submit-finding
description: Submit a code review finding
---

Call `mcp__brain-dump__submit_review_finding` to record issues found during AI review.

This is called by review agents (code-reviewer, silent-failure-hunter, code-simplifier) to report issues.

Example:
```
submit_review_finding({
  ticketId: "abc-123-...",
  agent: "code-reviewer",
  severity: "major",
  category: "security",
  description: "SQL injection vulnerability in user input handling",
  location: "src/api/users.ts:45",
  suggestion: "Use parameterized queries instead of string concatenation"
})
```

Severity levels: critical, major, minor, suggestion
