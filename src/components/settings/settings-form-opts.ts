import { formOptions } from "@tanstack/react-form-start";
import type { SettingsFormData } from "./settings-form-schema";

// Field render prop types for form.Field children functions
export interface StringFieldRenderProps {
  state: { value: string };
  handleChange: (value: string) => void;
  handleBlur: () => void;
}

export interface BooleanFieldRenderProps {
  state: { value: boolean };
  handleChange: (value: boolean) => void;
  handleBlur: () => void;
}

export interface NumberFieldRenderProps {
  state: { value: number };
  handleChange: (value: number) => void;
  handleBlur: () => void;
}

// TanStack Form's actual type has 12+ generic parameters - use loose object type
// for props, field render prop types (above) enforce type safety at usage sites
export interface SettingsFormApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export type SettingsForm = SettingsFormApi;

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
  enableWorktreeSupport: false,
};

export const settingsFormOpts = formOptions({
  defaultValues: defaultSettings,
});
