# Testing Guide

Complete testing reference following Kent C. Dodds' philosophy.

[← Back to CLAUDE.md](../CLAUDE.md)

---

## Core Philosophy

> **"The more your tests resemble the way your software is used, the more confidence they can give you."**
>
> — Kent C. Dodds

### The Single Most Important Question

**"What real user behavior does this test verify?"**

If you cannot answer this question with a concrete user action and expected outcome, DO NOT write the test.

---

## The Litmus Test

Before writing ANY test, ask yourself:

1. **Can a user trigger this?** (click, type, navigate, wait)
2. **Can a user see the result?** (text on screen, element appears/disappears, navigation occurs)
3. **Would a user report a bug if this broke?**

If the answer to all three is **YES**, write the test. Otherwise, don't.

---

## Test Categories

### ✅ GOOD Tests (Real User Behavior)

#### User Sees Loading → Data

```typescript
it("shows loading spinner then displays tickets when data loads", async () => {
  render(<TicketList projectId="123" />);

  // User sees loading state
  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  // User waits, then sees tickets
  await waitFor(() => {
    expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
  });
});
```

**Why this is good**: User actually experiences loading state, then sees data appear.

---

#### User Clicks → UI Changes

```typescript
it("moves ticket to done column when user clicks complete button", async () => {
  render(<KanbanBoard projectId="123" />);

  // User sees ticket in "In Progress"
  const ticket = screen.getByText("Implement feature X");
  expect(ticket.closest('[data-column="in_progress"]')).toBeInTheDocument();

  // User clicks "Complete" button
  await userEvent.click(screen.getByRole("button", { name: /complete/i }));

  // User sees ticket moved to "Done"
  await waitFor(() => {
    expect(ticket.closest('[data-column="done"]')).toBeInTheDocument();
  });
});
```

**Why this is good**: User performs action (click), sees visible result (ticket moves).

---

#### User Sees Error Message

```typescript
it("shows error message when ticket creation fails", async () => {
  // Mock API to return error
  server.use(
    http.post("/api/tickets", () => {
      return HttpResponse.json({ error: "Title is required" }, { status: 400 });
    })
  );

  render(<CreateTicketModal />);

  // User submits empty form
  await userEvent.click(screen.getByRole("button", { name: /create/i }));

  // User sees error message
  await waitFor(() => {
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });
});
```

**Why this is good**: User triggers error condition, sees error message.

---

#### User Input → Expected Output

```typescript
it("filters tickets when user types in search box", async () => {
  render(<TicketList projectId="123" />);

  // User sees all tickets initially
  expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
  expect(screen.getByText("Add dark mode")).toBeInTheDocument();

  // User types in search box
  await userEvent.type(screen.getByPlaceholderText(/search/i), "auth");

  // User sees filtered results
  await waitFor(() => {
    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
    expect(screen.queryByText("Add dark mode")).not.toBeInTheDocument();
  });
});
```

**Why this is good**: User performs action (typing), sees result (filtered list).

---

### ❌ BAD Tests (Implementation Details)

#### Testing Function Calls

```typescript
// ❌ BAD - User doesn't care if callback was called
it("calls onComplete callback when clicked", () => {
  const onComplete = vi.fn();
  render(<Button onComplete={onComplete} />);

  userEvent.click(screen.getByRole("button"));

  expect(onComplete).toHaveBeenCalled();
});
```

**Why this is bad**: User doesn't see or care about callbacks. Test the visible result instead.

**Fix**: Test what happens after the callback - does UI change? Does navigation occur?

---

#### Testing Internal State

```typescript
// ❌ BAD - User doesn't see internal state
it("sets isLoading to true during fetch", () => {
  const { result } = renderHook(() => useTickets());

  expect(result.current.isLoading).toBe(true);
});
```

**Why this is bad**: User doesn't check `isLoading` boolean. They see a spinner.

**Fix**: Test that loading spinner appears, then disappears when data loads.

---

#### Testing Console Output

