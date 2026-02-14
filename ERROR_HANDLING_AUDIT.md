# Error Handling Audit Report

## Recent Code Changes (Commits ccd16b8, cc1ef3c)

**Date**: 2026-02-14
**Scope**: Homepage redesign with search, ProjectListItem component, and related changes
**Files Reviewed**:

- `src/routes/index.tsx` (Home component with project list and search)
- `src/components/projects/ProjectListItem.tsx` (Project list item component)
- `src/components/AppLayout.tsx` (Supporting error handling in related code)
- `src/components/navigation/IconSidebar.tsx` (Navigation with error handling)
- `src/lib/hooks/projects.ts` (Data fetching hooks)

---

## Summary

**Overall Assessment**: GOOD with minor areas for improvement

The recent changes show careful attention to error handling with explicit loading/error states in the UI. However, there are some areas where error visibility could be improved and one catch block that could be more specific.

**Critical Issues Found**: 0
**High Priority Issues Found**: 1
**Medium Priority Issues Found**: 3
**Low Priority Issues Found**: 1

---

## Detailed Findings

### 1. ISSUE: Broad Error Context Catch in IconSidebar

**Location**: `src/components/navigation/IconSidebar.tsx`, lines 81-91

**Severity**: HIGH (over-broad error catching)

**Issue Description**:
The IconSidebar component catches all errors from `useLocation()` without distinguishing between different error types. While the intent is to handle the router context not being available during testing, this catch block could hide unrelated errors that occur within `useLocation()` itself (e.g., memory errors, unexpected runtime errors).

**Code**:

```typescript
let currentPath: string;
try {
  const location = useLocation();
  currentPath = disableRouterIntegration ? (activePathProp ?? "/") : location.pathname;
} catch (error) {
  // Router context not available (testing without RouterProvider)
  // This is expected in tests but indicates a bug if seen in production
  if (process.env.NODE_ENV !== "production") {
    console.warn("[IconSidebar] Router context unavailable, using fallback path:", error);
  }
  currentPath = activePathProp ?? "/";
}
```

**Hidden Errors**: This catch block could hide:

- Unexpected runtime errors within `useLocation()` hook
- Type errors from accessing `location.pathname` on unexpected object shapes
- Memory/resource exhaustion errors
- Any other errors thrown during hook execution

**User Impact**:
Users on production would silently fall back to `activePathProp ?? "/"` without any indication that something went wrong. If the router context IS available in production but something else fails, the UI would appear to be working (showing the wrong active nav item) when a real problem occurred. Debugging would be extremely difficult because there's no indication an error occurred.

**Recommendation**:

1. Only catch the specific React Context error that occurs when RouterProvider is missing
2. Log more context in development
3. In production, if an unexpected error occurs, either re-throw it or log it with more visibility

**Fixed Code**:

```typescript
let currentPath: string;
try {
  const location = useLocation();
  currentPath = disableRouterIntegration ? (activePathProp ?? "/") : location.pathname;
} catch (error) {
  // In development, provide helpful guidance
  if (process.env.NODE_ENV !== "production") {
    // This happens when RouterProvider context is not available (normal for testing)
    if (error instanceof Error && error.message.includes("RouterProvider")) {
      console.warn("[IconSidebar] RouterProvider not available (expected in tests)");
    } else {
      // Unexpected error - still use fallback but log for debugging
      console.error("[IconSidebar] Unexpected error in useLocation:", error);
    }
  }
  // Fall back to prop or default
  currentPath = activePathProp ?? "/";
}
```

---

### 2. ISSUE: Missing Null/Undefined Guard on project.name in ProjectListItem

**Location**: `src/components/projects/ProjectListItem.tsx`, line 86

**Severity**: MEDIUM (potential silent rendering failure)

**Issue Description**:
The ProjectListItem component renders `project.name` in the h3 element without verifying it's not null or undefined. While the title attribute on line 73 handles this with `{project.name || "(Unnamed)"}`, the rendered content itself could display "undefined" or nothing if name is missing. The component should be consistent about handling missing names.

