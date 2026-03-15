import { execDockerCommand } from "./docker-utils";

// ============================================================================
// UTILITIES
// ============================================================================

export function escapeForBashDoubleQuote(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/!/g, "\\!");
}

// ============================================================================
// CLI DISCOVERY
// ============================================================================

// Check if VS Code CLI is available and get the path
export async function findVSCodeCli(): Promise<string | null> {
  const { execSync } = await import("child_process");
  const { existsSync } = await import("fs");

  // First check if 'code' is in PATH
  try {
    execSync("which code", { stdio: "pipe" });
    return "code";
  } catch {
    // Not in PATH, check common macOS locations
  }

  // macOS: Check the full path to VS Code CLI
  const macOSPaths = [
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    "/usr/local/bin/code",
    `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,
  ];

  for (const codePath of macOSPaths) {
    if (existsSync(codePath)) {
      return codePath;
    }
  }

  return null;
}

// Check if Cursor CLI is available and get the path
export async function findCursorCli(): Promise<string | null> {
  const { execSync } = await import("child_process");
  const { existsSync } = await import("fs");

  try {
    execSync("which cursor", { stdio: "pipe" });
    return "cursor";
  } catch {
    // Not in PATH, check common macOS locations
  }

  const macOSPaths = [
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    "/usr/local/bin/cursor",
    `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`,
  ];

  for (const cursorPath of macOSPaths) {
    if (existsSync(cursorPath)) {
      return cursorPath;
    }
  }

  return null;
}

// Check if Copilot CLI is available
export async function isCopilotCliInstalled(): Promise<boolean> {
  const { execSync } = await import("child_process");
  try {
    execSync("copilot --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// EDITOR / CLI LAUNCHERS
// ============================================================================

// Launch VS Code with project context
// Note: exec() is used intentionally here for fire-and-forget GUI app launches.
// Paths come from the database (trusted internal values), not user input.
export async function launchInVSCode(
  projectPath: string,
  contextFilePath?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { existsSync } = await import("fs");

  // Verify project path exists
  if (!existsSync(projectPath)) {
    return {
      success: false,
      message: `Project directory not found: ${projectPath}`,
    };
  }

  // Find VS Code CLI
  const codeCli = await findVSCodeCli();
  if (!codeCli) {
    return {
      success: false,
      message:
        "VS Code CLI not found. Please install VS Code and ensure the 'code' command is available. " +
        "In VS Code, open Command Palette (Cmd+Shift+P) and run 'Shell Command: Install code command in PATH'.",
    };
  }

  // Build the command
  // Note: projectPath and contextFilePath come from the database (trusted internal values)
  // We quote paths to handle spaces but these are not arbitrary user input
  // Use -n flag to open in new window, -g to not focus a specific file
  let command = `"${codeCli}" -n "${projectPath}"`;

  // If context file provided, open it as well
  if (contextFilePath && existsSync(contextFilePath)) {
    command += ` -g "${contextFilePath}"`;
  }

  try {
    exec(command, (error) => {
      if (error) {
        console.error("VS Code launch error:", error);
      }
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch VS Code: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Launch Cursor with project context
// Note: exec() is used intentionally here for fire-and-forget GUI app launches.
// Paths come from the database (trusted internal values), not user input.
export async function launchInCursor(
  projectPath: string,
  contextFilePath?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { existsSync } = await import("fs");

  if (!existsSync(projectPath)) {
    return {
      success: false,
      message: `Project directory not found: ${projectPath}`,
    };
  }

  const cursorCli = await findCursorCli();

  try {
    if (cursorCli) {
      let command = `"${cursorCli}" -n "${projectPath}"`;
      if (contextFilePath && existsSync(contextFilePath)) {
        command += ` -g "${contextFilePath}"`;
      }
      exec(command, (error) => {
        if (error) {
          console.error("Cursor launch error:", error);
        }
      });
      return { success: true };
    }

    if (process.platform === "darwin") {
      exec(`open -a "Cursor" "${projectPath}"`, (error) => {
        if (error) {
          console.error("Cursor app launch error:", error);
        }
      });
      if (contextFilePath && existsSync(contextFilePath)) {
        exec(`open -a "Cursor" "${contextFilePath}"`, (error) => {
          if (error) {
            console.error("Cursor context launch error:", error);
          }
        });
      }
      return { success: true };
    }

    return {
      success: false,
      message: "Cursor is not installed or the `cursor` CLI is not available in PATH.",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch Cursor: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function createCopilotRalphScript(
  projectPath: string,
  contextFilePath: string
): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `ralph-copilot-${randomUUID()}.sh`);
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeContextPath = escapeForBashDoubleQuote(contextFilePath);

  const script = `#!/bin/bash
set -e

cd "${safeProjectPath}"

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;36m🤖 Brain Dump - Starting Ralph with Copilot CLI\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[1;33m📄 Context:\\033[0m ${safeContextPath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

if ! command -v copilot >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Copilot CLI not found in PATH\\033[0m"
  echo "Install GitHub Copilot CLI and retry."
  exec bash
fi

if [ -f "${safeContextPath}" ]; then
  COPILOT_PROMPT="$(cat "${safeContextPath}")"
  COPILOT_HELP="$(copilot --help 2>/dev/null || true)"
  set +e
  if echo "$COPILOT_HELP" | grep -q -- "--allow-tool"; then
    if echo "$COPILOT_HELP" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
      copilot --allow-tool 'brain-dump' -p "$COPILOT_PROMPT"
    else
      copilot --allow-tool 'brain-dump' "$COPILOT_PROMPT"
    fi
  else
    if echo "$COPILOT_HELP" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
      copilot -p "$COPILOT_PROMPT"
    else
      copilot "$COPILOT_PROMPT"
    fi
  fi
  COPILOT_EXIT=$?
  set -e
  if [ $COPILOT_EXIT -ne 0 ]; then
    echo ""
    echo -e "\\033[0;33m⚠ Copilot CLI exited with code $COPILOT_EXIT\\033[0m"
    echo "Common fixes:"
    echo "  - Run: copilot auth login"
    echo "  - Run: copilot --allow-tool 'brain-dump'"
    echo "  - Verify MCP setup: brain-dump doctor"
  fi
else
  COPILOT_HELP="$(copilot --help 2>/dev/null || true)"
  set +e
  if echo "$COPILOT_HELP" | grep -q -- "--allow-tool"; then
    copilot --allow-tool 'brain-dump'
  else
    copilot
  fi
  COPILOT_EXIT=$?
  set -e
  if [ $COPILOT_EXIT -ne 0 ]; then
    echo ""
    echo -e "\\033[0;33m⚠ Copilot CLI exited with code $COPILOT_EXIT\\033[0m"
    echo "Try: copilot auth login"
  fi
fi

exec bash
`;

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);
  return scriptPath;
}

export async function launchInCopilotCli(
  projectPath: string,
  contextFilePath: string,
  preferredTerminal?: string | null
): Promise<{ success: true; terminal: string } | { success: false; message: string }> {
  const copilotInstalled = await isCopilotCliInstalled();
  if (!copilotInstalled) {
    return {
      success: false,
      message: "Copilot CLI is not installed. Install it and try again.",
    };
  }

  const scriptPath = await createCopilotRalphScript(projectPath, contextFilePath);
  return launchInTerminal(projectPath, scriptPath, preferredTerminal);
}

// Shared launch logic for terminal
// Note: exec() is used intentionally here for fire-and-forget terminal app launches.
// The terminal command is built from trusted internal values via buildTerminalCommand().
export async function launchInTerminal(
  projectPath: string,
  scriptPath: string,
  preferredTerminal?: string | null
): Promise<{ success: true; terminal: string } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { detectTerminal, buildTerminalCommand } = await import("./terminal-utils");

  let terminal = preferredTerminal;
  if (!terminal) {
    terminal = await detectTerminal();
  }

  if (!terminal) {
    return {
      success: false,
      message: "No terminal emulator found. Please install one or set a preference.",
    };
  }

  const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath);

  try {
    exec(terminalCommand, (error) => {
      if (error) {
        console.error("Terminal launch error:", error);
      }
    });

    return { success: true, terminal };
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================================================
// DOCKER VALIDATION
// ============================================================================

// Ensure Docker network exists for container networking
export async function ensureDockerNetwork(
  networkName: string
): Promise<{ success: true } | { success: false; message: string }> {
  try {
    // Check if network already exists (uses configured/detected socket)
    await execDockerCommand(`network inspect ${networkName}`);
    console.log(`[brain-dump] Docker network "${networkName}" already exists`);
    return { success: true };
  } catch (inspectError) {
    const errorMessage =
      inspectError instanceof Error ? inspectError.message : String(inspectError);

    // Only proceed to create if the error indicates "network not found"
    // Other errors (Docker not running, permission denied) should be reported immediately
    if (!errorMessage.includes("No such network") && !errorMessage.includes("not found")) {
      console.error(`[brain-dump] Docker network inspect failed:`, errorMessage);
      return {
        success: false,
        message: `Failed to check Docker network "${networkName}": ${errorMessage}. Ensure Docker is running.`,
      };
    }

    // Network doesn't exist, create it
    try {
      await execDockerCommand(`network create ${networkName}`);
      console.log(`[brain-dump] Created Docker network "${networkName}"`);
      return { success: true };
    } catch (createError) {
      // Race condition: another process may have created it between our check and create
      // Verify by checking again
      try {
        await execDockerCommand(`network inspect ${networkName}`);
        console.log(
          `[brain-dump] Docker network "${networkName}" exists (created by another process)`
        );
        return { success: true };
      } catch {
        return {
          success: false,
          message: `Failed to create Docker network "${networkName}": ${createError instanceof Error ? createError.message : "Unknown error"}`,
        };
      }
    }
  }
}

// Validate Docker setup for sandbox mode
export async function validateDockerSetup(): Promise<
  { success: true; warnings?: string[] } | { success: false; message: string }
> {
  const { existsSync } = await import("fs");
  const { join } = await import("path");
  const warnings: string[] = [];

  // Check if Docker is running (uses configured/detected socket)
  try {
    await execDockerCommand("info");
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Docker is not accessible: ${errorDetail}. Please ensure Docker is running and you have permission to access the Docker socket.`,
    };
  }

  // Ensure ralph-net network exists for container networking
  const networkResult = await ensureDockerNetwork("ralph-net");
  if (!networkResult.success) {
    return networkResult;
  }

  // Check if image exists, build if not
  try {
    await execDockerCommand("image inspect brain-dump-ralph-sandbox:latest");
  } catch {
    // Image doesn't exist, try to build it
    console.log("[brain-dump] Building sandbox image...");
    const dockerfilePath = join(process.cwd(), "docker", "ralph-sandbox.Dockerfile");
    const contextPath = join(process.cwd(), "docker");

    if (!existsSync(dockerfilePath)) {
      return {
        success: false,
        message: "Dockerfile not found. Please ensure brain-dump is installed correctly.",
      };
    }

    try {
      await execDockerCommand(
        `build -t brain-dump-ralph-sandbox:latest -f "${dockerfilePath}" "${contextPath}"`,
        { timeout: 300000 }
      );
      console.log("[brain-dump] Sandbox image built successfully");
    } catch (buildError) {
      return {
        success: false,
        message: `Failed to build sandbox image: ${buildError instanceof Error ? buildError.message : "Unknown error"}`,
      };
    }
  }

  // Check SSH agent availability (warning, not blocking)
  const sshAuthSock = process.env.SSH_AUTH_SOCK;
  if (!sshAuthSock || !existsSync(sshAuthSock)) {
    warnings.push(
      "SSH agent not running - git push may not work from container. Start with: eval $(ssh-agent) && ssh-add"
    );
    console.log("[brain-dump] Warning: SSH agent not detected");
  } else {
    console.log("[brain-dump] SSH agent detected at:", sshAuthSock);
  }

  if (warnings.length > 0) {
    return { success: true, warnings };
  }
  return { success: true };
}