```typescript
// ❌ BAD - User doesn't read console
it("logs error to console when parsing fails", () => {
  const consoleSpy = vi.spyOn(console, "error");
  parseData("invalid");

  expect(consoleSpy).toHaveBeenCalled();
});
```

**Why this is bad**: Console logs are for developers, not users.

**Fix**: Test the user-facing error message or fallback behavior.

---

#### Testing Implementation Details

```typescript
// ❌ BAD - User doesn't care about memoization
it("uses useMemo for expensive calculation", () => {
  // ... somehow verify useMemo is used
});
```

**Why this is bad**: Implementation detail. Refactoring breaks test even if behavior is same.

**Fix**: If performance matters, test the performance (benchmark). Otherwise, don't test it.

---

#### Testing CSS/Styles

```typescript
// ❌ BAD - User sees the result, not the class
it("applies correct className when selected", () => {
  render(<Ticket selected />);
  expect(screen.getByRole("article")).toHaveClass("bg-blue-500");
});
```

**Why this is bad**: Testing Tailwind class names, not visual result.

**Fix**: Use visual regression testing (screenshot comparison) if styling is critical. Otherwise, skip.

---

#### Testing Props

```typescript
// ❌ BAD - User doesn't interact with props
it("passes onClick handler to child component", () => {
  const onClick = vi.fn();
  const { container } = render(<Parent onClick={onClick} />);

  // ... somehow verify Child received onClick
});
```

**Why this is bad**: Props are internal wiring.

**Fix**: Test the behavior when user clicks the child component.

---

## Testing Patterns

### Integration Over Unit

**Prefer this**: Test components together as users experience them

```typescript
it("creates ticket and shows it in kanban board", async () => {
  render(<App />);

  // User clicks "New Ticket"
  await userEvent.click(screen.getByRole("button", { name: /new ticket/i }));

  // User fills form
  await userEvent.type(screen.getByLabelText(/title/i), "Test ticket");
  await userEvent.click(screen.getByRole("button", { name: /create/i }));

  // User sees ticket in board
  await waitFor(() => {
    expect(screen.getByText("Test ticket")).toBeInTheDocument();
  });
});
```

**Instead of this**: Testing components in isolation with mocks

```typescript
// ❌ Over-isolated
it("CreateTicketModal calls onSubmit", () => {
  const onSubmit = vi.fn();
  render(<CreateTicketModal onSubmit={onSubmit} />);
  // ...
});

it("KanbanBoard displays tickets from props", () => {
  render(<KanbanBoard tickets={mockTickets} />);
  // ...
});
```

---

### Real Database > Mocks

**Prefer this**: Use real SQLite database with test data

```typescript
import { db } from '../lib/db';
import { tickets } from '../lib/schema';

beforeEach(async () => {
  // Clear and seed database
  await db.delete(tickets);
  await db.insert(tickets).values([
    { id: '1', title: 'Test ticket', status: 'ready' },
  ]);
});

it("displays tickets from database", async () => {
  render(<TicketList projectId="123" />);

  await waitFor(() => {
    expect(screen.getByText("Test ticket")).toBeInTheDocument();
  });
});
```

**Instead of this**: Mocking database/ORM

```typescript
// ❌ Brittle mocks
vi.mock("../lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          all: vi.fn(() => [{ id: "1", title: "Test" }]),
        })),
      })),
    })),
  },
}));
```

---

### Test Behavior > Coverage

**Don't chase 100% coverage**. 80% coverage with meaningful tests beats 100% coverage with brittle tests.

**Example**: If refactoring doesn't break user behavior, tests shouldn't break either.

---

## Async Testing

### Always Use `waitFor`

```typescript
// ✅ GOOD - Waits for async operation
it("loads and displays tickets", async () => {
  render(<TicketList />);

  await waitFor(() => {
    expect(screen.getByText("Ticket 1")).toBeInTheDocument();
  });
});

// ❌ BAD - Race condition
it("loads and displays tickets", async () => {
  render(<TicketList />);

  // Might pass or fail depending on timing
  expect(screen.getByText("Ticket 1")).toBeInTheDocument();
});
```

