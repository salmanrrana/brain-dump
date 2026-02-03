# AI Review Guide

Detailed self-review checklist for Step 4 of the Brain Dump workflow.

## Self-Review Checklist

### Code Quality

- [ ] Code follows CLAUDE.md project patterns (Drizzle ORM, TanStack Query, etc.)
- [ ] No hardcoded values that should be constants
- [ ] No commented-out code or dead code
- [ ] Comments explain "why" not "what"
- [ ] Variable and function names are clear and descriptive
- [ ] No code duplication

### Type Safety

- [ ] `pnpm type-check` passes
- [ ] No `any` types (unless justified with a comment)
- [ ] All function parameters typed
- [ ] All return types explicit
- [ ] No implicit `undefined` cases

### Error Handling

- [ ] All try-catch blocks handle errors properly
- [ ] No silent error suppression (empty catch blocks)
- [ ] Database queries check for null/undefined
- [ ] API calls handle errors with user-friendly messages
- [ ] No swallowed errors

### Testing

- [ ] New code has tests that verify user-facing behavior
- [ ] Tests are not testing implementation details
- [ ] Edge cases tested
- [ ] `pnpm test` passes
- [ ] No brittle mocking

### Performance

- [ ] No N+1 queries
- [ ] Proper pagination for large datasets
- [ ] React components memoized appropriately
- [ ] No unnecessary re-renders
- [ ] Database indexes used correctly

## Review Agent Roles (Claude Code)

When using Claude Code, three review agents run in parallel:

1. **code-reviewer** -- Code quality, patterns, project guideline adherence
2. **silent-failure-hunter** -- Error handling, edge cases, silent failures
3. **code-simplifier** -- Unnecessary complexity, clarity, duplication

## Submitting Findings

For each issue found during review:

```
review "submit-finding"({
  ticketId: "<ticket-id>",
  agent: "code-reviewer",       // or "silent-failure-hunter" or "code-simplifier"
  severity: "major",            // critical | major | minor | suggestion
  category: "error-handling",   // type-safety | error-handling | performance | code-quality | testing
  description: "Clear description of the issue",
  filePath: "src/api/example.ts",
  lineNumber: 42,
  suggestedFix: "How to fix it"
})
```

## Fixing Findings

For each critical/major finding:

1. Make the code fix
2. Run `pnpm type-check && pnpm lint && pnpm test`
3. Commit: `fix(<ticket-id>): <description>`
4. Mark fixed: `review "mark-fixed"({ findingId: "<id>", status: "fixed", fixDescription: "..." })`

## Verifying Completion

After all critical/major issues are fixed:

```
review "check-complete"({ ticketId: "<ticket-id>" })
// Must return: { canProceedToHumanReview: true }
```

Only proceed to demo generation when `canProceedToHumanReview` is `true`.
