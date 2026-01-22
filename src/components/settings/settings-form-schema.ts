import { z } from "zod";

/**
 * Working method options for environment detection.
 */
export const workingMethodSchema = z.enum(["auto", "claude-code", "vscode", "opencode"]);

/**
 * Docker runtime options.
 */
export const dockerRuntimeSchema = z.enum(["auto", "docker", "podman"]);

/**
 * Zod schema for Settings form validation.
 *
 * Fields organized by tab:
 * - General: terminalEmulator, defaultProjectsDirectory, defaultWorkingMethod
 * - Ralph: ralphSandbox, ralphTimeout, ralphMaxIterations, dockerRuntime
 * - Git: autoCreatePr, prTargetBranch
 * - Enterprise: conversationLoggingEnabled, conversationRetentionDays
 */
export const settingsFormSchema = z.object({
  // General tab
  terminalEmulator: z.string(),
  defaultProjectsDirectory: z.string(),
  defaultWorkingMethod: workingMethodSchema,

  // Ralph tab
  ralphSandbox: z.boolean(),
  ralphTimeout: z
    .number()
    .min(1, "Timeout must be at least 1 second")
    .max(86400, "Timeout cannot exceed 24 hours"),
  ralphMaxIterations: z
    .number()
    .min(1, "Must have at least 1 iteration")
    .max(100, "Cannot exceed 100 iterations"),
  dockerRuntime: dockerRuntimeSchema,

  // Git tab
  autoCreatePr: z.boolean(),
  prTargetBranch: z.string().min(1, "Branch name is required"),

  // Enterprise tab
  conversationLoggingEnabled: z.boolean(),
  conversationRetentionDays: z
    .number()
    .min(1, "Retention must be at least 1 day")
    .max(3650, "Retention cannot exceed 10 years"),
});

/**
 * TypeScript type inferred from the Zod schema.
 * Use this for type-safe form handling.
 */
export type SettingsFormData = z.infer<typeof settingsFormSchema>;

/**
 * Type for working method values.
 */
export type WorkingMethod = z.infer<typeof workingMethodSchema>;

/**
 * Type for docker runtime values.
 */
export type DockerRuntime = z.infer<typeof dockerRuntimeSchema>;
