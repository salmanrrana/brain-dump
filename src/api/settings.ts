import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { settings } from "../lib/schema";
import { eq } from "drizzle-orm";

// Types
export interface UpdateSettingsInput {
  terminalEmulator?: string | null;
  ralphSandbox?: boolean;
  autoCreatePr?: boolean;
  prTargetBranch?: string;
  defaultProjectsDirectory?: string | null;
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
export const getSettings = createServerFn({ method: "GET" }).handler(
  async () => {
    let currentSettings = db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"))
      .get();

    // Create default settings if none exist
    if (!currentSettings) {
      db.insert(settings).values({ id: "default" }).run();
      currentSettings = db
        .select()
        .from(settings)
        .where(eq(settings.id, "default"))
        .get();
    }

    return currentSettings;
  }
);

// Update settings
export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((input: UpdateSettingsInput) => {
    // Validate terminal emulator if provided
    if (input.terminalEmulator !== undefined && input.terminalEmulator !== null && input.terminalEmulator !== "") {
      const validTerminals: readonly string[] = SUPPORTED_TERMINALS.map((t) => t.value).filter(v => v !== "");
      if (!validTerminals.includes(input.terminalEmulator)) {
        throw new Error(`Invalid terminal emulator: ${input.terminalEmulator}`);
      }
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
    if (updates.autoCreatePr !== undefined) {
      updateData.autoCreatePr = updates.autoCreatePr;
    }
    if (updates.prTargetBranch !== undefined) {
      updateData.prTargetBranch = updates.prTargetBranch || "dev";
    }
    if (updates.defaultProjectsDirectory !== undefined) {
      updateData.defaultProjectsDirectory = updates.defaultProjectsDirectory || null;
    }

    db.update(settings)
      .set(updateData)
      .where(eq(settings.id, "default"))
      .run();

    return db.select().from(settings).where(eq(settings.id, "default")).get();
  });

// Detect available terminals on the system
export const detectAvailableTerminals = createServerFn({ method: "GET" }).handler(
  async () => {
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
  }
);

// Check if Docker is available and get sandbox image status
export const getDockerStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const status = {
      dockerAvailable: false,
      dockerRunning: false,
      imageBuilt: false,
      imageTag: "brain-dumpy-ralph-sandbox:latest",
    };

    // Check if Docker is installed
    try {
      await execAsync("docker --version");
      status.dockerAvailable = true;
    } catch {
      return status;
    }

    // Check if Docker daemon is running
    try {
      await execAsync("docker info");
      status.dockerRunning = true;
    } catch {
      return status;
    }

    // Check if sandbox image exists
    try {
      await execAsync(`docker image inspect ${status.imageTag}`);
      status.imageBuilt = true;
    } catch {
      // Image not built yet
    }

    return status;
  }
);

// Build the Ralph sandbox Docker image
export const buildSandboxImage = createServerFn({ method: "POST" }).handler(
  async () => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { join } = await import("path");
    const execAsync = promisify(exec);

    // Find the docker directory relative to this file
    // In production, we need to find it from the project root
    const dockerfilePath = join(process.cwd(), "docker", "ralph-sandbox.Dockerfile");
    const contextPath = join(process.cwd(), "docker");

    try {
      const { stdout } = await execAsync(
        `docker build -t brain-dumpy-ralph-sandbox:latest -f "${dockerfilePath}" "${contextPath}"`,
        { timeout: 300000 } // 5 minute timeout
      );
      return { success: true, message: "Sandbox image built successfully", output: stdout };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, message: `Failed to build sandbox image: ${errorMessage}` };
    }
  }
);
