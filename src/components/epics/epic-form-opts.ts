import { formOptions } from "@tanstack/react-form-start";
import type { EpicFormData } from "./epic-form-schema";

/**
 * Default values for a new epic form.
 *
 * Note: Color is empty string by default - the component should provide
 * a default from PRESET_COLORS[0] when initializing the form.
 */
const defaultEpic: EpicFormData = {
  title: "",
  description: "",
  color: "",
};

/**
 * TanStack Form options for Epic forms.
 *
 * Usage in component:
 * ```typescript
 * const form = useForm({
 *   ...epicFormOpts,
 *   defaultValues: {
 *     title: existingEpic?.title ?? '',
 *     description: existingEpic?.description ?? '',
 *     color: existingEpic?.color ?? PRESET_COLORS[0],
 *   },
 *   validators: {
 *     onChange: epicFormSchema,
 *   },
 *   onSubmit: async ({ value }) => {
 *     // Handle form submission
 *   },
 * });
 * ```
 */
export const epicFormOpts = formOptions({
  defaultValues: defaultEpic,
});
