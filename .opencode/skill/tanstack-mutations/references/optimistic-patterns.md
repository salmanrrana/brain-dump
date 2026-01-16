# Advanced Optimistic Update Patterns

This reference covers advanced scenarios for optimistic updates in TanStack Query.

## The Window of Inconsistency Problem

When multiple mutations target the same entity, the first mutation's invalidation refetch can complete before the second mutation finishes, causing UI flicker.

### Example: Rapid Toggle

```
User clicks toggle → Mutation 1 starts → UI shows "completed"
User clicks toggle again → Mutation 2 starts → UI shows "not completed"
Mutation 1 finishes → Refetch starts
Refetch completes → UI shows "completed" (wrong! should show "not completed")
Mutation 2 finishes → UI finally correct
```

### Solution: Query Cancellation + Limited Invalidation

```typescript
const toggleTodo = useMutation({
  mutationKey: ["todos", "toggle"],

  mutationFn: (id: string) => api.patch(`/todos/${id}/toggle`),

  onMutate: async (id) => {
    // CRITICAL: Cancel any running queries that could overwrite our update
    await queryClient.cancelQueries({
      queryKey: ["todos", "detail", id],
    });

    const previousTodo = queryClient.getQueryData(["todos", "detail", id]);

    queryClient.setQueryData(["todos", "detail", id], (old: Todo) => ({
      ...old,
      completed: !old.completed,
    }));

    return { previousTodo };
  },

  onError: (err, id, context) => {
    if (context?.previousTodo) {
      queryClient.setQueryData(["todos", "detail", id], context.previousTodo);
    }
  },

  onSettled: (data, error, id) => {
    // CRITICAL: Only invalidate if this is the LAST mutation in flight
    // isMutating returns count BEFORE current mutation is removed
    if (queryClient.isMutating({ mutationKey: ["todos", "toggle"] }) === 1) {
      queryClient.invalidateQueries({ queryKey: ["todos", "detail", id] });
    }
  },
});
```

## Updating Multiple Caches

When an entity appears in multiple queries:

```typescript
const updateTodo = useMutation({
  mutationFn: (updates: Partial<Todo>) => api.patch(`/todos/${todo.id}`, updates),

  onMutate: async (updates) => {
    await queryClient.cancelQueries({ queryKey: ["todos"] });

    // Snapshot all affected caches
    const previousDetail = queryClient.getQueryData(["todos", "detail", todo.id]);
    const previousList = queryClient.getQueryData(["todos", "list"]);

    // Update detail cache
    queryClient.setQueryData(["todos", "detail", todo.id], (old: Todo) => ({
      ...old,
      ...updates,
    }));

    // Update list cache
    queryClient.setQueryData(["todos", "list"], (old: Todo[] | undefined) =>
      old?.map((t) => (t.id === todo.id ? { ...t, ...updates } : t))
    );

    return { previousDetail, previousList };
  },

  onError: (err, updates, context) => {
    // Rollback all caches
    if (context?.previousDetail) {
      queryClient.setQueryData(["todos", "detail", todo.id], context.previousDetail);
    }
    if (context?.previousList) {
      queryClient.setQueryData(["todos", "list"], context.previousList);
    }
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["todos"] });
  },
});
```

## Creating Items Optimistically

For create operations, generate a temporary ID:

```typescript
const createTodo = useMutation({
  mutationFn: (newTodo: Omit<Todo, "id">) => api.post("/todos", newTodo),

  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ["todos", "list"] });

    const previousList = queryClient.getQueryData(["todos", "list"]);

    // Create optimistic todo with temporary ID
    const optimisticTodo: Todo = {
      ...newTodo,
      id: `temp-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    queryClient.setQueryData(["todos", "list"], (old: Todo[] | undefined) =>
      old ? [...old, optimisticTodo] : [optimisticTodo]
    );

    return { previousList, optimisticTodo };
  },

  onError: (err, newTodo, context) => {
    if (context?.previousList) {
      queryClient.setQueryData(["todos", "list"], context.previousList);
    }
  },

  onSuccess: (createdTodo, variables, context) => {
    // Replace optimistic todo with real one
    queryClient.setQueryData(["todos", "list"], (old: Todo[] | undefined) =>
      old?.map((t) => (t.id === context?.optimisticTodo.id ? createdTodo : t))
    );
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["todos", "list"] });
  },
});
```

## Deleting Items Optimistically

```typescript
const deleteTodo = useMutation({
  mutationFn: (id: string) => api.delete(`/todos/${id}`),

  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ["todos"] });

    const previousList = queryClient.getQueryData(["todos", "list"]);

    // Remove from list optimistically
    queryClient.setQueryData(["todos", "list"], (old: Todo[] | undefined) =>
      old?.filter((t) => t.id !== id)
    );

    // Also remove detail cache
    queryClient.removeQueries({ queryKey: ["todos", "detail", id] });

    return { previousList };
  },

  onError: (err, id, context) => {
    if (context?.previousList) {
      queryClient.setQueryData(["todos", "list"], context.previousList);
    }
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["todos", "list"] });
  },
});
```

## When to Avoid Optimistic Updates

### Complex Filtering/Sorting

If server applies complex logic (filtering, sorting, pagination), optimistic updates require replicating that logic:

```typescript
// Server does: filter by category, sort by date, paginate
// To update optimistically, you'd need to:
// 1. Apply same filter
// 2. Apply same sort
// 3. Handle pagination correctly

// Often better to just show loading and invalidate
const addTodo = useMutation({
  mutationFn: createTodo,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["todos"] });
  },
});
```

### Dependent Calculations

If other data depends on the mutated value:

```typescript
// If updating a todo affects:
// - Project completion percentage
// - User's task count
// - Team statistics

// Optimistic update would need to update all of these
// Usually better to just invalidate and let server recalculate
```

## Complexity Checklist

Before implementing optimistic updates, consider:

| Factor          | Simple (do optimistic) | Complex (avoid optimistic)     |
| --------------- | ---------------------- | ------------------------------ |
| Cache locations | Single query           | Multiple related queries       |
| Transform       | Direct mapping         | Server-side filtering/sorting  |
| Dependencies    | None                   | Other queries depend on result |
| Frequency       | Occasional             | Rapid successive updates       |
| Rollback        | Easy                   | Complex state restoration      |

## Pattern: Optimistic with Fallback

Combine optimistic updates with graceful degradation:

```typescript
const updateTodo = useMutation({
  mutationFn: updateTodoApi,

  onMutate: async (updates) => {
    // Try optimistic update
    try {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const previous = queryClient.getQueryData(["todos", "detail", id]);
      queryClient.setQueryData(["todos", "detail", id], (old: Todo) => ({
        ...old,
        ...updates,
      }));
      return { previous };
    } catch {
      // If optimistic update fails, continue without it
      return { previous: null };
    }
  },

  onError: (err, updates, context) => {
    if (context?.previous) {
      queryClient.setQueryData(["todos", "detail", id], context.previous);
    }
  },

  onSettled: () => {
    // Always sync with server
    queryClient.invalidateQueries({ queryKey: ["todos"] });
  },
});
```
