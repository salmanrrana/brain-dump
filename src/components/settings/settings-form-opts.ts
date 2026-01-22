import { formOptions } from "@tanstack/react-form-start";
import type { SettingsFormData } from "./settings-form-schema";

/**
 * Type alias for the settings form instance.
 *
 * TanStack Form's types are extremely complex with 12+ generic parameters.
 * Using `any` here is pragmatic - the form shape is well-documented and
 * type errors at usage sites will still be caught. The alternative would
 * require matching all 12 generic parameters exactly, which is brittle.
 *
 * @see https://tanstack.com/form/latest/docs/framework/react/reference/useForm
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SettingsForm = any;

/**
 * Default values for settings form.
 *
 * These match the application defaults:
 * - General: empty terminal (auto-detect), no default directory, auto working method
 * - Ralph: sandbox disabled, 1 hour timeout, 20 max iterations, auto docker
 * - Git: auto PR creation enabled, "dev" as default target branch
 * - Enterprise: conversation logging enabled, 90 day retention
 */
const defaultSettings: SettingsFormData = {
  // General tab
  terminalEmulator: "",
  defaultProjectsDirectory: "",
  defaultWorkingMethod: "auto",

  // Ralph tab
  ralphSandbox: false,
  ralphTimeout: 3600,
  ralphMaxIterations: 20,
  dockerRuntime: "auto",

  // Git tab
  autoCreatePr: true,
  prTargetBranch: "dev",

  // Enterprise tab
  conversationLoggingEnabled: true,
  conversationRetentionDays: 90,
};

/**
 * TanStack Form options for Settings forms.
 *
 * Usage in component:
 * ```typescript
 * const form = useForm({
 *   ...settingsFormOpts,
 *   defaultValues: {
 *     terminalEmulator: settings?.terminalEmulator ?? '',
 *     // ... other fields with fallbacks
 *   },
 *   validators: {
 *     onChange: settingsFormSchema,
 *   },
 *   onSubmit: async ({ value }) => {
 *     await updateSettingsMutation.mutateAsync(value);
 *   },
 * });
 * ```
 */
export const settingsFormOpts = formOptions({
  defaultValues: defaultSettings,
});
