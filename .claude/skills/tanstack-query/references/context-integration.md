# TanStack Query with React Context

This reference covers patterns for integrating TanStack Query with React Context, based on TKDodo's guidance.

## Core Principle

React Context is a **dependency injection tool**, not a state manager. Use it to make implicit dependencies explicit.

## The Implicit Dependency Problem

When multiple child components rely on parent-fetched data, accessing queries directly creates hidden dependencies:

```typescript
// PROBLEMATIC: Implicit dependency
function UserProfile() {
  // Parent must have fetched this already, but it's not explicit
  const { data: user } = useQuery(userQueries.current())

  return <div>{user?.name}</div> // user could be undefined
}

// If parent changes or component moves, this silently breaks
```

## Solution: Context for Dependency Injection

### Pattern: Context Provider with Query

Create a context provider that handles data fetching and only passes defined data to children:

```typescript
// 1. Define the context
interface UserContextValue {
  user: User
  updateUser: (updates: Partial<User>) => void
}

const UserContext = createContext<UserContextValue | null>(null)

// 2. Create the provider
function UserProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useQuery(userQueries.current())
  const updateMutation = useMutation({...})

  // Handle loading and error states at provider level
  if (isLoading) return <UserSkeleton />
  if (error) return <UserError error={error} />
  if (!user) return null // Type narrowing

  // Only render children when data is guaranteed
  return (
    <UserContext.Provider value={{
      user, // user is User, not User | undefined
      updateUser: updateMutation.mutate,
    }}>
      {children}
    </UserContext.Provider>
  )
}

// 3. Create a hook with invariant check
function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within UserProvider')
  }
  return context
}

// 4. Use in components - user is guaranteed to exist
function UserProfile() {
  const { user } = useUser() // user: User (not undefined!)
  return <div>{user.name}</div>
}
```

## TypeScript Safety

Add invariant checks to context hooks for proper type narrowing:

```typescript
function useUser() {
  const context = useContext(UserContext);

  // This throw enables TypeScript to narrow the type
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }

  return context; // TypeScript knows context is UserContextValue
}
```

## When to Use This Pattern

### Good Use Cases

- **User authentication data**: Almost always needed, loading once is fine
- **Organization/tenant context**: Required across many components
- **Permissions data**: Needed for conditional rendering throughout app
- **Configuration that affects many components**: Theme, feature flags

### When NOT to Use

- **Data that's only needed in one component tree**: Just use useQuery directly
- **Frequently refetched data**: Context causes entire subtree to re-render
- **Optional data**: If components can work without it, don't force it through context

## Trade-offs

### Advantages

1. **Explicit dependencies**: Clear where data comes from
2. **Type-safe data access**: No null checks needed in consumers
3. **Centralized loading/error handling**: Handle once in provider
4. **Refactoring-safe**: Moving components within provider is safe

### Disadvantages

1. **Potential network waterfalls**: Provider must load before children
2. **Re-render propagation**: Context changes re-render all consumers
3. **Overhead for simple cases**: More code for straightforward data access

## Suspense Alternative (v5+)

`useSuspenseQuery` provides type-safe guaranteed data without context overhead:

```typescript
// No context needed - Suspense handles loading state
function UserProfile() {
  const { data: user } = useSuspenseQuery(userQueries.current())
  // data is User, not User | undefined
  return <div>{user.name}</div>
}

// Parent handles loading with Suspense
<Suspense fallback={<UserSkeleton />}>
  <UserProfile />
</Suspense>
```

This is often simpler than context for data that's truly required.

## Single Source of Truth

Important: Context isn't "state syncing." The query remains the authoritative source:

```typescript
// WRONG: Duplicating state
function UserProvider({ children }) {
  const { data } = useQuery(userQueries.current());
  const [user, setUser] = useState(data); // Don't do this!

  useEffect(() => {
    setUser(data); // Syncing state = bugs
  }, [data]);
}

// CORRECT: Query is the source of truth
function UserProvider({ children }) {
  const { data: user } = useQuery(userQueries.current());
  // Pass data directly, don't copy to separate state
}
```

## Complete Example

```typescript
// queries.ts
export const organizationQueries = {
  current: () => queryOptions({
    queryKey: ['organization', 'current'],
    queryFn: fetchCurrentOrganization,
    staleTime: 5 * 60 * 1000,
  }),
}

// OrganizationContext.tsx
interface OrganizationContextValue {
  organization: Organization
  members: Member[]
  isAdmin: boolean
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { data: organization, isLoading, error } = useQuery(
    organizationQueries.current()
  )

  if (isLoading) return <OrgSkeleton />
  if (error) return <OrgError error={error} />
  if (!organization) return null

  const isAdmin = organization.members.some(
    m => m.userId === currentUserId && m.role === 'admin'
  )

  return (
    <OrganizationContext.Provider value={{
      organization,
      members: organization.members,
      isAdmin,
    }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider')
  }
  return context
}

// Usage in components
function OrgSettings() {
  const { organization, isAdmin } = useOrganization()

  if (!isAdmin) return <AccessDenied />

  return <SettingsForm organization={organization} />
}
```

## Summary

| Approach           | Best For                                     |
| ------------------ | -------------------------------------------- |
| Direct useQuery    | Optional data, localized fetching            |
| Context + useQuery | Required data, many consumers, explicit deps |
| useSuspenseQuery   | Required data, simpler than context          |
