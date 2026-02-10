import { createServerFn } from "@tanstack/react-start";
import { detectTerminal, isTerminalAvailable, buildTerminalCommand } from "./terminal-utils";
import { buildCodexAppLaunchPlan } from "./codex-launch";
import { sqlite } from "../lib/db";
import { startWork, createRealGitOperations, CoreError } from "../../core/index.ts";

const coreGit = createRealGitOperations();

interface InstallCheck {
  installed: boolean;
  mode?: "cli" | "app";
  error?: string;
}

// Check if OpenCode CLI is installed
async function isOpenCodeInstalled(): Promise<InstallCheck> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("opencode --version");
    return { installed: true, mode: "cli" };
  } catch (error) {
    // Check if it's a "command not found" error
    const err = error as Error & { code?: string };
    if (
      err.code === "ENOENT" ||
      err.message?.includes("not found") ||
      err.message?.includes("command not found")
    ) {
      return {
        installed: false,
        error: "OpenCode CLI is not installed. Install it from: https://github.com/sst/opencode",
      };
    }
    // Other errors - might be installed but having issues
    return {
      installed: false,
      error: `OpenCode check failed: ${err.message}`,
    };
  }
}

// Check if Codex CLI is installed
async function isCodexCliInstalled(): Promise<InstallCheck> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("codex --version");
    return { installed: true, mode: "cli" };
  } catch (error) {
    const err = error as Error & { code?: string };
    if (
      err.code === "ENOENT" ||
      err.message?.includes("not found") ||
      err.message?.includes("command not found")
    ) {
      return {
        installed: false,
        error:
          "Codex CLI is not installed in PATH. Install Codex CLI from: https://developers.openai.com/codex/app (or choose Codex App launch mode).",
      };
    }
    return {
      installed: false,
      error: `Codex CLI check failed: ${err.message}`,
    };
  }
}

// Check if Codex App is installed (macOS)
async function isCodexAppInstalled(): Promise<InstallCheck> {
  if (process.platform !== "darwin") {
    return {
      installed: false,
      error: "Codex App launch is currently supported on macOS.",
    };
  }

  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const { existsSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");

  const appPaths = ["/Applications/Codex.app", join(homedir(), "Applications", "Codex.app")];
  const bundledCliPaths = [
    "/Applications/Codex.app/Contents/Resources/codex",
    join(homedir(), "Applications", "Codex.app", "Contents", "Resources", "codex"),
  ];
  if (appPaths.some((appPath) => existsSync(appPath))) {
    return { installed: true, mode: "app" };
  }
  if (bundledCliPaths.some((cliPath) => existsSync(cliPath))) {
    return { installed: true, mode: "app" };
  }

  try {
    await execAsync("open -Ra Codex");
    return { installed: true, mode: "app" };
  } catch {
    // Try alternate name and continue to error handling below on failure.
    try {
      await execAsync('open -Ra "Codex.app"');
      return { installed: true, mode: "app" };
    } catch {
      return {
        installed: false,
        error: "Codex App is not installed. Install it from: https://developers.openai.com/codex/app",
      };
    }
  }
}

// Check if Codex is installed (CLI or app)
async function isCodexInstalled(): Promise<InstallCheck> {
  const cliCheck = await isCodexCliInstalled();
  if (cliCheck.installed) {
    return cliCheck;
  }

  const appCheck = await isCodexAppInstalled();
  if (appCheck.installed) {
    return appCheck;
  }

  return {
    installed: false,
    error: "Codex is not installed. Install Codex App/CLI from: https://developers.openai.com/codex/app",
  };
}

function codexLaunchErrorForMode(mode: "auto" | "cli" | "app", check: InstallCheck): string {
  if (check.error) {
    return check.error;
  }
  if (mode === "cli") {
    return "Codex CLI is not installed. Install it or choose Codex App launch.";
  }
  if (mode === "app") {
    return "Codex App is not installed. Install it or choose Codex CLI launch.";
  }
  return "Codex is not installed. Context copied to clipboard instead.";
}

// Check if Copilot CLI is installed
async function isCopilotInstalled(): Promise<InstallCheck> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("copilot --version");
    return { installed: true, mode: "cli" };
  } catch (error) {
    const err = error as Error & { code?: string };
    if (
      err.code === "ENOENT" ||
      err.message?.includes("not found") ||
      err.message?.includes("command not found")
    ) {
      return {
        installed: false,
        error: "Copilot CLI is not installed. Install it and try again.",
      };
    }
    return {
      installed: false,
      error: `Copilot CLI check failed: ${err.message}`,
    };
  }
}

