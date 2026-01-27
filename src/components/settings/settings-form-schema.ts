import { z } from "zod";

export const workingMethodSchema = z.enum(["auto", "claude-code", "vscode", "opencode"]);

// Must match DOCKER_RUNTIME_TYPES from src/api/settings.ts
export const dockerRuntimeSchema = z.enum([
  "auto",
  "lima",
  "colima",
  "rancher",
  "docker-desktop",
  "podman",
]);

export const settingsFormSchema = z.object({
  terminalEmulator: z.string(),
  defaultProjectsDirectory: z.string(),
  defaultWorkingMethod: workingMethodSchema,
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
  autoCreatePr: z.boolean(),
  prTargetBranch: z.string().min(1, "Branch name is required"),
  conversationLoggingEnabled: z.boolean(),
  conversationRetentionDays: z
    .number()
    .min(7, "Retention must be at least 7 days")
    .max(365, "Retention cannot exceed 1 year"),
  enableWorktreeSupport: z.boolean(),
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;
export type WorkingMethod = z.infer<typeof workingMethodSchema>;
export type DockerRuntime = z.infer<typeof dockerRuntimeSchema>;
