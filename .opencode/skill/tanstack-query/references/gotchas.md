# TanStack Query Common Gotchas and FAQs

This reference covers frequently asked questions and common mistakes when using TanStack Query, based on TKDodo's FAQ article.

## FAQ: How can I pass parameters to refetch?

**Short answer**: Don't. Embrace the declarative approach.

Parameters are dependencies to the query. When dependencies change, the query automatically re-fetches with new parameters.

```typescript
// WRONG approach
const { refetch } = useQuery({
  queryKey: ["item"],
  queryFn: () => fetchItem(id),
});
// Trying to call refetch with new id - doesn't work!
refetch({ id: newId });

// CORRECT approach - parameters as state
const [selectedId, setSelectedId] = useState(initialId);

const { data } = useQuery({
  queryKey: ["item", selectedId],
  queryFn: () => fetchItem(selectedId),
});

// When you need different data, update the state
setSelectedId(newId); // This triggers a new query automatically
```

**Key insight**: "You don't really want a refetch: You want a new fetch for a different id!"

## FAQ: Why are updates not shown?

### Cause 1: Query Keys Not Matching

Query keys must match exactly. String `'1'` is different from number `1`.

```typescript
// These are DIFFERENT query keys!
queryKey: ["todos", "1"]; // string
queryKey: ["todos", 1]; // number

// Fix: Be consistent with types
// Use TypeScript and Query Key Factories to prevent mismatches
const todoQueries = {
  detail: (id: number) =>
    queryOptions({
      queryKey: ["todos", id] as const,
      queryFn: () => fetchTodo(id),
    }),
};
```

### Cause 2: Unstable QueryClient

Creating the QueryClient inside the component causes a new cache on every render:

```typescript
// BAD: New client = new cache = no data
function App() {
  const queryClient = new QueryClient() // Created every render!
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}

// GOOD: Stable client outside component
const queryClient = new QueryClient()
function App() {
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}

// ALSO GOOD: Using useState for SSR/microfrontends
function App() {
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}
```

## FAQ: Why should I use useQueryClient() instead of importing?

While importing the QueryClient directly works, `useQueryClient()` is preferred for:

1. **Consistency**: `useQuery` uses this hook internally
2. **Decoupling**: Context-based dependency injection allows testing with different configs
3. **Necessity**: Sometimes you must create the client inside App (SSR, microfrontends)

```typescript
// Acceptable but less flexible
import { queryClient } from "./queryClient";
queryClient.invalidateQueries({ queryKey: ["todos"] });

// Preferred approach
function MyComponent() {
  const queryClient = useQueryClient();
  queryClient.invalidateQueries({ queryKey: ["todos"] });
}
```

## FAQ: Why do I not get errors?

### Cause 1: Fetch API doesn't reject on HTTP errors

The built-in `fetch` doesn't reject on 4xx/5xx status codes:

```typescript
// BAD: fetch doesn't throw on 404/500
const fetchTodo = async (id: string) => {
  const response = await fetch(`/api/todos/${id}`);
  return response.json(); // No error even if 404!
};

// GOOD: Check response.ok and throw
const fetchTodo = async (id: string) => {
  const response = await fetch(`/api/todos/${id}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// ALSO GOOD: Use axios (throws by default)
const fetchTodo = async (id: string) => {
  const { data } = await axios.get(`/api/todos/${id}`);
  return data;
};
```

### Cause 2: Silent error catching

If you catch errors for logging without re-throwing, the Promise resolves successfully:

```typescript
// BAD: Error is swallowed
const fetchTodo = async (id: string) => {
  try {
    const response = await api.get(`/todos/${id}`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch:", error);
    // No return or re-throw = resolves with undefined
  }
};

// GOOD: Re-throw after logging
const fetchTodo = async (id: string) => {
  try {
    const response = await api.get(`/todos/${id}`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch:", error);
    throw error; // Re-throw so RQ knows about the error
  }
};
```

## FAQ: Why isn't the queryFn being called?

### Cause: initialData with staleTime

When `initialData` is provided and `staleTime` is set, data exists in cache and won't refetch until stale:

```typescript
// PROBLEMATIC: queryFn may never be called
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  initialData: [],
  staleTime: 5 * 60 * 1000, // Data is "fresh" for 5 minutes
});

// SOLUTION 1: Use placeholderData instead
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  placeholderData: [], // Shown while loading, doesn't prevent fetch
});

// SOLUTION 2: Mark initialData as immediately stale
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  initialData: [],
  initialDataUpdatedAt: 0, // Treat as stale immediately
});
```

## The Bad Parts: Tradeoffs to Consider

### No Normalized Caching

TanStack Query uses a document cache, not a normalized cache. Each query stores its complete response.

- **Impact**: Same entity updated in one query won't automatically update in others
- **Solution**: Use `invalidateQueries` or `setQueryData` to sync related queries
- **Alternative**: For GraphQL-heavy apps needing normalization, consider Apollo Client

### Not for Client-Only State

Using TanStack Query for synchronous UI state (toggles, theme, form state) is inefficient:

```typescript
// BAD: RQ for client state
const { data: theme } = useQuery({
  queryKey: ["theme"],
  queryFn: () => localStorage.getItem("theme"),
  staleTime: Infinity,
});

// GOOD: Use appropriate tools
// - useState for component state
// - useContext for shared state
// - Zustand/Jotai for global client state
const [theme, setTheme] = useState(() => localStorage.getItem("theme"));
```

### Learning Curve

The API can seem overwhelming. Start simple:

1. **Basic**: `useQuery` with `queryKey` and `queryFn`
2. **Intermediate**: Add `staleTime`, mutations, invalidation
3. **Advanced**: Optimistic updates, infinite queries, suspense

## Bundle Size Reality

The perception that TanStack Query has a "huge" bundle size is misleading:

- npm shows 700kb+ (includes source maps and codemods)
- Actual minified+gzipped size for core features: **under 10kb**
- Bundle size saved by code you don't write often outweighs the library cost

## Quick Checklist for Common Issues

| Issue              | Check                                              |
| ------------------ | -------------------------------------------------- |
| Data not updating  | Query keys matching exactly? QueryClient stable?   |
| No errors showing  | fetch checking response.ok? Not swallowing errors? |
| queryFn not called | Using initialData with staleTime?                  |
| Multiple requests  | staleTime too low? Multiple components mounting?   |
| Memory leaks       | gcTime too high? Disabled garbage collection?      |