// Check if Cursor is installed (CLI or app)
async function isCursorInstalled(): Promise<InstallCheck> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("cursor --version");
    return { installed: true, mode: "cli" };
  } catch (error) {
    const err = error as Error & { code?: string };

    if (process.platform === "darwin") {
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const appPaths = ["/Applications/Cursor.app", join(homedir(), "Applications", "Cursor.app")];
      if (appPaths.some((appPath) => existsSync(appPath))) {
        return { installed: true, mode: "app" };
      }

      try {
        await execAsync("open -Ra Cursor");
        return { installed: true, mode: "app" };
      } catch {
        // Continue to error handling below.
      }
    }

    if (
      err.code === "ENOENT" ||
      err.message?.includes("not found") ||
      err.message?.includes("command not found")
    ) {
      return {
        installed: false,
        error: "Cursor is not installed. Install Cursor app/CLI and try again.",
      };
    }

    return {
      installed: false,
      error: `Cursor check failed: ${err.message}`,
    };
  }
}

// Check if VS Code is installed (CLI or app)
async function isVSCodeInstalled(): Promise<InstallCheck> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("code --version");
    return { installed: true, mode: "cli" };
  } catch (error) {
    const err = error as Error & { code?: string };

    if (process.platform === "darwin") {
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const appPaths = [
        "/Applications/Visual Studio Code.app",
        join(homedir(), "Applications", "Visual Studio Code.app"),
      ];
      const bundledCliPaths = [
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        join(
          homedir(),
          "Applications",
          "Visual Studio Code.app",
          "Contents",
          "Resources",
          "app",
          "bin",
          "code"
        ),
      ];
      if (appPaths.some((appPath) => existsSync(appPath))) {
        return { installed: true, mode: "app" };
      }
      if (bundledCliPaths.some((cliPath) => existsSync(cliPath))) {
        return { installed: true, mode: "app" };
      }

      try {
        await execAsync('open -Ra "Visual Studio Code"');
        return { installed: true, mode: "app" };
      } catch {
        // Try alternate app name and continue to error handling below on failure.
        try {
          await execAsync("open -Ra Code");
          return { installed: true, mode: "app" };
        } catch {
          // Continue to error handling below.
        }
      }
    }

    if (
      err.code === "ENOENT" ||
      err.message?.includes("not found") ||
      err.message?.includes("command not found")
    ) {
      return {
        installed: false,
        error: "VS Code is not installed. Install VS Code (and optional 'code' shell command).",
      };
    }

    return {
      installed: false,
      error: `VS Code check failed: ${err.message}`,
    };
  }
}

interface LaunchResult {
  success: boolean;
  method: "terminal" | "clipboard" | "app";
  message: string;
  terminalUsed?: string;
  warnings?: string[];
}

// Legacy alias for backwards compatibility
type LaunchClaudeResult = LaunchResult;

