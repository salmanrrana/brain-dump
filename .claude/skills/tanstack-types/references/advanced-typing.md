# Advanced Type Safety Patterns

This reference covers complex TypeScript scenarios when working with TanStack Query.

## End-to-End Type Safety

For monorepo setups, consider tools that provide complete frontend-backend type alignment:

### tRPC

Full-stack type safety without code generation:

```typescript
// server/router.ts
export const appRouter = router({
  todos: router({
    list: publicProcedure.query(async () => {
      return db.select().from(todos);
    }),
    byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
      return db.select().from(todos).where(eq(todos.id, input.id));
    }),
    create: publicProcedure.input(z.object({ title: z.string() })).mutation(async ({ input }) => {
      return db.insert(todos).values(input).returning();
    }),
  }),
});

// client/todos.tsx - Types flow automatically
const { data } = trpc.todos.list.useQuery();
// data is fully typed from server definition
```

### Zodios

REST API client with Zod schemas:

```typescript
import { Zodios } from "@zodios/core";
import { ZodiosHooks } from "@zodios/react";

const api = new Zodios("/api", [
  {
    method: "get",
    path: "/todos",
    response: todosSchema,
  },
  {
    method: "get",
    path: "/todos/:id",
    response: todoSchema,
  },
]);

const hooks = new ZodiosHooks("todos", api);

// Fully typed queries
const { data } = hooks.useGetTodos();
```

## Discriminated Union Types

Handle different response shapes safely:

```typescript
// Response can be success or error
const responseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    data: todoSchema,
  }),
  z.object({
    status: z.literal("error"),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
]);

type Response = z.infer<typeof responseSchema>;

const fetchTodo = async (id: string): Promise<Todo> => {
  const res = await api.get(`/todos/${id}`);
  const parsed = responseSchema.parse(res.data);

  if (parsed.status === "error") {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
};
```

## Generic Query Factory

Create a reusable factory for all entities:

```typescript
import { queryOptions, QueryKey } from "@tanstack/react-query";
import { z } from "zod";

function createEntityQueries<TEntity, TCreateInput, TUpdateInput>(config: {
  name: string;
  entitySchema: z.ZodType<TEntity>;
  createSchema: z.ZodType<TCreateInput>;
  updateSchema: z.ZodType<TUpdateInput>;
  baseUrl: string;
}) {
  const { name, entitySchema, baseUrl } = config;
  const listSchema = z.array(entitySchema);

  return {
    all: () =>
      queryOptions({
        queryKey: [name] as const,
        queryFn: async () => {
          const res = await api.get(baseUrl);
          return listSchema.parse(res.data);
        },
      }),

    detail: (id: string) =>
      queryOptions({
        queryKey: [name, "detail", id] as const,
        queryFn: async () => {
          const res = await api.get(`${baseUrl}/${id}`);
          return entitySchema.parse(res.data);
        },
      }),

    // Additional methods...
  };
}

// Usage
const todoQueries = createEntityQueries({
  name: "todos",
  entitySchema: todoSchema,
  createSchema: createTodoSchema,
  updateSchema: updateTodoSchema,
  baseUrl: "/api/todos",
});
```

## Typing Infinite Queries

Handle paginated data with proper types:

```typescript
const paginatedTodosSchema = z.object({
  items: z.array(todoSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number(),
});

type PaginatedTodos = z.infer<typeof paginatedTodosSchema>;

const todoQueries = {
  infinite: () =>
    infiniteQueryOptions({
      queryKey: ["todos", "infinite"] as const,
      queryFn: async ({ pageParam }) => {
        const res = await api.get("/todos", {
          params: { cursor: pageParam },
        });
        return paginatedTodosSchema.parse(res.data);
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
};

// Usage
const { data } = useInfiniteQuery(todoQueries.infinite());
// data.pages: PaginatedTodos[]
```

## Conditional Types for Enabled Queries

Type data differently based on enabled state:

