# Retry Patterns and Configuration

This reference covers retry strategies and configuration options for error recovery in TanStack Query.

## Default Retry Behavior

TanStack Query retries failed queries 3 times with exponential backoff:

```typescript
// Default behavior (no config needed)
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  // retry: 3 (default)
  // retryDelay: exponential backoff (default)
});
```

## Configuring Retries

### Disable Retries

```typescript
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retry: false, // Never retry
});
```

### Custom Retry Count

```typescript
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retry: 5, // Retry up to 5 times
});
```

### Conditional Retries

Retry based on error type:

```typescript
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retry: (failureCount, error) => {
    // Don't retry on 4xx errors (client errors)
    if (error.status >= 400 && error.status < 500) {
      return false;
    }

    // Don't retry on 401 (unauthorized)
    if (error.status === 401) {
      return false;
    }

    // Retry up to 3 times for other errors
    return failureCount < 3;
  },
});
```

### Smart Retry Based on Error Type

```typescript
const retryHandler = (failureCount: number, error: Error) => {
  // Type guard for HTTP errors
  const httpError = error as { status?: number };

  // Never retry these errors
  const noRetryStatuses = [400, 401, 403, 404, 422];
  if (httpError.status && noRetryStatuses.includes(httpError.status)) {
    return false;
  }

  // Network errors - retry more aggressively
  if (error.name === "NetworkError") {
    return failureCount < 5;
  }

  // Server errors (5xx) - standard retry
  return failureCount < 3;
};

// Apply globally
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryHandler,
    },
  },
});
```

## Retry Delay Configuration

### Custom Delay

```typescript
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retryDelay: 1000, // Fixed 1 second delay
});
```

### Exponential Backoff (Default)

```typescript
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // 1s, 2s, 4s, 8s, 16s, 30s (capped)
});
```

### Linear Backoff

```typescript
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retryDelay: (attemptIndex) => attemptIndex * 1000,
  // 0s, 1s, 2s, 3s, ...
});
```

### Jittered Backoff (Prevent Thundering Herd)

```typescript
const jitteredDelay = (attemptIndex: number) => {
  const baseDelay = Math.min(1000 * 2 ** attemptIndex, 30000);
  const jitter = baseDelay * 0.2 * Math.random(); // 0-20% jitter
  return baseDelay + jitter;
};

const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  retryDelay: jitteredDelay,
});
```

## Global Retry Defaults

Set retry behavior for all queries:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on authentication errors
        if ((error as any).status === 401) {
          // Optionally trigger logout
          authService.logout();
          return false;
        }

        // Standard retry for others
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1, // Mutations typically retry once
    },
  },
});
```

## Mutation Retry Patterns

Mutations are more cautious with retries (default: 0):

```typescript
const mutation = useMutation({
  mutationFn: createTodo,
  retry: 2, // Retry failed mutations twice
  retryDelay: 1000,
});
```

### Idempotent Mutations Only

Only retry mutations that are idempotent:

```typescript
// SAFE to retry: Idempotent operations
const updateMutation = useMutation({
  mutationFn: (data) => api.put(`/todos/${data.id}`, data), // PUT is idempotent
  retry: 2,
});

// UNSAFE to retry: Non-idempotent operations
const createMutation = useMutation({
  mutationFn: (data) => api.post("/todos", data), // POST may create duplicates
  retry: 0, // Don't retry
});
```

## Network-Aware Retries

Adjust retry behavior based on network status:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // If offline, don't waste retries
        if (!navigator.onLine) {
          return false;
        }

        // Standard retry logic
        return failureCount < 3;
      },
    },
  },
});
```

## Retry with Circuit Breaker

Prevent hammering a failing service:

```typescript
// Simple circuit breaker
let failureCount = 0;
let circuitOpenUntil = 0;

const circuitBreakerRetry = (count: number, error: Error) => {
  const now = Date.now();

  // Check if circuit is open
  if (circuitOpenUntil > now) {
    return false; // Don't retry while circuit is open
  }

  // Track failures
  failureCount++;

  // Open circuit after too many failures
  if (failureCount >= 5) {
    circuitOpenUntil = now + 60000; // Open for 1 minute
    failureCount = 0;
    return false;
  }

  return count < 3;
};

// Reset failures on success (in global callback)
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onSuccess: () => {
      failureCount = 0;
    },
  }),
});
```

## Combining with refetchOnWindowFocus

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry on refocus even if previous retries failed
      refetchOnWindowFocus: "always",
      // But with reasonable retry limits
      retry: 3,
    },
  },
});
```

## Quick Reference

| Scenario      | retry           | retryDelay  |
| ------------- | --------------- | ----------- |
| Default       | 3               | Exponential |
| No retry      | false           | N/A         |
| Fast retry    | 3               | 500         |
| Careful retry | 2               | 2000+       |
| Mutation      | 0-1             | 1000        |
| Offline-aware | Custom function | Standard    |

## Anti-Patterns

### Retrying Non-Recoverable Errors

```typescript
// BAD: Retrying errors that won't change
retry: (failureCount, error) => {
  // 404 will never succeed, don't retry
  if (error.status === 404) return failureCount < 3; // Wasteful!

  return failureCount < 3;
};

// GOOD: Skip non-recoverable errors
retry: (failureCount, error) => {
  if (error.status === 404) return false; // Stop immediately
  return failureCount < 3;
};
```

### Aggressive Retries on Rate Limiting

```typescript
// BAD: Hammering a rate-limited endpoint
retry: 10,
retryDelay: 100, // Too fast!

// GOOD: Respect rate limits
retry: (failureCount, error) => {
  if (error.status === 429) {
    // Parse retry-after header if available
    return failureCount < 2
  }
  return failureCount < 3
},
retryDelay: (attemptIndex, error) => {
  if ((error as any).status === 429) {
    return 60000 // Wait a full minute on rate limit
  }
  return Math.min(1000 * 2 ** attemptIndex, 30000)
}
```