// Clean up old launch scripts (older than 5 minutes)
// Exported so it can be called on app startup
export async function cleanupOldScripts(): Promise<void> {
  try {
    const { readdirSync, statSync, unlinkSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const scriptDir = join(homedir(), ".brain-dump", "scripts");

    if (!existsSync(scriptDir)) {
      return; // Nothing to clean up
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const files = readdirSync(scriptDir);
    let cleanedCount = 0;

    for (const file of files) {
      if (file.startsWith("launch-") && file.endsWith(".sh")) {
        const filePath = join(scriptDir, file);
        try {
          const stats = statSync(filePath);
          if (stats.mtimeMs < fiveMinutesAgo) {
            unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (fileError) {
          console.warn(`[brain-dump] Failed to clean up script ${file}:`, fileError);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[brain-dump] Cleaned up ${cleanedCount} old launch script(s)`);
    }
  } catch (error) {
    console.error("[brain-dump] Script cleanup error:", error);
  }
}

// Escape a string for safe use in bash double-quoted strings
function escapeForBashDoubleQuote(str: string): string {
  // In double quotes, escape: \ $ ` " ! (and newlines)
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/!/g, "\\!");
}

// Validate project path doesn't contain dangerous characters
function validateProjectPath(path: string): void {
  if (path.includes("\0")) {
    throw new Error("Invalid project path: contains null bytes");
  }
  // Check for shell metacharacters that could be dangerous
  const metaCharMatch = path.match(/[;&|<>]/);
  if (metaCharMatch) {
    throw new Error(
      `Invalid project path: contains shell metacharacter '${metaCharMatch[0]}' at position ${path.indexOf(metaCharMatch[0])}`
    );
  }
}

// Write launch context to a project-local file for GUI app fallbacks.
async function writeProjectContextFile(projectPath: string, context: string): Promise<string> {
  const { writeFileSync } = await import("fs");
  const { join } = await import("path");

  validateProjectPath(projectPath);
  const contextFile = join(projectPath, ".brain-dump-context.md");
  writeFileSync(contextFile, context);
  return contextFile;
}

async function runFirstSuccessfulCommand(
  commands: string[]
): Promise<{ success: true; command: string } | { success: false; error: string }> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  let lastError = "No command candidates provided.";
  for (const command of commands) {
    try {
      await execAsync(command);
      return { success: true, command };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { success: false, error: lastError };
}

async function copyToSystemClipboard(text: string): Promise<void> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);
  const { writeFileSync, unlinkSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  const { randomUUID } = await import("crypto");

  const tmpFile = join(tmpdir(), `brain-dump-clipboard-${randomUUID()}.txt`);
  writeFileSync(tmpFile, text, "utf8");

  try {
    if (process.platform === "darwin") {
      await execAsync(`cat "${tmpFile}" | pbcopy`);
      return;
    }
    if (process.platform === "linux") {
      // Try wl-copy first (Wayland), then xclip (X11).
      const result = await runFirstSuccessfulCommand([
        `cat "${tmpFile}" | wl-copy`,
        `cat "${tmpFile}" | xclip -selection clipboard`,
      ]);
      if (!result.success) {
        throw new Error(result.error);
      }
      return;
    }

    throw new Error("Clipboard support is not available on this platform.");
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // Best effort cleanup.
    }
  }
}

async function seedCodexAppConversation(context: string): Promise<{ success: true } | { success: false; message: string }> {
  if (process.platform !== "darwin") {
    return {
      success: false,
      message: "Codex App conversation seeding is currently supported on macOS only.",
    };
  }

  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await copyToSystemClipboard(context);
  } catch (error) {
    return {
      success: false,
      message: `Could not copy context to clipboard: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  // Best effort: open Codex, create a new thread, paste context, and send.
  // This requires Accessibility permissions for System Events.
  const script = [
    'tell application "Codex" to activate',
    "delay 0.45",
    'tell application "System Events"',
    '  keystroke "n" using command down',
    "  delay 0.2",
    '  keystroke "v" using command down',
    "  delay 0.1",
    "  key code 36",
    "end tell",
  ]
    .map((line) => `-e '${line}'`)
    .join(" ");

  try {
    await execAsync(`osascript ${script}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Could not auto-send prompt to Codex App: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export function generateClaudeLaunchScript(
  projectPath: string,
  context: string,
  ticketTitle: string
): string {
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);

  return `#!/bin/bash
cd "${safeProjectPath}"

# Save context to a hidden file in the project directory
# This ensures Claude has permission to read it without prompting
CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

# Brief visual confirmation
echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Starting Work\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch Claude with the context file - runs like normal terminal
claude "$CONTEXT_FILE"

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;32m✅ Claude session ended.\\033[0m"
exec bash
`;
}

export function generateOpenCodeLaunchScript(
  projectPath: string,
  context: string,
  ticketTitle: string
): string {
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);

  return `#!/bin/bash

cd "${safeProjectPath}"

# Save context to a hidden file in the project directory
CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

# Brief visual confirmation (blue for OpenCode)
echo ""
echo -e "\\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;34m💻 Brain Dump - Starting with OpenCode\\033[0m"
echo -e "\\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch OpenCode with the project path and initial prompt
# OpenCode uses the user's default/last-used model preference
opencode "${safeProjectPath}" --prompt "$(cat "$CONTEXT_FILE")"

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;34m✅ OpenCode session ended.\\033[0m"
exec bash
`;
}

export function generateCodexLaunchScript(
  projectPath: string,
  context: string,
  ticketTitle: string
): string {
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);

  return `#!/bin/bash

cd "${safeProjectPath}"

# Save context to a hidden file in the project directory
CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

# Brief visual confirmation (green for Codex)
echo ""
echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Starting with Codex\\033[0m"
echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch Codex with the prompt content
codex "$(cat "$CONTEXT_FILE")"

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;32m✅ Codex session ended.\\033[0m"
exec bash
`;
}

export function generateCopilotLaunchScript(
  projectPath: string,
  context: string,
  ticketTitle: string
): string {
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);

  return `#!/bin/bash

cd "${safeProjectPath}"

CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;36m🤖 Brain Dump - Starting with Copilot CLI\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Copilot CLI programmatic mode requires -p/--prompt.
if ! copilot -p "$(cat "$CONTEXT_FILE")"; then
  copilot || true
fi

rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;36m✅ Copilot CLI session ended.\\033[0m"
exec bash
`;
}
// Create a temp script to launch Claude - avoids complex escaping issues
async function createLaunchScript(projectPath: string, context: string): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  // Validate project path
  validateProjectPath(projectPath);

  // Clean up old scripts first
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `launch-${randomUUID()}.sh`);

  // Extract ticket title from context (first line after "# Task: ")
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";

  const script = generateClaudeLaunchScript(projectPath, context, ticketTitle);

  // Use 0o700 - owner read/write/execute only (no group/world access)
  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

// Build window title in format: [Project][Epic][Ticket] or [Project][Ticket]
function buildWindowTitle(
  projectName: string,
  epicName: string | null,
  ticketTitle: string
): string {
  if (epicName) {
    return `[${projectName}][${epicName}][${ticketTitle}]`;
  }
  return `[${projectName}][${ticketTitle}]`;
}

// Launch Claude in terminal with ticket context
export const launchClaudeInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchClaudeResult> => {
    const {
      ticketId,
      context,
      projectPath,
      preferredTerminal,
      projectName,
      epicName,
      ticketTitle,
    } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    // Verify project path exists
    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    // Determine which terminal to use
    let terminal: string | null = null;
    const warnings: string[] = [];

    // If preferred terminal is set and available, use it
    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) {
        terminal = preferredTerminal;
      } else {
        // Preferred terminal not available - add warning
        const reason = result.error || "not installed";
        warnings.push(
          `Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`
        );
      }
    }

    // Fallback to auto-detect if no preferred terminal or preferred is unavailable
    if (!terminal) {
      terminal = await detectTerminal();
    }

    if (!terminal) {
      return {
        success: false,
        method: "clipboard",
        message: "No supported terminal emulator found. Context copied to clipboard instead.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    // Start ticket workflow: git branch, status update, workflow state, audit comment
    try {
      const workflowResult = startWork(sqlite, ticketId, coreGit);
      warnings.push(...workflowResult.warnings);
    } catch (err) {
      warnings.push(
        err instanceof CoreError
          ? err.message
          : "Failed to start ticket workflow. You may need to update status manually."
      );
    }

    // Save current ticket ID to state file for CLI tool
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push(
        "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
      );
    }

    // Create launch script and build terminal command with window title
    const scriptPath = await createLaunchScript(projectPath, context);
    const windowTitle = buildWindowTitle(projectName, epicName, ticketTitle);
    const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath, windowTitle);

    try {
      // Launch terminal (don't wait for it to complete)
      exec(terminalCommand, (error) => {
        if (error) {
          console.error("Terminal launch error:", error);
        }
      });

      return {
        success: true,
        method: "terminal",
        message: `Launched Claude in ${terminal}`,
        terminalUsed: terminal,
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Create a temp script to launch OpenCode - similar to createLaunchScript but for OpenCode
async function createOpenCodeLaunchScript(projectPath: string, context: string): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  // Validate project path
  validateProjectPath(projectPath);

  // Clean up old scripts first
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  try {
    mkdirSync(scriptDir, { recursive: true });
  } catch (mkdirError) {
    throw new Error(
      `Failed to create script directory '${scriptDir}': ${mkdirError instanceof Error ? mkdirError.message : "Unknown error"}`
    );
  }

  const scriptPath = join(scriptDir, `launch-opencode-${randomUUID()}.sh`);

  // Extract ticket title from context (first line after "# Task: ")
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";

  const script = generateOpenCodeLaunchScript(projectPath, context, ticketTitle);

  // Use 0o700 - owner read/write/execute only
  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

// Launch OpenCode in terminal with ticket context
// Note: Uses exec() for terminal launching (same as launchClaudeInTerminal) because
// terminal commands require shell interpretation. Input is validated by validateProjectPath.
export const launchOpenCodeInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchResult> => {
    const {
      ticketId,
      context,
      projectPath,
      preferredTerminal,
      projectName,
      epicName,
      ticketTitle,
    } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    // Verify project path exists
    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    // Check if OpenCode is installed before proceeding
    const openCodeCheck = await isOpenCodeInstalled();
    if (!openCodeCheck.installed) {
      return {
        success: false,
        method: "clipboard",
        message:
          openCodeCheck.error || "OpenCode is not installed. Context copied to clipboard instead.",
      };
    }

    // Determine which terminal to use
    let terminal: string | null = null;
    const warnings: string[] = [];

    // If preferred terminal is set and available, use it
    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) {
        terminal = preferredTerminal;
      } else {
        const reason = result.error || "not installed";
        warnings.push(
          `Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`
        );
      }
    }

    // Fallback to auto-detect if no preferred terminal or preferred is unavailable
    if (!terminal) {
      terminal = await detectTerminal();
    }

    if (!terminal) {
      return {
        success: false,
        method: "clipboard",
        message: "No supported terminal emulator found. Context copied to clipboard instead.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    // Start ticket workflow: git branch, status update, workflow state, audit comment
    try {
      const workflowResult = startWork(sqlite, ticketId, coreGit);
      warnings.push(...workflowResult.warnings);
    } catch (err) {
      warnings.push(
        err instanceof CoreError
          ? err.message
          : "Failed to start ticket workflow. You may need to update status manually."
      );
    }

    // Save current ticket ID to state file for CLI tool
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push(
        "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
      );
    }

    // Create launch script and build terminal command with window title
    const scriptPath = await createOpenCodeLaunchScript(projectPath, context);
    const windowTitle = buildWindowTitle(projectName, epicName, ticketTitle);
    const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath, windowTitle);

    try {
      // Launch terminal (don't wait for it to complete)
      // Note: exec is fire-and-forget - we can't know if the terminal window actually opened
      exec(terminalCommand, (error) => {
        if (error) {
          console.error("Terminal launch error:", error);
        }
      });

      return {
        success: true,
        method: "terminal",
        message: `Opening OpenCode in ${terminal}... If no window appears, check that ${terminal} is running.`,
        terminalUsed: terminal,
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Create a temp script to launch Codex - similar to OpenCode/Claude launch scripts
async function createCodexLaunchScript(projectPath: string, context: string): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  validateProjectPath(projectPath);
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  try {
    mkdirSync(scriptDir, { recursive: true });
  } catch (mkdirError) {
    throw new Error(
      `Failed to create script directory '${scriptDir}': ${mkdirError instanceof Error ? mkdirError.message : "Unknown error"}`
    );
  }

  const scriptPath = join(scriptDir, `launch-codex-${randomUUID()}.sh`);
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";
  const script = generateCodexLaunchScript(projectPath, context, ticketTitle);

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

// Create a temp script to launch Copilot CLI with ticket context
async function createCopilotLaunchScript(projectPath: string, context: string): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  validateProjectPath(projectPath);
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `launch-copilot-${randomUUID()}.sh`);
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";
  const script = generateCopilotLaunchScript(projectPath, context, ticketTitle);

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

// Launch Codex (CLI in terminal, or Codex App fallback on macOS)
export const launchCodexInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      launchMode?: "auto" | "cli" | "app";
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchResult> => {
    const {
      ticketId,
      context,
      projectPath,
      launchMode = "auto",
      preferredTerminal,
      projectName,
      epicName,
      ticketTitle,
    } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    const codexCheck =
      launchMode === "cli"
        ? await isCodexCliInstalled()
        : launchMode === "app"
          ? await isCodexAppInstalled()
          : await isCodexInstalled();
    if (!codexCheck.installed) {
      return {
        success: false,
        method: "clipboard",
        message: codexLaunchErrorForMode(launchMode, codexCheck),
      };
    }

    const warnings: string[] = [];

    try {
      const workflowResult = startWork(sqlite, ticketId, coreGit);
      warnings.push(...workflowResult.warnings);
    } catch (err) {
      warnings.push(
        err instanceof CoreError
          ? err.message
          : "Failed to start ticket workflow. You may need to update status manually."
      );
    }

    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push(
        "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
      );
    }

    const shouldUseCli = launchMode === "cli" || (launchMode === "auto" && codexCheck.mode === "cli");

    // Use Codex CLI in a terminal.
    if (shouldUseCli) {
      let terminal: string | null = null;

      if (preferredTerminal) {
        const result = await isTerminalAvailable(preferredTerminal);
        if (result.available) {
          terminal = preferredTerminal;
        } else {
          const reason = result.error || "not installed";
          warnings.push(
            `Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`
          );
        }
      }

      if (!terminal) {
        terminal = await detectTerminal();
      }

      if (!terminal) {
        return {
          success: false,
          method: "clipboard",
          message: "No supported terminal emulator found. Context copied to clipboard instead.",
          ...(warnings.length > 0 && { warnings }),
        };
      }

      const scriptPath = await createCodexLaunchScript(projectPath, context);
      const windowTitle = buildWindowTitle(projectName, epicName, ticketTitle);
      const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath, windowTitle);

      try {
        exec(terminalCommand, (error) => {
          if (error) {
            console.error("Terminal launch error:", error);
          }
        });

        return {
          success: true,
          method: "terminal",
          message: `Opening Codex in ${terminal}... If no window appears, check that ${terminal} is running.`,
          terminalUsed: terminal,
          ...(warnings.length > 0 && { warnings }),
        };
      } catch (error) {
        return {
          success: false,
          method: "clipboard",
          message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
          ...(warnings.length > 0 && { warnings }),
        };
      }
    }

    // Use Codex App launch and persist context in project.
    try {
      const contextFile = await writeProjectContextFile(projectPath, context);
      const launchPlan = buildCodexAppLaunchPlan(projectPath, contextFile);

      const projectLaunch = await runFirstSuccessfulCommand(launchPlan.projectCommands);
      if (!projectLaunch.success) {
        throw new Error(projectLaunch.error);
      }

      const contextLaunch = await runFirstSuccessfulCommand(launchPlan.contextCommands);
      if (!contextLaunch.success) {
        warnings.push(
          `Opened Codex App, but could not auto-open context file. Please open "${contextFile}" manually.`
        );
      }

      const seedResult = await seedCodexAppConversation(context);
      if (!seedResult.success) {
        warnings.push(seedResult.message);
      }

      return {
        success: true,
        method: "app",
        message: `Opened Codex App. Context file: ${contextFile}`,
        terminalUsed: "Codex App",
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch Codex App: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Launch Copilot CLI in terminal with ticket context
export const launchCopilotInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchResult> => {
    const {
      ticketId,
      context,
      projectPath,
      preferredTerminal,
      projectName,
      epicName,
      ticketTitle,
    } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    const copilotCheck = await isCopilotInstalled();
    if (!copilotCheck.installed) {
      return {
        success: false,
        method: "clipboard",
        message:
          copilotCheck.error || "Copilot CLI is not installed. Context copied to clipboard instead.",
      };
    }

    let terminal: string | null = null;
    const warnings: string[] = [];

    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) {
        terminal = preferredTerminal;
      } else {
        const reason = result.error || "not installed";
        warnings.push(
          `Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`
        );
      }
    }

    if (!terminal) {
      terminal = await detectTerminal();
    }

    if (!terminal) {
      return {
        success: false,
        method: "clipboard",
        message: "No supported terminal emulator found. Context copied to clipboard instead.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    try {
      const workflowResult = startWork(sqlite, ticketId, coreGit);
      warnings.push(...workflowResult.warnings);
    } catch (err) {
      warnings.push(
        err instanceof CoreError
          ? err.message
          : "Failed to start ticket workflow. You may need to update status manually."
      );
    }

    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push(
        "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
      );
    }

    const scriptPath = await createCopilotLaunchScript(projectPath, context);
    const windowTitle = buildWindowTitle(projectName, epicName, ticketTitle);
    const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath, windowTitle);

    try {
      exec(terminalCommand, (error) => {
        if (error) {
          console.error("Terminal launch error:", error);
        }
      });

      return {
        success: true,
        method: "terminal",
        message: `Opening Copilot CLI in ${terminal}... If no window appears, check that ${terminal} is running.`,
        terminalUsed: terminal,
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Launch Cursor app/CLI for a ticket context.
export const launchCursorInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchResult> => {
    const { ticketId, context, projectPath } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    const cursorCheck = await isCursorInstalled();
    if (!cursorCheck.installed) {
      return {
        success: false,
        method: "clipboard",
        message: cursorCheck.error || "Cursor is not installed. Context copied to clipboard instead.",
      };
    }

    const warnings: string[] = [];

    try {
      const workflowResult = startWork(sqlite, ticketId, coreGit);
      warnings.push(...workflowResult.warnings);
    } catch (err) {
      warnings.push(
        err instanceof CoreError
          ? err.message
          : "Failed to start ticket workflow. You may need to update status manually."
      );
    }

    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push(
        "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
      );
    }

    try {
      const contextFile = await writeProjectContextFile(projectPath, context);
      const safeProjectPath = escapeForBashDoubleQuote(projectPath);

      const launchCommand =
        cursorCheck.mode === "cli"
          ? `cursor "${safeProjectPath}"`
          : `open -a "Cursor" "${safeProjectPath}"`;

      exec(launchCommand, (error) => {
        if (error) {
          console.error("Cursor launch error:", error);
        }
      });

      return {
        success: true,
        method: "app",
        message: `Opened Cursor. Context saved to ${contextFile}.`,
        terminalUsed: "Cursor",
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch Cursor: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Launch VS Code app/CLI for a ticket context.
export const launchVSCodeInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchResult> => {
    const { ticketId, context, projectPath } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    const vscodeCheck = await isVSCodeInstalled();
    if (!vscodeCheck.installed) {
      return {
        success: false,
        method: "clipboard",
        message: vscodeCheck.error || "VS Code is not installed. Context copied to clipboard instead.",
      };
    }

    const warnings: string[] = [];

    try {
      const workflowResult = startWork(sqlite, ticketId, coreGit);
      warnings.push(...workflowResult.warnings);
    } catch (err) {
      warnings.push(
        err instanceof CoreError
          ? err.message
          : "Failed to start ticket workflow. You may need to update status manually."
      );
    }

    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push(
        "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
      );
    }

    try {
      const contextFile = await writeProjectContextFile(projectPath, context);
      const safeProjectPath = escapeForBashDoubleQuote(projectPath);
      const safeContextFile = escapeForBashDoubleQuote(contextFile);

      const launchCommand =
        vscodeCheck.mode === "cli"
          ? `code -n "${safeProjectPath}" -g "${safeContextFile}"`
          : `open -a "Visual Studio Code" "${safeProjectPath}" && open -a "Visual Studio Code" "${safeContextFile}"`;

      exec(launchCommand, (error) => {
        if (error) {
          console.error("VS Code launch error:", error);
        }
      });

      return {
        success: true,
        method: "app",
        message: `Opened VS Code. Context saved to ${contextFile}.`,
        terminalUsed: "VS Code",
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch VS Code: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });
// Get current working ticket (for CLI tool)
export const getCurrentTicket = createServerFn({ method: "GET" })
  .inputValidator(() => {})
  .handler(async () => {
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const stateFile = join(homedir(), ".brain-dump", "current-ticket.json");

    if (!existsSync(stateFile)) {
      return null;
    }

    try {
      const content = readFileSync(stateFile, "utf-8");
      return JSON.parse(content) as {
        ticketId: string;
        projectPath: string;
        startedAt: string;
      };
    } catch {
      return null;
    }
  });

// Clear current ticket (called when work is done)
export const clearCurrentTicket = createServerFn({ method: "POST" })
  .inputValidator(() => {})
  .handler(async () => {
    const { unlinkSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const stateFile = join(homedir(), ".brain-dump", "current-ticket.json");

    if (existsSync(stateFile)) {
      unlinkSync(stateFile);
    }

    return { success: true };
  });
