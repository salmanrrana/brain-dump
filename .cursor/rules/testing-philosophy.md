---
description: "Kent C. Dodds testing philosophy - Test user behavior, not implementation"
alwaysApply: false
tags: ["testing", "quality", "tdd"]
---

# Testing Philosophy

**"The more your tests resemble the way your software is used, the more confidence they can give you."**

## The Single Most Important Question

**"What real user behavior does this test verify?"**

If you cannot answer with a concrete user action and expected outcome, **DO NOT write the test**.

## Good Tests (Write These)

Tests that verify real user behavior:

```typescript
// ✅ User sees loading state → User sees data
it("shows loading then displays tickets when data loads", () => {...});

// ✅ User clicks button → something visible happens
it("moves ticket to done column when user clicks complete", () => {...});

// ✅ User sees error message when something fails
it("shows error message when API request fails", () => {...});

// ✅ User input produces expected output
it("filters tickets when user types in search box", () => {...});
```

## Bad Tests (Don't Write These)

```typescript
// ❌ Testing that a function was called
it("calls onComplete callback when clicked", () => {...});

// ❌ Testing internal state
it("sets isLoading to true during fetch", () => {...});

// ❌ Testing that console.log was called
it("logs error to console when parsing fails", () => {...});

// ❌ Testing implementation details
it("uses useMemo for expensive calculation", () => {...});

// ❌ Testing CSS/styles
it("applies correct className when selected", () => {...});

// ❌ Testing props are passed correctly
it("passes onClick handler to child component", () => {...});
```

## The Litmus Test

Before writing ANY test, ask yourself:

1. **Can a user trigger this?** (click, type, navigate, wait)
2. **Can a user see the result?** (text on screen, element appears/disappears, navigation occurs)
3. **Would a user report a bug if this broke?**

If the answer to all three is YES, write the test. Otherwise, don't.

## Rules

1. **Test user flows, not functions** - A user doesn't call `handleClick()`, they click a button
2. **Test visible outcomes, not internal state** - A user doesn't check `isLoading`, they see a spinner
3. **Test error messages, not error handling** - A user doesn't catch exceptions, they read error text
4. **Mock boundaries, not internals** - Mock the API, not the hook that calls it
5. **Fewer, meaningful tests > many trivial tests** - 8 real tests beat 21 implementation tests

## Integration Over Unit

- Test components together as users experience them
- Real database fixtures with actual schema
- Don't mock excessively - test real behavior where possible
- Tests that fail when user-facing behavior breaks
- Ask: "Does this test catch bugs users would encounter?"

## Coverage is Meaningless

- 100% code coverage ≠ 100% user flow coverage
- Chase user flow coverage, not line coverage
- If a line of code can't be reached by a user action, it's dead code

## References

- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [Common Testing Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