```typescript
function useTodoDetail<TEnabled extends boolean = true>(
  id: string | undefined,
  options?: { enabled?: TEnabled }
) {
  return useQuery({
    queryKey: ["todos", id] as const,
    queryFn: () => fetchTodo(id!),
    enabled: (options?.enabled ?? true) && !!id,
  });
}

// When explicitly disabled, data is always undefined
const { data } = useTodoDetail(id, { enabled: false });
// data: Todo | undefined (but we know it's undefined)

// When enabled, data could be Todo
const { data: todo } = useTodoDetail(id);
// todo: Todo | undefined
```

## Type-Safe Query Key Factories

Ensure query key consistency with branded types:

```typescript
// Create branded query key types
type TodoQueryKey = ["todos", ...unknown[]];
type TodoDetailKey = ["todos", "detail", string];
type TodoListKey = ["todos", "list", { filter?: string }];

// Factory with specific return types
const todoKeys = {
  all: (): TodoQueryKey => ["todos"],
  lists: (): TodoListKey => ["todos", "list", {}],
  list: (filter?: string): TodoListKey => ["todos", "list", { filter }],
  details: (): ["todos", "detail"] => ["todos", "detail"],
  detail: (id: string): TodoDetailKey => ["todos", "detail", id],
};

// Invalidation is now type-checked
queryClient.invalidateQueries({ queryKey: todoKeys.all() });
```

## Extracting Types from Queries

Get data types from query definitions:

```typescript
import { QueryKey } from "@tanstack/react-query";

// Utility to extract data type from queryOptions
type QueryData<T> = T extends { queryFn: () => Promise<infer R> } ? R : never;

// Usage
type TodoListData = QueryData<ReturnType<typeof todoQueries.all>>;
// TodoListData = Todo[]

type TodoDetailData = QueryData<ReturnType<typeof todoQueries.detail>>;
// TodoDetailData = Todo
```

## Handling Unknown API Responses

Safely handle responses when you don't control the API:

```typescript
// Parse unknown response safely
const safeParseResponse = <T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } => {
  const result = schema.safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
};

// Use in queryFn with fallback
const fetchTodos = async (): Promise<Todo[]> => {
  const res = await api.get("/todos");
  const result = safeParseResponse(todosSchema, res.data);

  if (!result.success) {
    // Log validation errors for debugging
    console.error("API response validation failed:", result.error.issues);
    // Throw to trigger error state
    throw new Error("Invalid API response");
  }

  return result.data;
};
```

## Type Guards for Query States

Create type guards for cleaner component logic:

```typescript
import { UseQueryResult } from '@tanstack/react-query'

function isQueryLoading<T>(
  query: UseQueryResult<T>
): query is UseQueryResult<T> & { status: 'pending' } {
  return query.status === 'pending'
}

function isQueryError<T>(
  query: UseQueryResult<T>
): query is UseQueryResult<T> & { status: 'error'; error: Error } {
  return query.status === 'error'
}

function isQuerySuccess<T>(
  query: UseQueryResult<T>
): query is UseQueryResult<T> & { status: 'success'; data: T } {
  return query.status === 'success'
}

// Usage
const query = useQuery(todoQueries.detail(id))

if (isQueryLoading(query)) {
  return <Loading />
}

if (isQueryError(query)) {
  return <Error message={query.error.message} />
}

// TypeScript knows data exists
return <TodoDetail todo={query.data} />
```

## Colocating Types with Queries

Keep types close to their queries:

```typescript
// features/todos/queries.ts

// --- Schemas ---
export const todoSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
});

export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
});

// --- Types (derived from schemas) ---
export type Todo = z.infer<typeof todoSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;

// --- Queries ---
export const todoQueries = {
  all: () =>
    queryOptions({
      queryKey: ["todos"] as const,
      queryFn: async () => {
        const res = await api.get("/todos");
        return z.array(todoSchema).parse(res.data);
      },
    }),
  // ...
};

// --- Mutations ---
export const useTodoMutations = () => {
  const queryClient = useQueryClient();

  return {
    create: useMutation({
      mutationFn: async (input: CreateTodoInput) => {
        const validated = createTodoSchema.parse(input);
        const res = await api.post("/todos", validated);
        return todoSchema.parse(res.data);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: todoQueries.all().queryKey });
      },
    }),
  };
};
```

This colocation pattern keeps all type-related code together, making it easy to maintain and update.