**Code**:

```typescript
<h3 style={nameStyles}>{project.name}</h3>
```

vs title:

```typescript
title={`${project.name || "(Unnamed)"} — ${project.path || "(Unknown path)"}`}
```

**User Impact**:
If a project somehow gets created with a null/undefined name (edge case but possible through API), the heading would render nothing or "undefined", creating a visually broken UI. Users won't understand what they're looking at.

**Recommendation**:
Apply the same fallback as the title attribute:

```typescript
<h3 style={nameStyles}>{project.name || "(Unnamed)"}</h3>
```

---

### 3. ISSUE: Unguarded Navigation in Home Component Click Handlers

**Location**: `src/routes/index.tsx`, lines 24-29

**Severity**: MEDIUM (missing error handling on navigation)

**Issue Description**:
The `handleSelectProject` function calls `navigate()` without any error handling. If navigation fails (e.g., project route doesn't exist, router context issue), the error is silent. Users would click a project and nothing would happen, with no feedback about the failure.

**Code**:

```typescript
const handleSelectProject = useCallback(
  (projectId: string) => {
    navigate({ to: "/projects/$projectId", params: { projectId } });
  },
  [navigate]
);
```

**Hidden Errors**:

- Navigation failure (route mismatch, invalid params)
- Router state issues
- Any errors thrown by TanStack Router during navigation

**User Impact**:
User clicks a project → nothing visible happens → confusion about whether the app is working. No error message, no loading indicator, no feedback.

**Recommendation**:
Add error handling to navigation:

```typescript
const handleSelectProject = useCallback(
  (projectId: string) => {
    navigate({ to: "/projects/$projectId", params: { projectId } }).catch((err) => {
      console.error(`Failed to navigate to project ${projectId}:`, err);
      // Could also show a toast: showToast('error', 'Failed to open project')
    });
  },
  [navigate]
);
```

Or wrap in try-catch if using async:

```typescript
const handleSelectProject = useCallback(
  async (projectId: string) => {
    try {
      await navigate({ to: "/projects/$projectId", params: { projectId } });
    } catch (err) {
      logError("project_navigation_failed", {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Show user-facing error
    }
  },
  [navigate]
);
```

---

### 4. ISSUE: Inconsistent Error State from useProjectsWithAIActivity

**Location**: `src/lib/hooks/projects.ts`, lines 118-153

**Severity**: MEDIUM (silent ticket loading failures)

**Issue Description**:
The `useProjectsWithAIActivity` hook combines errors from two separate queries (`projects` and `tickets`). When ticket loading fails, the hook logs the error but continues rendering the UI with a `ticketCount` of 0 for all projects. This creates misleading metadata - users see "0 tickets" when they should see an error state or "Unknown count".

**Code**:

```typescript
export function useProjectsWithAIActivity() {
  const { projects, loading, error, refetch } = useProjects();
  const { sessions } = useActiveRalphSessions();
  const { tickets, error: ticketsError, loading: ticketsLoading } = useTickets();

  // Determine overall loading/error state considering all queries
  const isLoading = loading || ticketsLoading;
  const overallError = error || ticketsError;

  // Log ticket loading errors for debugging
  if (ticketsError) {
    logger.error("Failed to load ticket counts for projects", new Error(ticketsError));
  }

  const projectsWithActivity = useMemo<ProjectWithAIActivity[]>(() => {
    const sessionCounts = countBy(Object.values(sessions), (s) => s.projectId);
    const ticketCounts = countBy(tickets, (t) => t.projectId); // Empty if tickets is []

    return projects.map((project) => {
      const activeSessionCount = sessionCounts.get(project.id) ?? 0;
      return {
        ...project,
        hasActiveAI: activeSessionCount > 0,
        activeSessionCount,
        ticketCount: ticketCounts.get(project.id) ?? 0, // Falls back to 0 on error
      };
    });
  }, [projects, sessions, tickets]);

  return {
    projects: projectsWithActivity,
    loading: isLoading,
    error: overallError,
    refetch,
  };
}
```

**User Impact**:

- User sees "0 tickets" when they should see "Unknown" or a warning
- The error is logged but the UI doesn't reflect it
- If ticket loading frequently fails, users never realize there's a systemic problem
- Users might think their projects actually have no tickets

**Recommendation**:
Either:

1. Propagate the ticket error separately so the UI can show "failed to load ticket counts"
2. Show "Unknown" as the ticket count when there's an error instead of "0"
3. Include error context in the returned data structure

```typescript
return {
  projects: projectsWithActivity,
  loading: isLoading,
  error: overallError,
  ticketsError: ticketsError || null, // Separate error for ticket counts
  refetch,
};
```

Then in the UI:

```typescript
// Show "Unknown" or an error indicator when ticket counts failed to load
const ticketDisplay = ticketsError ? "?" : project.ticketCount;
```

---

### 5. ISSUE: Missing Search Input Blur Handler

**Location**: `src/routes/index.tsx`, lines 107-114

**Severity**: LOW (minor UX issue, not a silent failure)

**Issue Description**:
The search input doesn't handle errors from the `setSearchQuery` function (though the function itself is just `setState` so unlikely to fail). However, there's no error recovery if the search box gets into an invalid state. This is low severity because it's a simple setState operation, but worth noting for completeness.

**User Impact**: Minimal - the search functionality is straightforward enough that errors are unlikely.

**Recommendation**: No change required; this is a low-risk area.

---

## Analysis of Positive Patterns

The code demonstrates several good error handling practices worth noting:

### 1. Explicit Loading and Error States (EXCELLENT)

**Location**: `src/routes/index.tsx`, lines 38-68

The Home component explicitly handles three states:

- Loading state (line 38-46)
- Error state (line 48-68) - with helpful "Try Again" button
- Success state (line 70+)

This is textbook good error handling. Users see clear feedback about what's happening.

### 2. Proper Error Logging in Hooks

**Location**: `src/lib/hooks/projects.ts`, lines 128-130

Good practice of logging errors with context.

### 3. Keyboard Event Prevention

**Location**: `src/lib/keyboard-utils.ts`, lines 42-51

Good handling of keyboard events with proper preventDefault to avoid unwanted scrolling on Space.

### 4. Mutation Error Handling with Rollback

**Location**: `src/lib/hooks/projects.ts`, lines 235-283

Excellent error handling in epic creation mutation with optimistic updates and rollback on failure.

---

## Recommendations Summary

### Priority 1: Fix (HIGH severity)

- [ ] **IconSidebar router error handling**: Make catch block more specific to avoid hiding unrelated errors

### Priority 2: Improve (MEDIUM severity)

- [ ] **ProjectListItem name display**: Add null coalescing for consistency with title attribute
- [ ] **Navigation error handling**: Add try-catch or error handlers to navigate() calls
- [ ] **useProjectsWithAIActivity**: Provide separate ticket loading error state to UI

### Priority 3: Consider (LOW severity)

- None at this time

---

## Testing Recommendations

To prevent regressions:

1. **Test navigation failures**: Mock TanStack Router to throw errors and verify error handling
2. **Test missing data**: Pass null/undefined names to ProjectListItem and verify rendering
3. **Test ticket loading failures**: Mock useTickets to return an error and verify UI shows meaningful feedback
4. **Test router context failures**: Verify IconSidebar gracefully handles missing RouterProvider

---

## Compliance with CLAUDE.md

The code generally adheres to project standards:

- ✅ Uses appropriate state management (TanStack Query hooks)
- ✅ Implements proper loading/error states in UI
- ✅ Logs errors with context
- ⚠️ Navigation error handling could be more explicit
- ⚠️ Catch blocks could be more specific

---

## Conclusion

The recent changes show thoughtful implementation of a homepage redesign with generally good error handling practices. The main areas for improvement are:

1. Making the IconSidebar error handling more specific
2. Adding error handling to navigation operations
3. Providing better visibility into ticket loading failures

None of these issues represent critical production problems, but addressing them would improve robustness and user experience.
