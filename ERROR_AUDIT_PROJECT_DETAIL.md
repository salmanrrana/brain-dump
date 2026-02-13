# Error Handling Audit: Project Detail Page (`src/routes/projects.$projectId.tsx`)

**Auditor**: Silent Failure Hunter
**Date**: 2026-02-13
**Severity**: 2 CRITICAL, 2 HIGH, 1 MEDIUM issues found

---

## Executive Summary

The project detail page has **unhandled query failures** and **silent navigation errors** that will confuse users when things go wrong. The `useTickets()` hook is called but its error state is completely ignored, and navigation callbacks don't handle promise rejections. While the 404 project-not-found UI is well implemented, the rest of the error handling infrastructure is missing.

---

## CRITICAL Issues

### 1. **useTickets() Error State Ignored - Silent Failure on Query Failure**

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/routes/projects.$projectId.tsx:16`

**Severity**: CRITICAL

**Issue**:

```typescript
const { tickets } = useTickets({ projectId });
```

The hook returns THREE pieces of information:

```typescript
return {
  tickets: query.data ?? [],
  loading: query.isLoading,
  error: query.error?.message ?? null, // <-- IGNORED
  refetch: query.refetch, // <-- IGNORED
};
```

**The Problem**:

- The destructuring only captures `tickets`, silently discarding the `error` and `refetch` return values
- If `useTickets()` fails (database error, API timeout, corrupted data), the page shows NO error UI
- Users see an empty epic list with no indication that data failed to load
- Developers won't know the query failed without opening DevTools and checking TanStack Query state

**Hidden Errors That Could Be Caught and Hidden**:

1. Database read errors (file descriptor limits, permission denied, corrupted SQLite)
2. Query malformation errors (invalid projectId format, filter parsing errors)
3. Data type mismatches (ticket schema evolved, old data is incompatible)
4. Timeout errors (hanging database locks, slow disk I/O)
5. Out-of-memory errors (very large projects with thousands of tickets)

**User Impact**:

- User opens project detail page
- Tickets fail to load due to database issue
- Page shows "No epics yet" even though epics exist but ticket count computation fails
- User thinks the project is empty or corrupted
- No action available (no retry button, no error message)

**Recommendation**:
Destructure and display the error state:

```typescript
const { tickets, error: ticketsError, loading: ticketsLoading, refetch: refetchTickets } = useTickets({ projectId });

