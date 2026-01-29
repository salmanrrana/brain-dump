# Automatic Query Invalidation Strategies

This reference covers patterns for automatic query invalidation after mutations, based on TKDodo's guidance.

## Why Automatic Invalidation?

Manual invalidation in every mutation is:

- Repetitive and error-prone
- Easy to forget
- Inconsistent across the codebase

Automatic invalidation centralizes this logic.

## Strategy 1: Global "Invalidate Everything"

The simplest approach - invalidate all queries after any mutation:

```typescript
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  }),
});
```

**Pros:**

- Dead simple
- Never miss stale data
- No configuration needed

**Cons:**

- Potentially wasteful (refetches unchanged data)
- May cause unnecessary loading states

**Best for:** Small apps, prototypes, apps with few queries

## Strategy 2: MutationKey-Based Filtering

Tie invalidation scope to mutation categories:

```typescript
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const mutationKey = mutation.options.mutationKey;

      if (mutationKey) {
        // Invalidate queries matching the mutation key
        queryClient.invalidateQueries({ queryKey: mutationKey });
      } else {
        // Mutations without keys invalidate everything
        queryClient.invalidateQueries();
      }
    },
  }),
});
```

Usage:

```typescript
// This mutation only invalidates ['issues'] queries
const createIssue = useMutation({
  mutationKey: ["issues"],
  mutationFn: (data) => api.post("/issues", data),
});

// This mutation invalidates everything (no key)
const updateSettings = useMutation({
  mutationFn: (data) => api.patch("/settings", data),
});
```

**Pros:**

- Granular control per mutation type
- Opt-in scoping

**Cons:**

- Need to remember to add mutationKey
- Still invalidates entire category

## Strategy 3: Exclude Static Queries

Some queries rarely change (config, static data). Exclude them from automatic invalidation:

```typescript
// Mark static queries with infinite staleTime
const configQuery = queryOptions({
  queryKey: ["config"],
  queryFn: fetchConfig,
  staleTime: Infinity, // This marks it as "static"
});

// Global handler excludes static queries
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          // Don't invalidate queries with infinite staleTime
          return query.options.staleTime !== Infinity;
        },
      });
    },
  }),
});
```

**Pros:**

- Static data never unnecessarily refetched
- Simple opt-out mechanism

**Cons:**

- Must remember to set staleTime: Infinity
- Queries with finite staleTime still all invalidated

## Strategy 4: Meta Field with Tags

Add an `invalidates` field to mutations for fine-grained control:

```typescript
// Extend mutation options with custom meta
declare module "@tanstack/react-query" {
  interface MutationMeta {
    invalidates?: QueryKey[];
  }
}

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const invalidates = mutation.meta?.invalidates;

      if (invalidates) {
        invalidates.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      } else {
        // Default: invalidate everything
        queryClient.invalidateQueries();
      }
    },
  }),
});
```

Usage:

```typescript
const createComment = useMutation({
  mutationFn: (data) => api.post("/comments", data),
  meta: {
    invalidates: [
      ["comments"],
      ["issues", issueId], // Also invalidate the parent issue
    ],
  },
});
```

**Pros:**

- Precise control per mutation
- Can invalidate unrelated queries
- Self-documenting

**Cons:**

- More verbose
- Must maintain invalidation lists

## Strategy 5: Selective Awaiting

Combine global "fire-and-forget" invalidation with local awaiting for critical updates:

```typescript
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      // Global: fire-and-forget invalidation
      queryClient.invalidateQueries();
    },
  }),
});

// Local: await specific refetch when needed
const createTodo = useMutation({
  mutationFn: (data) => api.post("/todos", data),

  onSuccess: async () => {
    // Wait for this specific query to refetch
    await queryClient.refetchQueries({
      queryKey: ["todos", "list"],
      type: "active",
    });
    // Now safe to navigate or show success
    navigate("/todos");
  },
});
```

**Pros:**

- Best of both worlds
- Global safety net + local precision
- Mutation stays pending until critical data ready

**Cons:**

- Mixed patterns can be confusing
- Need to understand difference between invalidate and refetch

## Strategy 6: Entity-Based Invalidation

For apps with clear entity relationships:

```typescript
// Define entity relationships
const entityRelations: Record<string, QueryKey[]> = {
  todos: [["todos"], ["projects"]],
  comments: [["comments"], ["issues"]],
  users: [["users"], ["teams"], ["projects"]],
};

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const entity = mutation.options.mutationKey?.[0] as string;

      if (entity && entityRelations[entity]) {
        entityRelations[entity].forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
    },
  }),
});
```

**Pros:**

- Centralized relationship definitions
- Automatic cascading invalidation
- Easy to understand data flow

**Cons:**

- Requires upfront relationship modeling
- May over-invalidate

## Comparison Table

| Strategy          | Complexity | Precision | Best For                          |
| ----------------- | ---------- | --------- | --------------------------------- |
| Global invalidate | Very Low   | None      | Small apps, prototypes            |
| MutationKey       | Low        | Category  | Medium apps                       |
| Exclude static    | Low        | Partial   | Apps with config data             |
| Meta tags         | Medium     | High      | Large apps, complex relationships |
| Selective await   | Medium     | High      | Critical UI updates               |
| Entity-based      | High       | High      | Domain-driven apps                |

## Best Practice: Start Simple, Add Complexity

1. **Start with global invalidation** - it's safe and simple
2. **Add exclusions** for static/config queries
3. **Use mutationKey** for clear categories (issues, users, etc.)
4. **Add meta tags** only when needed for specific cases

## Anti-Patterns to Avoid

### Over-Engineering Early

```typescript
// DON'T: Complex system for 5 mutations
const invalidationRules = new InvalidationEngine({
  rules: [...],
  middleware: [...],
  // 200 lines of config
})

// DO: Simple global invalidation
onSuccess: () => queryClient.invalidateQueries()
```

### Forgetting Invalidation

```typescript
// DON'T: Manual invalidation in each mutation
// Easy to forget, inconsistent

// DO: Centralized in MutationCache
```

### Mixing Patterns Randomly

```typescript
// DON'T: Some mutations use meta, some use key, some manual
// Confusing, hard to debug

// DO: Pick one primary strategy, use others sparingly
```