---

### User Events Over fireEvent

```typescript
// ✅ GOOD - Simulates real user interaction
await userEvent.click(button);
await userEvent.type(input, "text");

// ❌ BAD - Lower-level, doesn't simulate real events
fireEvent.click(button);
fireEvent.change(input, { target: { value: "text" } });
```

`userEvent` more closely resembles real user behavior (hover, focus, blur, etc.).

---

## Test Organization

### Describe User Flows

```typescript
describe("Ticket creation flow", () => {
  it("creates ticket and shows success message", async () => {
    // ...
  });

  it("shows validation errors for invalid input", async () => {
    // ...
  });

  it("allows canceling without creating ticket", async () => {
    // ...
  });
});
```

---

### One Assertion Theme Per Test

```typescript
// ✅ GOOD - Clear, focused test
it("shows error message when API fails", async () => {
  // Setup
  // Action
  // Assert: error message visible
});

// ❌ BAD - Testing multiple unrelated things
it("ticket creation flow", async () => {
  // Creates ticket
  // Validates form
  // Updates cache
  // Shows notification
  // Navigates to ticket
  // ... too much
});
```

---

## Common Pitfalls

### Pitfall: Testing Implementation

```typescript
// ❌ BAD
it("uses TanStack Query for data fetching", () => {
  // Don't test that you're using a specific library
});
```

**Fix**: Test the behavior (loading → data), not the tool.

---

### Pitfall: Testing Library Code

```typescript
// ❌ BAD
it("React.useState updates state correctly", () => {
  // Don't test React's built-in hooks
});
```

**Fix**: Trust that React works. Test your components.

---

### Pitfall: Snapshot Tests for Everything

```typescript
// ⚠️ USE SPARINGLY
it("renders correctly", () => {
  const { container } = render(<Component />);
  expect(container).toMatchSnapshot();
});
```

**Why problematic**: Snapshots break on any change, even trivial ones. Hard to review.

**When snapshots are okay**:

- Error messages (ensure wording doesn't change accidentally)
- Generated code output
- Serialized data structures

---

## Running Tests

### Run All Tests

```bash
pnpm test
```

### Run Specific File

```bash
pnpm test src/lib/backup.test.ts
```

### Run Single Test

```bash
pnpm test -t "creates backup file"
```

### Watch Mode

```bash
pnpm test:watch
```

### UI Mode (Interactive)

```bash
pnpm test --ui
```

---

## E2E Testing (Playwright)

For critical user journeys, write E2E tests:

```typescript
// e2e/ticket-creation.spec.ts
test("user can create and view ticket", async ({ page }) => {
  // Navigate to app
  await page.goto("http://localhost:4242");

  // Click "New Ticket"
  await page.click('button:has-text("New Ticket")');

  // Fill form
  await page.fill('input[name="title"]', "E2E Test Ticket");
  await page.click('button:has-text("Create")');

  // Verify ticket appears
  await expect(page.locator("text=E2E Test Ticket")).toBeVisible();
});
```

**When to use E2E**:

- Critical paths (authentication, payment, etc.)
- Cross-browser compatibility
- Performance testing
- Visual regression

---

## Summary: The Rules

1. **Test user flows, not functions** - A user doesn't call `handleClick()`, they click a button
2. **Test visible outcomes, not internal state** - A user doesn't check `isLoading`, they see a spinner
3. **Test error messages, not error handling** - A user doesn't catch exceptions, they read error text
4. **Mock boundaries, not internals** - Mock the API, not the hook that calls it
5. **Fewer, meaningful tests > many trivial tests** - 8 real tests beat 21 implementation tests

---

## Further Reading

- [Testing Library Documentation](https://testing-library.com/)
- [Kent C. Dodds - Testing Blog](https://kentcdodds.com/blog/testing)
- [Common Testing Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Main documentation
- [Architecture](architecture.md) - System architecture
- [Workflows](workflows.md) - Ralph, Quality Pipeline
- [Troubleshooting](troubleshooting.md) - Common issues
- [Glossary](glossary.md) - Terminology