// Show error UI if query failed
if (ticketsError) {
  return (
    <div style={containerStyles}>
      <div style={centeredContainerStyles}>
        <div style={errorContainerStyles}>
          <AlertCircle size={24} style={{ color: "var(--text-destructive)" }} />
          <p style={errorTitleStyles}>Failed to Load Tickets</p>
          <p style={errorDescriptionStyles}>{ticketsError}</p>
          <button
            type="button"
            style={accentButtonStyles}
            onClick={() => refetchTickets()}
            className="hover:bg-[var(--accent-primary)] hover:text-white"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}

// Show loading state while fetching
if (ticketsLoading) {
  return (
    <div style={containerStyles}>
      <div style={centeredContainerStyles}>
        <p style={{ color: "var(--text-secondary)" }}>Loading tickets...</p>
      </div>
    </div>
  );
}
```

---

### 2. **Unhandled Promise Rejection in Navigation Callbacks**

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/routes/projects.$projectId.tsx:35-48`

**Severity**: CRITICAL

**Issue**:
Three navigation callbacks call `navigate()` without error handling:

```typescript
const handleBack = useCallback(() => {
  navigate({ to: "/" }); // <-- Unhandled promise rejection
}, [navigate]);

const handleSelectEpic = useCallback(
  (epicId: string) => {
    navigate({ to: "/board", search: { project: projectId, epic: epicId } }); // <-- Unhandled
  },
  [navigate, projectId]
);

const handleViewAllTickets = useCallback(() => {
  navigate({ to: "/board", search: { project: projectId } }); // <-- Unhandled
}, [navigate, projectId]);
```

**The Problem**:

- TanStack Router's `navigate()` returns a Promise that can reject
- These callbacks ignore that promise completely
- If navigation fails (invalid route, router not ready, serialization error), the promise rejection goes unhandled
- Browser console shows "Uncaught (in promise)" error
- User is stuck on the page with no indication that navigation was attempted

**Hidden Errors That Could Be Caught and Hidden**:

1. Router initialization errors (router not mounted, state lost)
2. Route validation failures (search param serialization failed)
3. Guard rejections (if route has auth guards, they failed silently)
4. Serialization errors (projectId or epic epicId cannot be serialized to URL)
5. Memory errors during navigation (OOM while building route state)

**User Impact**:

- User clicks "Back to Projects", nothing happens
- User clicks "View All Tickets", navigation fails silently
- Browser console has unhandled promise rejection
- No feedback to user that something went wrong

**Recommendation**:
Handle promise rejections from `navigate()`:

```typescript
const handleBack = useCallback(async () => {
  try {
    await navigate({ to: "/" });
  } catch (error) {
    // Log the error with context for debugging
    logError("Navigation failed", {
      target: "/",
      error: error instanceof Error ? error.message : String(error),
    });
    // Show error toast to user
    showToast("error", "Failed to navigate back. Please try again.");
  }
}, [navigate, showToast]);

const handleSelectEpic = useCallback(
  async (epicId: string) => {
    try {
      await navigate({ to: "/board", search: { project: projectId, epic: epicId } });
    } catch (error) {
      logError("Navigation to board failed", {
        projectId,
        epicId,
        error: error instanceof Error ? error.message : String(error),
      });
      showToast("error", "Failed to navigate to board. Please try again.");
    }
  },
  [navigate, projectId, showToast]
);

const handleViewAllTickets = useCallback(async () => {
  try {
    await navigate({ to: "/board", search: { project: projectId } });
  } catch (error) {
    logError("Navigation to board failed", {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    showToast("error", "Failed to navigate to board. Please try again.");
  }
}, [navigate, projectId, showToast]);
```

Note: You'll need to import `useToast` from the Toast component and use a logging function (see CLAUDE.md: `logForDebugging` or `logError`).

---

## HIGH Issues

### 3. **openEpicModal() Error Not Caught or Logged**

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/routes/projects.$projectId.tsx:50-58`

**Severity**: HIGH

**Issue**:

```typescript
const handleEditEpic = useCallback(
  (epicId: string) => {
    const epic = project?.epics.find((e) => e.id === epicId);
    if (epic) {
      openEpicModal(projectId, epic); // <-- No error handling
    }
  },
  [project, projectId, openEpicModal]
);
```

**The Problem**:

- `openEpicModal()` is a simple state setter from useModal, so it won't throw
- BUT: The pattern sets a bad example - if openEpicModal ever becomes async (which it might if it starts fetching epic details), this code will silently ignore promise rejections
- More critically: the `epic.find()` result is checked but no logging happens if epic is not found
- If `epicId` is invalid, this silently does nothing with no feedback to user

**User Impact**:

- User clicks "Edit" on an epic
- Epic ID doesn't match (maybe data was deleted externally)
- Nothing happens - no error, no loading spinner, no feedback
- User thinks the button is broken

**Recommendation**:

1. Log when epic lookup fails
2. Show error toast to user
3. Prepare for if/when openEpicModal becomes async

```typescript
const { showToast } = useToast();

const handleEditEpic = useCallback(
  (epicId: string) => {
    const epic = project?.epics.find((e) => e.id === epicId);
    if (!epic) {
      // Log the problem for debugging
      logForDebugging("Epic not found for edit", {
        epicId,
        projectId,
        availableEpics: project?.epics.map((e) => e.id) || [],
      });
      // Inform user
      showToast("error", "Epic not found. It may have been deleted.");
      return;
    }
    openEpicModal(projectId, epic);
  },
  [project, projectId, openEpicModal, showToast]
);
```

---

### 4. **Epic Count Computation Could Fail with No Error Handling**

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/routes/projects.$projectId.tsx:25-33`

**Severity**: HIGH

**Issue**:

```typescript
const ticketCountByEpic = useMemo(() => {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    if (ticket.epicId) {
      counts.set(ticket.epicId, (counts.get(ticket.epicId) ?? 0) + 1);
    }
  }
  return counts;
}, [tickets]);
```

**The Problem**:

- If `tickets` array is malformed (contains nulls, has wrong schema), the loop silently skips those tickets
- If `ticket.epicId` is not a string but some other type, the Map key becomes non-string
- If the tickets array is somehow corrupted during serialization, this computation produces silent data loss
- No logging about skipped or malformed tickets

**Hidden Errors That Could Be Caught and Hidden**:

1. Database schema migration - old tickets with wrong epicId type
2. Data corruption - epicId is array or object instead of string
3. Type coercion issues - epicId is number instead of string
4. Null/undefined tickets in array that were supposed to be filtered out

**User Impact**:

- User sees incorrect ticket counts on epics
- Counts don't match the actual board
- Silent data inconsistency that's hard to debug

**Recommendation**:
Add validation and logging:

```typescript
const ticketCountByEpic = useMemo(() => {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    // Validate ticket structure
    if (!ticket || typeof ticket !== "object") {
      logForDebugging("Malformed ticket in count computation", { ticket });
      continue;
    }

    // Only count tickets with valid epicId
    if (ticket.epicId && typeof ticket.epicId === "string") {
      counts.set(ticket.epicId, (counts.get(ticket.epicId) ?? 0) + 1);
    }
  }
  return counts;
}, [tickets]);
```

---

## MEDIUM Issues

### 5. **Missing Loading State While Fetching Tickets**

**Location**: `/home/xtra/code/personal_projects/brain-dump/src/routes/projects.$projectId.tsx:16`

**Severity**: MEDIUM

**Issue**:
The page doesn't display loading state while tickets are being fetched. The `useTickets()` hook returns `loading` but it's not destructured or displayed.

```typescript
const { tickets } = useTickets({ projectId });
// Not showing: loading state, or loading indicator
```

**User Impact**:

- On first load or when reopening project detail, page is blank/unresponsive
- User doesn't know if data is loading, failed, or there are genuinely no tickets
- User might click back thinking the page is broken
- Poor UX - no feedback

**Recommendation**:
Show loading indicator while `ticketsLoading` is true:

```typescript
const { tickets, loading: ticketsLoading, error: ticketsError, refetch: refetchTickets } = useTickets({ projectId });

if (ticketsLoading) {
  return (
    <div style={containerStyles}>
      <div style={centeredContainerStyles}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ marginTop: "var(--spacing-2)", color: "var(--text-secondary)" }}>
          Loading project details...
        </p>
      </div>
    </div>
  );
}
```

---

## Positive Notes

**What's Done Well**:

1. **404 Project Not Found** (lines 65-85): ✅ Excellent error UI
   - Clear error message
   - Icon indicating error state
   - Recovery action (back button)
   - This is the pattern to follow for other errors

2. **Project Query Handled** (lines 20-22): ✅ Good
   - `useProjects()` error is not used, but at least project not-found is handled explicitly
   - The 404 UI makes this acceptable

---

## Testing Recommendations

After implementing these fixes, test these scenarios:

1. **Query Failure Testing**:
   - Temporarily corrupt the database file
   - Open project detail page
   - Verify error UI appears with retry button
   - Verify error is logged with context

2. **Navigation Failure Testing**:
   - Add temporary route validation that fails
   - Click navigation buttons
   - Verify error toast appears
   - Verify unhandled promise rejection does not appear in console

3. **Epic Lookup Failure**:
   - Add epic to database, delete it, then call `handleEditEpic()` with that ID
   - Verify error toast appears
   - Verify error is logged

4. **Malformed Data Testing**:
   - Modify database to add ticket with null epicId
   - Modify database to add ticket with numeric epicId instead of string
   - Open project detail page
   - Verify counts are computed correctly
   - Verify no console errors or silent failures

---

## References

**CLAUDE.md Error Handling Requirements**:

- "Never silently fail in production code"
- "Always log errors using appropriate logging functions"
- "Include relevant context in error messages"
- "Propagate errors to appropriate handlers"
- "Never use empty catch blocks"

**Related Files**:

- `/home/xtra/code/personal_projects/brain-dump/src/lib/browser-logger.ts` - Logging utility
- `/home/xtra/code/personal_projects/brain-dump/src/components/Toast.tsx` - useToast hook
- `/home/xtra/code/personal_projects/brain-dump/src/lib/hooks/projects.ts` - useProjects implementation (good error handling in mutations)
- `/home/xtra/code/personal_projects/brain-dump/src/lib/hooks/tickets.ts` - useTickets implementation

**Time Estimate to Fix**: 30-45 minutes

- Add error state handling: 10 min
- Add navigation error handling: 10 min
- Add loading state UI: 5 min
- Add validation to ticket count computation: 5 min
- Add error logging throughout: 10 min
- Manual testing: 10 min
