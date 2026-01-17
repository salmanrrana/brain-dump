import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { settings } from "../lib/schema";
import { eq } from "drizzle-orm";

// Valid Docker runtime types for settings
export const DOCKER_RUNTIME_TYPES = [
  "auto",
  "lima",
  "colima",
  "rancher",
  "docker-desktop",
  "podman",
] as const;
export type DockerRuntimeSetting = (typeof DOCKER_RUNTIME_TYPES)[number];

// Types
export interface UpdateSettingsInput {
  terminalEmulator?: string | null;
  ralphSandbox?: boolean;
  ralphTimeout?: number; // Timeout in seconds (default: 3600 = 1 hour)
  autoCreatePr?: boolean;
  prTargetBranch?: string;
  defaultProjectsDirectory?: string | null;
  defaultWorkingMethod?: "auto" | "claude-code" | "vscode" | "opencode";
  // Docker runtime settings
  dockerRuntime?: DockerRuntimeSetting | null; // null = auto-detect
  dockerSocketPath?: string | null; // Custom socket path override
  // Enterprise conversation logging
  conversationLoggingEnabled?: boolean;
  conversationRetentionDays?: number; // Days to retain logs (7-365)
}

// List of supported terminal emulators
export const SUPPORTED_TERMINALS = [
  { value: "", label: "Auto-detect (recommended)" },
  { value: "ghostty", label: "Ghostty" },
  { value: "gnome-terminal", label: "GNOME Terminal" },
  { value: "konsole", label: "Konsole" },
  { value: "alacritty", label: "Alacritty" },
  { value: "kitty", label: "kitty" },
  { value: "xfce4-terminal", label: "Xfce Terminal" },
  { value: "mate-terminal", label: "MATE Terminal" },
  { value: "terminator", label: "Terminator" },
  { value: "tilix", label: "Tilix" },
  { value: "xterm", label: "xterm" },
] as const;

// Get current settings
export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  let currentSettings = db.select().from(settings).where(eq(settings.id, "default")).get();

  // Create default settings if none exist
  if (!currentSettings) {
    db.insert(settings).values({ id: "default" }).run();
    currentSettings = db.select().from(settings).where(eq(settings.id, "default")).get();
  }

  return currentSettings;
});

// Update settings
export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((input: UpdateSettingsInput) => {
    // Validate terminal emulator if provided
    if (
      input.terminalEmulator !== undefined &&
      input.terminalEmulator !== null &&
      input.terminalEmulator !== ""
    ) {
      const validTerminals: readonly string[] = SUPPORTED_TERMINALS.map((t) => t.value).filter(
        (v) => v !== ""
      );
      if (!validTerminals.includes(input.terminalEmulator)) {
        throw new Error(`Invalid terminal emulator: ${input.terminalEmulator}`);
      }
    }
    // Validate working method if provided
    if (input.defaultWorkingMethod !== undefined) {
      const validMethods = ["auto", "claude-code", "vscode", "opencode"];
      if (!validMethods.includes(input.defaultWorkingMethod)) {
        throw new Error(`Invalid working method: ${input.defaultWorkingMethod}`);
      }
    }
    // Validate Docker runtime if provided
    if (
      input.dockerRuntime !== undefined &&
      input.dockerRuntime !== null &&
      !DOCKER_RUNTIME_TYPES.includes(input.dockerRuntime)
    ) {
      throw new Error(
        `Invalid Docker runtime: ${input.dockerRuntime}. Valid values: ${DOCKER_RUNTIME_TYPES.join(", ")}`
      );
    }
    return input;
  })
  .handler(async ({ data: updates }) => {
    const updateData: Partial<typeof settings.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.terminalEmulator !== undefined) {
      updateData.terminalEmulator = updates.terminalEmulator || null;
    }
    if (updates.ralphSandbox !== undefined) {
      updateData.ralphSandbox = updates.ralphSandbox;
    }
    if (updates.ralphTimeout !== undefined) {
      // Validate timeout: minimum 5 minutes (300s), maximum 24 hours (86400s)
      const timeout = Math.max(300, Math.min(86400, updates.ralphTimeout));
      updateData.ralphTimeout = timeout;
    }
    if (updates.autoCreatePr !== undefined) {
      updateData.autoCreatePr = updates.autoCreatePr;
    }
    if (updates.prTargetBranch !== undefined) {
      updateData.prTargetBranch = updates.prTargetBranch || "dev";
    }
    if (updates.defaultProjectsDirectory !== undefined) {
      updateData.defaultProjectsDirectory = updates.defaultProjectsDirectory || null;
    }
    if (updates.defaultWorkingMethod !== undefined) {
      updateData.defaultWorkingMethod = updates.defaultWorkingMethod;
    }
    // Docker runtime settings
    if (updates.dockerRuntime !== undefined) {
      // Store null for "auto" to indicate auto-detection, otherwise store the explicit value
      updateData.dockerRuntime = updates.dockerRuntime === "auto" ? null : updates.dockerRuntime;
    }
    if (updates.dockerSocketPath !== undefined) {
      updateData.dockerSocketPath = updates.dockerSocketPath || null;
    }
    if (updates.conversationLoggingEnabled !== undefined) {
      updateData.conversationLoggingEnabled = updates.conversationLoggingEnabled;
    }
    if (updates.conversationRetentionDays !== undefined) {
      // Validate retention: minimum 7 days, maximum 365 days
      const retention = Math.max(7, Math.min(365, updates.conversationRetentionDays));
      updateData.conversationRetentionDays = retention;
    }

    db.update(settings).set(updateData).where(eq(settings.id, "default")).run();

    return db.select().from(settings).where(eq(settings.id, "default")).get();
  });

