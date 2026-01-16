# Form Library Integration Patterns

This reference covers integrating TanStack Query with popular form libraries.

## React Hook Form Integration

### Basic Pattern

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const todoSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
})

type TodoFormData = z.infer<typeof todoSchema>

function EditTodoForm({ todo }: { todo: Todo }) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<TodoFormData>({
    resolver: zodResolver(todoSchema),
    defaultValues: {
      title: todo.title,
      description: todo.description ?? '',
      priority: todo.priority,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: TodoFormData) =>
      api.patch(`/todos/${todo.id}`, data),
    onSuccess: (updatedTodo) => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      // Reset form to new values, clearing dirty state
      reset(updatedTodo)
    },
  })

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      <div>
        <input {...register('title')} />
        {errors.title && <span>{errors.title.message}</span>}
      </div>

      <div>
        <textarea {...register('description')} />
      </div>

      <div>
        <select {...register('priority')}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || !isDirty}
      >
        {mutation.isPending ? 'Saving...' : 'Save'}
      </button>

      {mutation.isError && (
        <div className="error">{mutation.error.message}</div>
      )}
    </form>
  )
}
```

### Create Form (No Initial Data)

```typescript
function CreateTodoForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { register, handleSubmit, formState: { errors } } = useForm<TodoFormData>({
    resolver: zodResolver(todoSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
    },
  })

  const mutation = useMutation({
    mutationFn: (data: TodoFormData) => api.post('/todos', data),
    onSuccess: (newTodo) => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      navigate(`/todos/${newTodo.id}`)
    },
  })

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      {/* Same form fields */}
    </form>
  )
}
```

### Loading State Wrapper

```typescript
function EditTodoPage({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery(todoQueries.detail(id))

  if (isLoading) return <FormSkeleton />
  if (error) return <ErrorPage error={error} />
  if (!data) return <NotFound />

  // Only render form when data is available
  // This ensures defaultValues are set correctly
  return <EditTodoForm todo={data} />
}
```

### Watching Query Updates

React to server changes while editing:

```typescript
function EditTodoForm({ id }: { id: string }) {
  const { data: serverData, dataUpdatedAt } = useQuery(todoQueries.detail(id));

  const {
    reset,
    formState: { dirtyFields },
  } = useForm({
    defaultValues: serverData,
  });

  // Track when user started editing
  const [editStartedAt] = useState(Date.now());

  // Detect server updates during editing
  useEffect(() => {
    if (dataUpdatedAt > editStartedAt && serverData) {
      // Only reset fields the user hasn't touched
      const cleanFields = Object.keys(serverData).reduce(
        (acc, key) => {
          if (!dirtyFields[key as keyof typeof dirtyFields]) {
            acc[key] = serverData[key as keyof typeof serverData];
          }
          return acc;
        },
        {} as Partial<typeof serverData>
      );

      reset((current) => ({ ...current, ...cleanFields }));
    }
  }, [dataUpdatedAt, serverData, dirtyFields, reset, editStartedAt]);

  // ... form rendering
}
```

## Formik Integration

### Basic Pattern

```typescript
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'

const todoValidation = Yup.object({
  title: Yup.string().required('Title is required'),
  description: Yup.string(),
  priority: Yup.string().oneOf(['low', 'medium', 'high']),
})

function EditTodoForm({ todo }: { todo: Todo }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: Partial<Todo>) =>
      api.patch(`/todos/${todo.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  return (
    <Formik
      initialValues={{
        title: todo.title,
        description: todo.description ?? '',
        priority: todo.priority,
      }}
      validationSchema={todoValidation}
      onSubmit={(values, { setSubmitting }) => {
        mutation.mutate(values, {
          onSettled: () => setSubmitting(false),
        })
      }}
      enableReinitialize // Allow form to update when props change
    >
      {({ isSubmitting, dirty }) => (
        <Form>
          <div>
            <Field name="title" type="text" />
            <ErrorMessage name="title" component="span" />
          </div>

          <div>
            <Field name="description" as="textarea" />
          </div>

          <div>
            <Field name="priority" as="select">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Field>
          </div>

          <button type="submit" disabled={isSubmitting || !dirty}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>

          {mutation.isError && (
            <div className="error">{mutation.error.message}</div>
          )}
        </Form>
      )}
    </Formik>
  )
}
```

### With Async Validation

```typescript
<Formik
  initialValues={initialValues}
  validate={async (values) => {
    const errors: Record<string, string> = {}

    // Check for duplicate title via API
    if (values.title !== todo.title) {
      const exists = await api.get(`/todos/check-title?title=${values.title}`)
      if (exists.data.duplicate) {
        errors.title = 'A todo with this title already exists'
      }
    }

    return errors
  }}
  validateOnBlur // Validate when field loses focus
  onSubmit={handleSubmit}
>
  {/* Form content */}
</Formik>
```

## TanStack Form Integration

```typescript
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'

function EditTodoForm({ todo }: { todo: Todo }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: Partial<Todo>) =>
      api.patch(`/todos/${todo.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const form = useForm({
    defaultValues: {
      title: todo.title,
      description: todo.description ?? '',
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value)
    },
    validatorAdapter: zodValidator,
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.Field
        name="title"
        validators={{
          onChange: z.string().min(1, 'Title is required'),
        }}
      >
        {(field) => (
          <div>
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
            {field.state.meta.errors && (
              <span>{field.state.meta.errors.join(', ')}</span>
            )}
          </div>
        )}
      </form.Field>

      <button
        type="submit"
        disabled={mutation.isPending || !form.state.isDirty}
      >
        Save
      </button>
    </form>
  )
}
```

## Uncontrolled Forms (Simple Alternative)

For simple forms, use uncontrolled inputs:

```typescript
function EditTodoForm({ todo }: { todo: Todo }) {
  const formRef = useRef<HTMLFormElement>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      api.patch(`/todos/${todo.id}`, Object.fromEntries(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(formRef.current!)
    mutation.mutate(formData)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <input name="title" defaultValue={todo.title} />
      <textarea name="description" defaultValue={todo.description} />

      <button type="submit" disabled={mutation.isPending}>
        Save
      </button>
    </form>
  )
}
```

**Pros:** Simple, no state management
**Cons:** Limited validation, no dirty tracking, harder to reset

## Summary Table

| Library         | Pros                      | Cons                  | Best For                  |
| --------------- | ------------------------- | --------------------- | ------------------------- |
| React Hook Form | Performance, small bundle | Learning curve        | Complex forms             |
| Formik          | Mature, well-documented   | Larger bundle         | Teams familiar with it    |
| TanStack Form   | Type-safe, modern         | Newer, less ecosystem | TypeScript-heavy projects |
| Uncontrolled    | Simple, no deps           | Limited features      | Very simple forms         |
