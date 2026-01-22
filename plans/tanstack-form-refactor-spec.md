# TanStack Form Refactor Spec

> **Status**: Draft
> **Author**: Claude
> **Related**: Form state management improvements for SettingsModal, TicketModal, and EpicModal

---

## 1. Overview

**What is this?**

Refactor three modal components (`SettingsModal`, `TicketModal`, `EpicModal`) to use **TanStack Form** for type-safe form state management, validation, and improved performance. This replaces 30+ individual `useState` hooks across the modals with a single form instance per modal, providing better type safety, built-in validation, and granular reactivity.

- **Problem being solved**:
  - Too many `useState` hooks (12+ per modal) making components hard to maintain
  - Complex `useEffect` chains syncing server data to form state
  - Manual validation with no field-level error messages
  - Prop drilling: tab components receive many individual setters
  - No type safety for form state changes

- **User value delivered**:
  - Better form validation with clear error messages
  - Improved performance (granular re-renders)
  - More reliable form state management
  - Better developer experience with type safety

- **How it fits into the system**:
  - Integrates seamlessly with existing TanStack Query setup
  - Uses Zod (already planned for MCP server refactor)
  - Follows existing TanStack ecosystem patterns (Query, Router, Start)
  - **CRITICAL**: Uses `@tanstack/react-form-start` for TanStack Start integration
  - Maintains compatibility with existing API hooks

### Key Insight

> "TanStack Form is an async state manager for forms - it manages form state separately from server state (TanStack Query), providing granular reactivity and type safety."

### ⚠️ CRITICAL UPDATES FROM DOCUMENTATION REVIEW

**After reviewing TanStack Form docs, these are the most important changes:**

1. **TanStack Start Integration** (CRITICAL):
   - Must use `@tanstack/react-form-start` NOT `@tanstack/react-form`
   - Use `formOptions()` to share form shape between client/server
   - Can optionally use `createServerValidate()` for server-side validation

2. **Async Initial Values Pattern** (CRITICAL):
   - No `useEffect` needed! Form handles async data automatically
   - Use conditional `defaultValues` that update when query data loads
   - Form syncs automatically when server data changes