// Detect available terminals on the system
export const detectAvailableTerminals = createServerFn({ method: "GET" }).handler(async () => {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const terminalChecks = [
    { cmd: "ghostty", check: "ghostty --version" },
    { cmd: "gnome-terminal", check: "gnome-terminal --version" },
    { cmd: "konsole", check: "konsole --version" },
    { cmd: "alacritty", check: "alacritty --version" },
    { cmd: "kitty", check: "kitty --version" },
    { cmd: "xfce4-terminal", check: "xfce4-terminal --version" },
    { cmd: "mate-terminal", check: "mate-terminal --version" },
    { cmd: "terminator", check: "terminator --version" },
    { cmd: "tilix", check: "tilix --version" },
    { cmd: "xterm", check: "xterm -version" },
  ];

  const available: string[] = [];

  for (const terminal of terminalChecks) {
    try {
      await execAsync(terminal.check);
      available.push(terminal.cmd);
    } catch {
      // Terminal not available
    }
  }

  return available;
});

// Check if Docker is available and get sandbox image status
export const getDockerStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { execDockerCommand, getEffectiveDockerRuntime } = await import("./docker-utils");

  const status = {
    dockerAvailable: false,
    dockerRunning: false,
    imageBuilt: false,
    imageTag: "brain-dump-ralph-sandbox:latest",
    // Include runtime info for UI display
    runtimeType: null as string | null,
    socketPath: null as string | null,
  };

  // Check if Docker is installed (basic check, doesn't need socket)
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    await execAsync("docker --version");
    status.dockerAvailable = true;
  } catch {
    return status;
  }

  // Check if Docker daemon is running with configured/detected socket
  try {
    await execDockerCommand("info");
    status.dockerRunning = true;

    // Get runtime info for display
    const runtime = await getEffectiveDockerRuntime();
    status.runtimeType = runtime.type;
    status.socketPath = runtime.socketPath;
  } catch {
    return status;
  }

  // Check if sandbox image exists
  try {
    await execDockerCommand(`image inspect ${status.imageTag}`);
    status.imageBuilt = true;
  } catch {
    // Image not built yet
  }

  return status;
});

// Build the Ralph sandbox Docker image
export const buildSandboxImage = createServerFn({ method: "POST" }).handler(async () => {
  const { join } = await import("path");
  const { execDockerCommand } = await import("./docker-utils");

  // Find the docker directory relative to this file
  // In production, we need to find it from the project root
  const dockerfilePath = join(process.cwd(), "docker", "ralph-sandbox.Dockerfile");
  const contextPath = join(process.cwd(), "docker");

  try {
    const { stdout } = await execDockerCommand(
      `build -t brain-dump-ralph-sandbox:latest -f "${dockerfilePath}" "${contextPath}"`,
      { timeout: 300000 } // 5 minute timeout
    );
    return { success: true, message: "Sandbox image built successfully", output: stdout };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Failed to build sandbox image: ${errorMessage}` };
  }
});