3. **Reactivity Patterns**:
   - Use `form.Subscribe` for UI updates (doesn't cause component re-renders)
   - Use `useStore` hook for component logic (always provide selector!)
   - Never use `useStore(form.store)` without selector

4. **Dynamic Validation**:
   - Use `revalidateLogic()` to change validation behavior after submission
   - Useful for progressive validation (stricter after first submit attempt)

5. **Custom Error Types**:
   - Supports strings, objects, arrays, numbers, booleans
   - Use `disableErrorFlat` prop to access errors by validator source

---

## 2. Current State Analysis

### SettingsModal.tsx

**Current Issues:**

- 12+ individual `useState` hooks for form fields
- Large `useEffect` syncing server data to 12+ state variables (lines 79-95)
- Complex `hasChanges` useMemo tracking 12+ dependencies (lines 99-128)
- Prop drilling: each tab component receives many individual setters
- No validation or error handling

**Form Fields:**

- General: `terminalEmulator`, `defaultProjectsDirectory`, `defaultWorkingMethod`
- Ralph: `ralphSandbox`, `ralphTimeout`, `ralphMaxIterations`, `dockerRuntime`
- Git: `autoCreatePr`, `prTargetBranch`
- Enterprise: `conversationLoggingEnabled`, `conversationRetentionDays`

### TicketModal.tsx

**Current Issues:**

- 15+ `useState` hooks for form fields
- Manual validation (title.trim() check)
- Complex state management for tags, subtasks, attachments
- No field-level validation or error messages

**Form Fields:**

- Core: `title`, `description`, `status`, `priority`, `epicId`
- Arrays: `tags[]`, `subtasks[]`, `attachments[]`
- Blocking: `isBlocked`, `blockedReason`
- UI state: `newTag`, `newSubtask`, `newComment`

### EpicModal.tsx

**Current Issues:**

- 3+ `useState` hooks (simpler but still benefits from form library)
- Manual validation (title.trim() check)
- No field-level validation

**Form Fields:**

- `title`, `description`, `color`

---

## 3. Key TanStack Form API Patterns

Based on the [official documentation](https://tanstack.com/form/latest/docs/framework/react/guides/basic-concepts), here are the key patterns we'll use:

### ⚠️ CRITICAL: TanStack Start Integration

Since we're using TanStack Start, we **must** use `@tanstack/react-form-start` instead of `@tanstack/react-form`:

```typescript
// ✅ CORRECT for TanStack Start
import { formOptions, useForm } from "@tanstack/react-form-start";
import { createServerValidate, ServerValidateError } from "@tanstack/react-form-start";

// ❌ WRONG - don't use this in TanStack Start
import { useForm } from "@tanstack/react-form";
```

### Form Options (Shared Configuration)

For TanStack Start, use `formOptions` to share form shape between client and server:

```typescript
import { formOptions } from "@tanstack/react-form-start";

export const settingsFormOpts = formOptions({
  defaultValues: {
    terminalEmulator: "",
    defaultProjectsDirectory: "",
    // ... other fields
  },
});
```

### Form Instance

```typescript
import { useForm } from "@tanstack/react-form-start";

const form = useForm({
  ...settingsFormOpts, // Spread form options
  validators: {
    onChange: zodSchema, // Zod schemas work directly!
  },
  onSubmit: async ({ value }) => {
    // Handle submission
  },
});
```

### Async Initial Values (CRITICAL Pattern)

When loading data from TanStack Query, handle async initial values properly:

```typescript
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form-start'

function SettingsModal() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const form = useForm({
    ...settingsFormOpts,
    // Use conditional defaultValues - form will update when data loads
    defaultValues: {
      terminalEmulator: settings?.terminalEmulator ?? '',
      defaultProjectsDirectory: settings?.defaultProjectsDirectory ?? '',
      // ... other fields with fallbacks
    },
    validators: {
      onChange: settingsFormSchema,
    },
    onSubmit: async ({ value }) => {
      await updateSettingsMutation.mutateAsync(value)
    },
  })

  if (isLoading) return <LoadingSpinner />

  // Form renders with loaded data
  return (/* form JSX */)
}
```

**Key Points:**

- Form initializes with fallback values immediately
- When `settings` loads, form updates automatically
- No need for `useEffect` to sync data - TanStack Form handles it

### Field Component (Render Props Pattern)

```typescript
<form.Field
  name="fieldName"
  validators={{
    onChange: z.string().min(1, 'Required'),
    onBlur: z.string().email('Invalid email'),
  }}
  children={(field) => (
    <>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.errors && (
        <div>{field.state.meta.errors[0]}</div>
      )}
    </>
  )}
/>
```

### Array Fields

```typescript
<form.Field
  name="items"
  mode="array"
  children={(arrayField) => (
    <div>
      {arrayField.state.value.map((_, index) => (
        <form.Field
          key={index}
          name={`items[${index}]`}
          children={(field) => (
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        />
      ))}
      <button onClick={() => arrayField.pushValue('')}>Add</button>
    </div>
  )}
/>
```

### Reactive State Updates

TanStack Form provides two ways to access reactive state:

**1. `form.Subscribe` Component** (for UI updates):

```typescript
// Subscribe to specific form state - only re-renders the Subscribe component
<form.Subscribe
  selector={(state) => [state.canSubmit, state.isSubmitting]}
  children={([canSubmit, isSubmitting]) => (
    <button disabled={!canSubmit}>
      {isSubmitting ? 'Saving...' : 'Submit'}
    </button>
  )}
/>
```

**2. `useStore` Hook** (for component logic):

```typescript
import { useStore } from '@tanstack/react-form-start'

function MyComponent({ form }) {
  // Access form values in component logic
  const firstName = useStore(form.store, (state) => state.values.firstName)
  const errors = useStore(form.store, (state) => state.errorMap)

  // ⚠️ IMPORTANT: Always provide a selector to avoid unnecessary re-renders
  // ❌ BAD: const store = useStore(form.store) // Re-renders on ANY change
  // ✅ GOOD: const firstName = useStore(form.store, (state) => state.values.firstName)

  return (/* JSX */)
}
```

**When to use which:**

- `form.Subscribe`: For UI that needs to react to form state (buttons, error displays)
- `useStore`: For accessing form state in component logic (conditional rendering, calculations)

### Field State Flags

- `field.state.meta.isDirty` - Field value changed (persistent - stays dirty even if reverted)
- `field.state.meta.isTouched` - Field has been interacted with (changed or blurred)
- `field.state.meta.isPristine` - Field hasn't been changed yet (opposite of isDirty)
- `field.state.meta.isBlurred` - Field has lost focus
- `field.state.meta.isDefaultValue` - Field equals default value
- `field.state.meta.errors` - Array of validation errors (flattened from all validators)
- `field.state.meta.errorMap` - Object with errors by validator source (`onChange`, `onBlur`, `onSubmit`)

**Note on `isDirty`**: TanStack Form uses **persistent dirty state** (like Angular/Vue), meaning once a field is changed, it stays dirty even if you revert it to the default. Use `isDefaultValue` if you need non-persistent dirty checking.

### Dynamic Validation

Use `revalidateLogic()` to change validation behavior based on submission state:

```typescript
import { revalidateLogic, useForm } from "@tanstack/react-form-start";

const form = useForm({
  defaultValues: { firstName: "", lastName: "" },
  // Enable dynamic validation
  validationLogic: revalidateLogic({
    mode: "submit", // Validate on submit before first submission
    modeAfterSubmission: "change", // Validate on every change after first submission
  }),
  validators: {
    // Form-level dynamic validation
    onDynamic: ({ value }) => {
      if (!value.firstName) {
        return { firstName: "First name is required" };
      }
      return undefined;
    },
    // Field-level validation still works
    onChange: ({ value }) => {
      // Validate on change
    },
  },
});
```

**Use Cases:**

- Show errors only after first submission attempt
- Progressive validation (stricter after user tries to submit)
- Conditional validation based on form state

### Custom Error Types

TanStack Form supports custom error types (not just strings):

```typescript
// String errors (most common)
validators: {
  onChange: ({ value }) => value.length < 3 ? 'Too short' : undefined,
}

// Object errors (rich error data)
validators: {
  onChange: ({ value }) => {
    if (!value.includes('@')) {
      return {
        message: 'Invalid email',
        severity: 'error',
        code: 1001,
      }
    }
    return undefined
  },
}

// Array errors (multiple messages)
validators: {
  onChange: ({ value }) => {
    const errors = []
    if (value.length < 8) errors.push('Too short')
    if (!/[A-Z]/.test(value)) errors.push('Need uppercase')
    return errors.length ? errors : undefined
  },
}
```

**Accessing Errors:**

```typescript
// Flattened errors (default)
field.state.meta.errors // Array of all errors

// By source (use disableErrorFlat prop)
<form.Field disableErrorFlat ...>
  // Access errors by validator
  field.state.meta.errorMap.onChange // Error from onChange validator
  field.state.meta.errorMap.onBlur // Error from onBlur validator
</form.Field>
```

---

## 4. Type Definitions

### Settings Form Schema

```typescript
import { z } from "zod";

export const settingsFormSchema = z.object({
  terminalEmulator: z.string().optional(),
  defaultProjectsDirectory: z.string().optional(),
  defaultWorkingMethod: z.enum(["auto", "claude-code", "vscode", "opencode"]).default("auto"),
  ralphSandbox: z.boolean().default(false),
  ralphTimeout: z.number().min(1).max(86400).default(3600),
  ralphMaxIterations: z.number().min(1).max(100).default(20),
  dockerRuntime: z.enum(["auto", "docker", "podman"]).default("auto"),
  autoCreatePr: z.boolean().default(true),
  prTargetBranch: z.string().min(1).default("dev"),
  conversationLoggingEnabled: z.boolean().default(true),
  conversationRetentionDays: z.number().min(1).max(3650).default(90),
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;
```

### Ticket Form Schema

```typescript
import { z } from "zod";

export const ticketFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  epicId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  subtasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        completed: z.boolean(),
      })
    )
    .default([]),
  isBlocked: z.boolean().default(false),
  blockedReason: z.string().optional(),
});

export type TicketFormData = z.infer<typeof ticketFormSchema>;
```

### Epic Form Schema

```typescript
import { z } from "zod";

export const epicFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  color: z.string().optional(),
});

export type EpicFormData = z.infer<typeof epicFormSchema>;
```

---

## 5. Design Decisions

### Why TanStack Form vs useReducer?

1. **Type Safety**: Full TypeScript inference from Zod schemas, compile-time safety
2. **Validation**: Built-in schema validation with Zod, field-level error messages
3. **Performance**: Granular reactivity - fields only re-render when their state changes
4. **Ecosystem**: Already using TanStack Query/Router, consistent patterns
5. **Developer Experience**: Better autocomplete, self-documenting schemas

### Why TanStack Form vs React Hook Form?

1. **Ecosystem Alignment**: Already using TanStack Query/Router, consistent library family
2. **Type Safety**: Better TypeScript integration, stricter type inference
3. **Modern API**: More React-like patterns (render props vs register)
4. **Standard Schema**: Native support for Zod/Valibot/ArkType without adapters

### Why Zod Schemas Directly (No Adapter)?

1. **Standard Schema Support**: TanStack Form natively supports Standard Schema libraries
2. **No Extra Dependency**: No need for `@tanstack/zod-form-adapter`
3. **Simpler Setup**: Pass Zod schemas directly to `validators` prop
4. **Already Planned**: Zod needed for MCP server refactor anyway

### Why Render Props Pattern?

1. **Official Pattern**: Recommended by TanStack Form documentation
2. **Type Safety**: Better TypeScript inference with render props
3. **Flexibility**: Easy to customize field rendering per component
4. **Performance**: Granular subscriptions prevent unnecessary re-renders

---

## 6. Implementation Guide

### Phase 1: Setup & Dependencies

#### Step 1.1: Install Dependencies

```bash
pnpm add @tanstack/react-form-start zod
```

**Dependencies:**

- `@tanstack/react-form-start` - TanStack Form for TanStack Start (includes SSR support)
- `zod` - Schema validation (Standard Schema compatible, works directly with TanStack Form)

**⚠️ IMPORTANT**: Use `@tanstack/react-form-start` NOT `@tanstack/react-form` since we're using TanStack Start!

#### Step 1.2: Create Form Utilities (Optional)

**File**: `src/lib/form-utils.ts`

```typescript
// Shared form utilities for TanStack Form + TanStack Query integration
import type { Settings } from "../api/settings";
import type { SettingsFormData } from "../components/settings/settings-form-schema";

// Helper for transforming query data to form defaultValues
export function transformSettingsToFormData(settings: Settings | null): SettingsFormData {
  if (!settings) {
    return {
      terminalEmulator: "",
      defaultProjectsDirectory: "",
      defaultWorkingMethod: "auto",
      ralphSandbox: false,
      ralphTimeout: 3600,
      ralphMaxIterations: 20,
      dockerRuntime: "auto",
      autoCreatePr: true,
      prTargetBranch: "dev",
      conversationLoggingEnabled: true,
      conversationRetentionDays: 90,
    };
  }

  return {
    terminalEmulator: settings.terminalEmulator ?? "",
    defaultProjectsDirectory: settings.defaultProjectsDirectory ?? "",
    defaultWorkingMethod:
      (settings.defaultWorkingMethod as SettingsFormData["defaultWorkingMethod"]) ?? "auto",
    ralphSandbox: settings.ralphSandbox ?? false,
    ralphTimeout: settings.ralphTimeout ?? 3600,
    ralphMaxIterations: settings.ralphMaxIterations ?? 20,
    dockerRuntime: (settings.dockerRuntime as SettingsFormData["dockerRuntime"]) ?? "auto",
    autoCreatePr: settings.autoCreatePr ?? true,
    prTargetBranch: settings.prTargetBranch ?? "dev",
    conversationLoggingEnabled: settings.conversationLoggingEnabled ?? true,
    conversationRetentionDays: settings.conversationRetentionDays ?? 90,
  };
}
```

### Phase 2: SettingsModal Refactor

#### Step 2.1: Create Settings Form Schema

**File**: `src/components/settings/settings-form-schema.ts`

```typescript
import { z } from "zod";

export const settingsFormSchema = z.object({
  terminalEmulator: z.string().optional(),
  defaultProjectsDirectory: z.string().optional(),
  defaultWorkingMethod: z.enum(["auto", "claude-code", "vscode", "opencode"]).default("auto"),
  ralphSandbox: z.boolean().default(false),
  ralphTimeout: z.number().min(1).max(86400).default(3600),
  ralphMaxIterations: z.number().min(1).max(100).default(20),
  dockerRuntime: z.enum(["auto", "docker", "podman"]).default("auto"),
  autoCreatePr: z.boolean().default(true),
  prTargetBranch: z.string().min(1).default("dev"),
  conversationLoggingEnabled: z.boolean().default(true),
  conversationRetentionDays: z.number().min(1).max(3650).default(90),
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;
```

#### Step 2.2: Create Form Options (TanStack Start Pattern)

**File**: `src/components/settings/settings-form-opts.ts`

```typescript
import { formOptions } from "@tanstack/react-form-start";
import { settingsFormSchema, type SettingsFormData } from "./settings-form-schema";

// Default values for form initialization
const defaultSettings: SettingsFormData = {
  terminalEmulator: "",
  defaultProjectsDirectory: "",
  defaultWorkingMethod: "auto",
  ralphSandbox: false,
  ralphTimeout: 3600,
  ralphMaxIterations: 20,
  dockerRuntime: "auto",
  autoCreatePr: true,
  prTargetBranch: "dev",
  conversationLoggingEnabled: true,
  conversationRetentionDays: 90,
};

// Shared form options (can be used on server/client)
export const settingsFormOpts = formOptions({
  defaultValues: defaultSettings,
});
```

#### Step 2.3: Refactor SettingsModal

**File**: `src/components/settings/SettingsModal.tsx`

**Key Changes:**

- Replace 12+ `useState` hooks with single `useForm` hook
- Use Zod schema for validation
- Handle async initial values from `useSettings()` query properly
- Submit via `useUpdateSettings()` mutation
- Pass form instance to tab components instead of individual setters

**Example Form Setup with Async Initial Values:**

```typescript
import { useForm } from '@tanstack/react-form-start'
import { useQuery, useMutation } from '@tanstack/react-query'
import { settingsFormOpts } from './settings-form-opts'
import { settingsFormSchema } from './settings-form-schema'

function SettingsModal() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  const updateMutation = useMutation({
    mutationFn: updateSettings,
  })

  const form = useForm({
    ...settingsFormOpts,
    // Handle async initial values - form updates when settings loads
    defaultValues: {
      terminalEmulator: settings?.terminalEmulator ?? '',
      defaultProjectsDirectory: settings?.defaultProjectsDirectory ?? '',
      defaultWorkingMethod: (settings?.defaultWorkingMethod as SettingsFormData['defaultWorkingMethod']) ?? 'auto',
      ralphSandbox: settings?.ralphSandbox ?? false,
      ralphTimeout: settings?.ralphTimeout ?? 3600,
      ralphMaxIterations: settings?.ralphMaxIterations ?? 20,
      dockerRuntime: (settings?.dockerRuntime as SettingsFormData['dockerRuntime']) ?? 'auto',
      autoCreatePr: settings?.autoCreatePr ?? true,
      prTargetBranch: settings?.prTargetBranch ?? 'dev',
      conversationLoggingEnabled: settings?.conversationLoggingEnabled ?? true,
      conversationRetentionDays: settings?.conversationRetentionDays ?? 90,
    },
    validators: {
      onChange: settingsFormSchema, // Zod schema works directly!
    },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync(value)
      // Form will automatically sync with new server values via query refetch
      // Optionally reset if needed: form.reset()
    },
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      {/* Form fields */}
    </form>
  )
}
```

**Key Pattern**: No `useEffect` needed! TanStack Form handles async initial values automatically when `defaultValues` reference changes.

#### Step 2.4: Update Tab Components

**Before:**

```typescript
<GeneralTab
  terminalEmulator={terminalEmulator}
  onTerminalChange={setTerminalEmulator}
  // ... 10+ more props
/>
```

**After:**

```typescript
<GeneralTab form={form} />

// Inside GeneralTab component:
<form.Field
  name="terminalEmulator"
  validators={{
    onChange: z.string().optional(),
  }}
  children={(field) => (
    <>
      <input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
      {field.state.meta.errors && (
        <div className="error">{field.state.meta.errors[0]}</div>
      )}
    </>
  )}
/>
```

### Phase 3: TicketModal Refactor

#### Step 3.1: Create Ticket Form Schema

**File**: `src/components/tickets/ticket-form-schema.ts`

```typescript
import { z } from "zod";

export const ticketFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done", "blocked"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  epicId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  subtasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        completed: z.boolean(),
      })
    )
    .default([]),
  isBlocked: z.boolean().default(false),
  blockedReason: z.string().optional(),
});

export type TicketFormData = z.infer<typeof ticketFormSchema>;
```

#### Step 3.2: Refactor TicketModal

**File**: `src/components/TicketModal.tsx`

**Key Changes:**

- Replace 15+ `useState` hooks with `useForm`
- Add validation (title required, status enum)
- Use `form.Field` with `mode="array"` for tags and subtasks
- Handle attachments separately (file uploads don't fit form model)

**Array Field Example:**

```typescript
<form.Field
  name="tags"
  mode="array"
  children={(tagsField) => (
    <div>
      {tagsField.state.value.map((_, index) => (
        <form.Field
          key={index}
          name={`tags[${index}]`}
          validators={{
            onChange: z.string().min(1, 'Tag cannot be empty'),
          }}
          children={(field) => (
            <div>
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <button
                type="button"
                onClick={() => tagsField.removeValue(index)}
              >
                Remove
              </button>
            </div>
          )}
        />
      ))}
      <button
        type="button"
        onClick={() => tagsField.pushValue('')}
      >
        Add Tag
      </button>
    </div>
  )}
/>
```

### Phase 4: EpicModal Refactor

#### Step 4.1: Create Epic Form Schema

**File**: `src/components/epics/epic-form-schema.ts`

```typescript
import { z } from "zod";

export const epicFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  color: z.string().optional(),
});

export type EpicFormData = z.infer<typeof epicFormSchema>;
```

#### Step 4.2: Refactor EpicModal

**File**: `src/components/EpicModal.tsx`

**Key Changes:**

- Replace 3 `useState` hooks with `useForm`
- Add validation (title required)
- Simpler form but benefits from consistent pattern

### Phase 5: Enhanced Features

#### Step 5.1: Optimistic Updates

**File**: `src/lib/hooks.ts`

Enhance mutations with optimistic updates:

```typescript
// In useUpdateSettings hook
const mutation = useMutation({
  mutationFn: updateSettings,
  onMutate: async (newSettings) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: queryKeys.settings });

    // Snapshot previous value
    const previousSettings = queryClient.getQueryData(queryKeys.settings);

    // Optimistically update
    queryClient.setQueryData(queryKeys.settings, newSettings);

    return { previousSettings };
  },
  onError: (err, newSettings, context) => {
    // Rollback on error
    queryClient.setQueryData(queryKeys.settings, context?.previousSettings);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.settings });
  },
});
```

#### Step 5.2: Field-Level Error Display

**File**: `src/components/FormField.tsx`

Create reusable `FormField` wrapper component:

```typescript
import type { FieldApi } from '@tanstack/react-form'

interface FormFieldProps<TFormData, TFieldName extends keyof TFormData> {
  field: FieldApi<TFormData, TFieldName>
  label: string
  children: React.ReactNode
}

export function FormField<TFormData, TFieldName extends keyof TFormData>({
  field,
  label,
  children,
}: FormFieldProps<TFormData, TFieldName>) {
  return (
    <div>
      <label htmlFor={field.name}>{label}</label>
      {children}
      {field.state.meta.errors && field.state.meta.errors.length > 0 && (
        <div className="error" role="alert">
          {field.state.meta.errors.join(', ')}
        </div>
      )}
    </div>
  )
}
```

**Usage:**

```typescript
<form.Field
  name="title"
  validators={{
    onChange: z.string().min(1, 'Title is required'),
  }}
  children={(field) => (
    <FormField field={field} label="Title">
      <input
        id={field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
    </FormField>
  )}
/>
```

#### Step 5.3: Form Reset After Success & Submit Button State

```typescript
const form = useForm({
  defaultValues: initialData,
  validators: {
    onChange: formSchema, // Zod schema validation
  },
  onSubmit: async ({ value }) => {
    await mutation.mutateAsync(value)
    // After successful mutation, TanStack Query will refetch
    // Form will automatically sync with new server values
    // Optionally reset explicitly if needed:
    // form.reset()
  },
})

// Submit button with reactive state
<form.Subscribe
  selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
  children={([canSubmit, isSubmitting, isDirty]) => (
    <button
      type="submit"
      disabled={!canSubmit || isSubmitting}
      onClick={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      {isSubmitting ? 'Saving...' : isDirty ? 'Save Changes' : 'No Changes'}
    </button>
  )}
/>
```

**Note**:

- `canSubmit` is `false` when form is invalid and has been touched
- `isDirty` tracks if form has changes (persistent dirty state)
- Use `form.Subscribe` for reactive UI updates without unnecessary re-renders
- Form automatically syncs with server state after successful mutation (via TanStack Query refetch)

#### Step 5.4: Server-Side Validation (TanStack Start)

For TanStack Start, we can add server-side validation using `createServerValidate`:

**File**: `src/components/settings/settings-server-validate.ts`

```typescript
import { createServerValidate, ServerValidateError } from "@tanstack/react-form-start";
import { settingsFormOpts } from "./settings-form-opts";

export const serverValidateSettings = createServerValidate({
  ...settingsFormOpts,
  onServerValidate: ({ value }) => {
    // Additional server-side validation
    if (value.ralphTimeout > 86400) {
      return { ralphTimeout: "Timeout cannot exceed 24 hours" };
    }
    return undefined;
  },
});

// Use in server action/route handler
export async function updateSettingsAction(formData: FormData) {
  try {
    const validatedData = await serverValidateSettings(formData);
    // Save to database
    await saveSettings(validatedData);
    return { success: true };
  } catch (e) {
    if (e instanceof ServerValidateError) {
      return e.formState; // Return form state with errors
    }
    throw e;
  }
}
```

**Note**: Server-side validation is optional but recommended for security and data integrity.

---

## 7. Migration Strategy

### Step-by-Step Approach

1. **Start with EpicModal** (simplest, lowest risk)
   - Validate pattern works
   - Establish conventions
   - Test thoroughly

2. **Then SettingsModal** (medium complexity)
   - Apply lessons from EpicModal
   - Handle tabbed form structure
   - Test all tabs

3. **Finally TicketModal** (most complex)
   - Apply all patterns
   - Handle arrays (tags, subtasks)
   - Handle file uploads separately

### Testing Strategy

- **Unit tests**: Test form schemas with Zod
- **Integration tests**: Test form submission flows
- **E2E tests**: Test full user workflows
- **Manual testing**: Verify all fields work, validation displays correctly

---

## 8. Files to Create/Modify

### New Files

1. `src/lib/form-utils.ts` - Shared form utilities (optional, may not be needed with async initial values pattern)
2. `src/components/settings/settings-form-schema.ts` - Settings form schema
3. `src/components/settings/settings-form-opts.ts` - Settings form options (TanStack Start pattern)
4. `src/components/settings/settings-server-validate.ts` - Server-side validation (optional)
5. `src/components/tickets/ticket-form-schema.ts` - Ticket form schema
6. `src/components/tickets/ticket-form-opts.ts` - Ticket form options
7. `src/components/epics/epic-form-schema.ts` - Epic form schema
8. `src/components/epics/epic-form-opts.ts` - Epic form options
9. `src/components/FormField.tsx` - Reusable form field wrapper (optional)

### Modified Files

1. `src/components/settings/SettingsModal.tsx` - Replace useState with useForm
2. `src/components/settings/GeneralTab.tsx` - Use `form.Field` with render props instead of individual props
3. `src/components/settings/RalphTab.tsx` - Use `form.Field` with render props instead of individual props
4. `src/components/settings/GitTab.tsx` - Use `form.Field` with render props instead of individual props
5. `src/components/settings/EnterpriseTab.tsx` - Use `form.Field` with render props instead of individual props
6. `src/components/TicketModal.tsx` - Replace useState with useForm
7. `src/components/EpicModal.tsx` - Replace useState with useForm
8. `src/lib/hooks.ts` - Enhance mutations with optimistic updates (optional)
9. `package.json` - Add dependencies

---

## 9. Acceptance Criteria

- [ ] Dependencies installed (`@tanstack/react-form-start`, `zod`)
- [ ] **CRITICAL**: Using `@tanstack/react-form-start` (not `@tanstack/react-form`)
- [ ] Form options created using `formOptions()` for each modal
- [ ] All three modals use TanStack Form
- [ ] Form schemas created with Zod validation
- [ ] Async initial values handled correctly (no useEffect needed)
- [ ] Form validation works (required fields, min/max)
- [ ] Field-level error messages display correctly
- [ ] Form state persists when switching tabs (SettingsModal)
- [ ] Form syncs with server state after successful submission
- [ ] Array fields work (tags, subtasks in TicketModal)
- [ ] Reactive state updates work (`form.Subscribe` and `useStore`)
- [ ] Type safety: no `any` types, full inference
- [ ] Performance: no unnecessary re-renders (using selectors)
- [ ] Tests pass: unit, integration, E2E
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)

---

## 10. Out of Scope

- [ ] File uploads (attachments) - Keep as separate state, integrate with form submission
- [ ] Other modals (ProjectModal, etc.) - Can be refactored in future tickets
- [ ] Form persistence across page reloads - Not needed for modals
- [ ] Complex nested forms - Current forms are flat or simple arrays

---

## 11. Risks & Mitigations

### Risk 1: Wrong Package Import ⚠️ CRITICAL

**Risk**: Using `@tanstack/react-form` instead of `@tanstack/react-form-start` will cause SSR issues

**Mitigation**:

- Always import from `@tanstack/react-form-start`
- Add ESLint rule to prevent wrong imports
- Document in code comments

### Risk 2: Async Initial Values Pattern

**Risk**: Not handling async initial values correctly, causing form to not sync with server data

**Mitigation**:

- Follow the async initial values pattern exactly (conditional defaultValues)
- No `useEffect` needed - TanStack Form handles it
- Test with slow network conditions

### Risk 3: Learning Curve

**Mitigation**: Start with EpicModal (simplest), document patterns, provide examples

### Risk 4: Breaking Changes

**Mitigation**: Migrate one modal at a time, thorough testing, feature flags if needed

### Risk 5: Performance with Large Arrays

**Mitigation**: Our forms are well within limits (tags/subtasks are manageable sizes)

### Risk 6: File Uploads Don't Fit Form Model

**Mitigation**: Keep attachments as separate state (side effect), integrate with form submission

### Risk 7: Missing Selectors in useStore

**Risk**: Using `useStore(form.store)` without selector causes unnecessary re-renders

**Mitigation**:

- Always provide selector: `useStore(form.store, (state) => state.values.fieldName)`
- Add ESLint rule or TypeScript check if possible

---

## 12. References

### TanStack Form Documentation

- **Basic Concepts**: https://tanstack.com/form/latest/docs/framework/react/guides/basic-concepts
- **Dynamic Validation**: https://tanstack.com/form/latest/docs/framework/react/guides/dynamic-validation
- **Async Initial Values**: https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values ⭐ **CRITICAL**
- **Reactivity**: https://tanstack.com/form/latest/docs/framework/react/guides/reactivity
- **Custom Errors**: https://tanstack.com/form/latest/docs/framework/react/guides/custom-errors
- **Submission Handling**: https://tanstack.com/form/latest/docs/framework/react/guides/submission-handling
- **TanStack Start Integration**: https://tanstack.com/form/latest/docs/framework/react/guides/ssr#using-tanstack-form-in-tanstack-start ⭐ **CRITICAL**

### Other References

- **TanStack Query Integration**: `.claude/skills/tanstack-forms/SKILL.md`
- **Zod Documentation**: https://zod.dev/
- **Related Code**:
  - `src/components/settings/SettingsModal.tsx`
  - `src/components/TicketModal.tsx`
  - `src/components/EpicModal.tsx`
  - `src/lib/hooks.ts`

---

## 13. Benefits Summary

### Type Safety

- ✅ Full TypeScript inference from schemas
- ✅ Compile-time errors for invalid field access
- ✅ Type-safe form submission

### Performance

- ✅ Granular re-renders (only changed fields update)
- ✅ Better than 12+ useState hooks
- ✅ Optimized for forms with many fields

### Validation

- ✅ Schema-based validation (Zod)
- ✅ Field-level error messages
- ✅ Sync and async validation support

### Maintainability

- ✅ Single source of truth (form state)
- ✅ Centralized validation logic
- ✅ Consistent patterns across modals
- ✅ Easier to add new fields

### Developer Experience

- ✅ Better autocomplete and type hints
- ✅ Self-documenting schemas
- ✅ Easier debugging (form state visible in devtools)
