import { createServerFn } from "@tanstack/react-start";
import { buildCodexAppLaunchPlan } from "./codex-launch";
import { sqlite } from "../lib/db";
import type {
  LaunchProviderRuntimeAvailability,
  UiLaunchProviderId,
} from "../lib/launch-provider-contract";
import type { ConcreteLaunchModelSelection } from "../lib/launch-model-catalog";

interface InteractiveTerminalLaunchInput {
  ticketId: string;
  context: string;
  projectPath: string;
  preferredTerminal?: string | null;
  projectName: string;
  epicName: string | null;
  ticketTitle: string;
  modelSelection?: ConcreteLaunchModelSelection;
}

async function startWorkflowForLaunch(ticketId: string) {
  const [{ createRealGitOperations }, { startWork }] = await Promise.all([
    import("../../core/git-utils.ts"),
    import("../../core/workflow.ts"),
  ]);

  return startWork(sqlite, ticketId, createRealGitOperations());
}

async function formatCoreError(error: unknown): Promise<string> {
  const { CoreError } = await import("../../core/errors.ts");
  return error instanceof CoreError
    ? error.message
    : `Unexpected error: ${(error as Error).message}`;
}

interface InstallCheck {
  installed: boolean;
  mode?: "cli" | "app";
  binaryPath?: string;
  error?: string;
}

// Discovery uses bounded argv calls so a looping CLI shim cannot hang the menu.
async function isClaudeInstalled(): Promise<InstallCheck> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("claude", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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
        error: "Claude Code CLI is not installed. Install Claude Code and try again.",
      };
    }

    return {
      installed: false,
      error: `Claude Code check failed: ${err.message}`,
    };
  }
}

// Check if OpenCode CLI is installed
async function isOpenCodeInstalled(): Promise<InstallCheck> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("opencode", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("codex", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);
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
    await execAsync("open", ["-Ra", "Codex"], { timeout: 5000, killSignal: "SIGKILL" });
    return { installed: true, mode: "app" };
  } catch {
    // Try alternate name and continue to error handling below on failure.
    try {
      await execAsync("open", ["-Ra", "Codex.app"], { timeout: 5000, killSignal: "SIGKILL" });
      return { installed: true, mode: "app" };
    } catch {
      return {
        installed: false,
        error:
          "Codex App is not installed. Install it from: https://developers.openai.com/codex/app",
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
    error:
      "Codex is not installed. Install Codex App/CLI from: https://developers.openai.com/codex/app",
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
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("copilot", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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

async function isPiInstalled(): Promise<InstallCheck> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("pi", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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
        error: "Pi CLI is not installed in PATH. Install Pi CLI and try again.",
      };
    }
    return {
      installed: false,
      error: `Pi CLI check failed: ${err.message}`,
    };
  }
}

// Check if Cursor is installed (CLI or app)
async function isCursorInstalled(): Promise<InstallCheck> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("cursor", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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
        await execAsync("open", ["-Ra", "Cursor"], { timeout: 5000, killSignal: "SIGKILL" });
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

// Check if Cursor Agent CLI is installed
export async function isCursorAgentInstalled(): Promise<InstallCheck> {
  const { findCursorAgentCli } = await import("./ralph-launchers");

  const agentPath = await findCursorAgentCli();
  if (agentPath) {
    return { installed: true, mode: "cli", binaryPath: agentPath };
  }

  return {
    installed: false,
    error: "Cursor Agent CLI not found. Install: curl https://cursor.com/install -fsS | bash",
  };
}

// Check if VS Code is installed (CLI or app)
async function isVSCodeInstalled(): Promise<InstallCheck> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(execFile);

  try {
    await execAsync("code", ["--version"], { timeout: 5000, killSignal: "SIGKILL" });
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
        await execAsync("open", ["-Ra", "Visual Studio Code"], {
          timeout: 5000,
          killSignal: "SIGKILL",
        });
        return { installed: true, mode: "app" };
      } catch {
        // Try alternate app name and continue to error handling below on failure.
        try {
          await execAsync("open", ["-Ra", "Code"], { timeout: 5000, killSignal: "SIGKILL" });
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

const LAUNCH_PROVIDER_INSTALL_CHECKS: Record<UiLaunchProviderId, () => Promise<InstallCheck>> = {
  claude: isClaudeInstalled,
  codex: isCodexInstalled,
  "codex-cli": isCodexCliInstalled,
  "codex-app": isCodexAppInstalled,
  vscode: isVSCodeInstalled,
  cursor: isCursorInstalled,
  "cursor-agent": isCursorAgentInstalled,
  copilot: isCopilotInstalled,
  opencode: isOpenCodeInstalled,
  pi: isPiInstalled,
  "ralph-native": isClaudeInstalled,
  "ralph-codex": isCodexCliInstalled,
  "ralph-cursor-agent": isCursorAgentInstalled,
  "ralph-copilot": isCopilotInstalled,
  "ralph-opencode": isOpenCodeInstalled,
  "ralph-pi": isPiInstalled,
};

async function getProviderAvailability(
  providerId: UiLaunchProviderId
): Promise<LaunchProviderRuntimeAvailability> {
  const check = LAUNCH_PROVIDER_INSTALL_CHECKS[providerId];
  const result = await check();

  return {
    providerId,
    installed: result.installed,
    ...(result.mode ? { mode: result.mode } : {}),
    ...(result.binaryPath ? { detail: result.binaryPath } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

export const getLaunchProviderAvailability = createServerFn({ method: "GET" }).handler(
  async (): Promise<LaunchProviderRuntimeAvailability[]> =>
    Promise.all(
      (Object.keys(LAUNCH_PROVIDER_INSTALL_CHECKS) as UiLaunchProviderId[]).map((providerId) =>
        getProviderAvailability(providerId)
      )
    )
);

// Legacy alias for backwards compatibility

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

function buildClaudeModelArgument(
  modelSelection: ConcreteLaunchModelSelection | undefined
): string {
  if (!modelSelection) {
    return "";
  }

  const safeModelName = escapeForBashDoubleQuote(modelSelection.modelName);
  return ` --model "${safeModelName}"`;
}

export function buildClaudeInteractiveCommand(
  modelSelection?: ConcreteLaunchModelSelection
): string {
  return `claude${buildClaudeModelArgument(modelSelection)} "$CONTEXT_FILE"`;
}

// Create a temp script to launch Claude - avoids complex escaping issues
async function createLaunchScript(
  projectPath: string,
  context: string,
  modelSelection?: ConcreteLaunchModelSelection
): Promise<string> {
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

  // Safely escape all user-provided content
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);
  const claudeCommand = buildClaudeInteractiveCommand(modelSelection);

  // Create a script that:
  // 1. Changes to the project directory
  // 2. Saves context to a file in the project (so Claude has read permission)
  // 3. Shows brief visual confirmation
  // 4. Launches Claude with the prompt, showing all output normally
  // 5. Keeps the shell open after Claude exits
  // Note: Context is written using heredoc with a unique delimiter that won't appear in user content
  const script = `#!/bin/bash
set -e  # Exit on unexpected script failures

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
${modelSelection ? "# Claude uses a one-shot model override for this launch only." : "# Claude uses the user's configured/default model."}
${claudeCommand}

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;32m✅ Claude session ended.\\033[0m"
exec bash
`;

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
interface TerminalProviderConfig {
  label: string;
  notInstalledMessage: string;
  openedMessage: (terminal: string) => string;
  checkInstalled?: () => Promise<InstallCheck>;
  createScript: (ctx: {
    projectPath: string;
    context: string;
    installCheck: InstallCheck;
    modelSelection?: ConcreteLaunchModelSelection | undefined;
  }) => Promise<string>;
  /** Cursor Agent wraps script creation with a dedicated permission-hint fallback. */
  scriptFailureResult?: (error: string) => LaunchResult;
}

const TERMINAL_PROVIDERS: Record<
  "claude" | "opencode" | "pi" | "cursor-agent" | "copilot",
  TerminalProviderConfig
> = {
  claude: {
    label: "Claude",
    notInstalledMessage: "Claude is not installed.",
    // Claude's original handler launched without an install check.
    openedMessage: (terminal) => `Launched Claude in ${terminal}`,
    createScript: ({ projectPath, context, modelSelection }) =>
      createLaunchScript(projectPath, context, modelSelection),
  },
  opencode: {
    label: "OpenCode",
    notInstalledMessage: "OpenCode is not installed. Context copied to clipboard instead.",
    openedMessage: (t) =>
      `Opening OpenCode in ${t}... If no window appears, check that ${t} is running.`,
    checkInstalled: isOpenCodeInstalled,
    createScript: ({ projectPath, context, modelSelection }) =>
      createOpenCodeLaunchScript(projectPath, context, modelSelection),
  },
  pi: {
    label: "Pi",
    notInstalledMessage: "Pi CLI is not installed. Context copied to clipboard instead.",
    openedMessage: (t) => `Opening Pi in ${t}... If no window appears, check that ${t} is running.`,
    checkInstalled: isPiInstalled,
    createScript: ({ projectPath, context, modelSelection }) =>
      createPiLaunchScript(projectPath, context, modelSelection),
  },
  "cursor-agent": {
    label: "Cursor Agent CLI",
    notInstalledMessage: "Cursor Agent CLI is not installed. Context copied to clipboard instead.",
    checkInstalled: isCursorAgentInstalled,
    createScript: ({ projectPath, context, installCheck, modelSelection }) =>
      createCursorAgentLaunchScript(
        projectPath,
        context,
        installCheck.binaryPath || "agent",
        modelSelection
      ),
    openedMessage: (t) =>
      `Opening Cursor Agent in ${t}... If no window appears, check that ${t} is running.`,
    scriptFailureResult: (error) => ({
      success: false,
      method: "clipboard",
      message: `Failed to create launch script: ${error}. Check permissions on ~/.brain-dump/scripts/.`,
    }),
  },
  copilot: {
    label: "Copilot CLI",
    notInstalledMessage: "Copilot CLI is not installed. Context copied to clipboard instead.",
    openedMessage: (t) =>
      `Opening Copilot CLI in ${t}... If no window appears, check that ${t} is running.`,
    checkInstalled: isCopilotInstalled,
    createScript: ({ projectPath, context }) => createCopilotLaunchScript(projectPath, context),
  },
};

function projectMissingResult(projectPath: string): LaunchResult {
  return {
    success: false,
    method: "clipboard",
    message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
  };
}

async function resolveLaunchTerminal(
  preferredTerminal: string | null | undefined,
  warnings: string[]
): Promise<string | null> {
  // Exported launch helpers also survive Start's browser transform. Load
  // terminal utilities only on invocation so their server logger stays server-side.
  const { detectTerminal, isTerminalAvailable } = await import("./terminal-utils");
  if (preferredTerminal) {
    const result = await isTerminalAvailable(preferredTerminal);
    if (result.available) {
      return preferredTerminal;
    }
    const reason = result.error || "not installed";
    warnings.push(
      `Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`
    );
  }
  return detectTerminal();
}

async function collectWorkflowStart(ticketId: string, warnings: string[]): Promise<void> {
  try {
    const workflowResult = await startWorkflowForLaunch(ticketId);
    warnings.push(...workflowResult.warnings);
  } catch (err) {
    warnings.push(await formatCoreError(err));
  }
}

async function saveCurrentTicketState(
  projectPath: string,
  ticketId: string,
  warnings: string[]
): Promise<void> {
  try {
    const { writeFileSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const stateDir = join(homedir(), ".brain-dump");
    mkdirSync(stateDir, { recursive: true });

    writeFileSync(
      join(stateDir, "current-ticket.json"),
      JSON.stringify({ ticketId, projectPath, startedAt: new Date().toISOString() })
    );
  } catch (error) {
    console.error("Failed to save current ticket state:", error);
    warnings.push(
      "Could not save ticket state. The 'brain-dump' CLI commands may not work for this session."
    );
  }
}

async function finishTerminalLaunch(
  config: TerminalProviderConfig,
  ctx: {
    terminal: string;
    projectPath: string;
    scriptPath: string;
    projectName: string;
    epicName: string | null;
    ticketTitle: string;
    warnings: string[];
  }
): Promise<LaunchResult> {
  const { exec } = await import("child_process");
  const { buildTerminalCommand } = await import("./terminal-utils");
  const windowTitle = buildWindowTitle(ctx.projectName, ctx.epicName, ctx.ticketTitle);
  const terminalCommand = buildTerminalCommand(
    ctx.terminal,
    ctx.projectPath,
    ctx.scriptPath,
    windowTitle
  );

  try {
    exec(terminalCommand, (error) => {
      if (error) {
        console.error("Terminal launch error:", error);
      }
    });
    return {
      success: true,
      method: "terminal",
      message: config.openedMessage(ctx.terminal),
      terminalUsed: ctx.terminal,
      ...(ctx.warnings.length > 0 && { warnings: ctx.warnings }),
    };
  } catch (error) {
    return {
      success: false,
      method: "clipboard",
      message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
      ...(ctx.warnings.length > 0 && { warnings: ctx.warnings }),
    };
  }
}

async function runTerminalProviderLaunch(
  config: TerminalProviderConfig,
  data: InteractiveTerminalLaunchInput
): Promise<LaunchResult> {
  const {
    ticketId,
    context,
    projectPath,
    preferredTerminal,
    projectName,
    epicName,
    ticketTitle,
    modelSelection,
  } = data;
  const { existsSync } = await import("fs");

  if (!existsSync(projectPath)) {
    return projectMissingResult(projectPath);
  }

  let installCheck: InstallCheck = { installed: true };
  if (config.checkInstalled) {
    installCheck = await config.checkInstalled();
    if (!installCheck.installed) {
      return {
        success: false,
        method: "clipboard",
        message: installCheck.error || config.notInstalledMessage,
      };
    }
  }

  const warnings: string[] = [];
  const terminal = await resolveLaunchTerminal(preferredTerminal, warnings);
  if (!terminal) {
    return {
      success: false,
      method: "clipboard",
      message: "No supported terminal emulator found. Context copied to clipboard instead.",
      ...(warnings.length > 0 && { warnings }),
    };
  }

  await collectWorkflowStart(ticketId, warnings);
  await saveCurrentTicketState(projectPath, ticketId, warnings);

  let scriptPath: string;
  try {
    scriptPath = await config.createScript({ projectPath, context, installCheck, modelSelection });
  } catch (err) {
    if (config.scriptFailureResult) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        ...config.scriptFailureResult(message),
        ...(warnings.length > 0 && { warnings }),
      };
    }
    throw err;
  }

  return finishTerminalLaunch(config, {
    terminal,
    projectPath,
    scriptPath,
    projectName,
    epicName,
    ticketTitle,
    warnings,
  });
}

export function formatOpenCodeLaunchModelValue(
  modelSelection: ConcreteLaunchModelSelection
): string {
  return `${modelSelection.provider}/${modelSelection.modelName}`;
}

function buildOpenCodeModelArgument(
  modelSelection: ConcreteLaunchModelSelection | undefined
): string {
  if (!modelSelection) {
    return "";
  }

  const safeModelValue = escapeForBashDoubleQuote(formatOpenCodeLaunchModelValue(modelSelection));
  return ` --model "${safeModelValue}"`;
}

export function buildOpenCodeInteractiveCommand(
  projectPath: string,
  modelSelection?: ConcreteLaunchModelSelection
): string {
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  return `opencode "${safeProjectPath}"${buildOpenCodeModelArgument(modelSelection)} --prompt "$(cat "$CONTEXT_FILE")"`;
}

// Create a temp script to launch OpenCode - similar to createLaunchScript but for OpenCode
async function createOpenCodeLaunchScript(
  projectPath: string,
  context: string,
  modelSelection?: ConcreteLaunchModelSelection
): Promise<string> {
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

  // Safely escape all user-provided content
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);
  const openCodeCommand = buildOpenCodeInteractiveCommand(projectPath, modelSelection);

  // Create a script that:
  // 1. Changes to the project directory
  // 2. Saves context to a file in the project
  // 3. Shows brief visual confirmation (OpenCode branding)
  // 4. Launches OpenCode with the prompt
  // 5. Keeps the shell open after OpenCode exits
  const script = `#!/bin/bash
set -e  # Exit on error

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
${modelSelection ? "# OpenCode expects one-shot model overrides as provider/model." : "# OpenCode uses the user's default/last-used model preference."}
${openCodeCommand}

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;34m✅ OpenCode session ended.\\033[0m"
exec bash
`;

  // Use 0o700 - owner read/write/execute only
  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

// Launch OpenCode in terminal with ticket context
function buildCodexModelArgument(modelSelection: ConcreteLaunchModelSelection | undefined): string {
  if (!modelSelection) {
    return "";
  }

  const safeModelName = escapeForBashDoubleQuote(modelSelection.modelName);
  return ` --model "${safeModelName}"`;
}

export function buildCodexInteractiveCommand(
  modelSelection?: ConcreteLaunchModelSelection
): string {
  return `codex${buildCodexModelArgument(modelSelection)} "$(cat "$CONTEXT_FILE")"`;
}

function buildCursorAgentModelArgument(
  modelSelection: ConcreteLaunchModelSelection | undefined
): string {
  if (!modelSelection) {
    return "";
  }

  const safeModelName = escapeForBashDoubleQuote(modelSelection.modelName);
  return ` --model "${safeModelName}"`;
}

export function buildCursorAgentInteractiveCommand(
  modelSelection?: ConcreteLaunchModelSelection
): string {
  return `"$CURSOR_AGENT_BIN" --force --approve-mcps --trust${buildCursorAgentModelArgument(modelSelection)} -p "$AGENT_PROMPT"`;
}

function formatProviderModelLaunchValue(modelSelection: ConcreteLaunchModelSelection): string {
  return `${modelSelection.provider}/${modelSelection.modelName}`;
}

function buildPiModelArgument(modelSelection: ConcreteLaunchModelSelection | undefined): string {
  if (!modelSelection) {
    return "";
  }

  const safeModelValue = escapeForBashDoubleQuote(formatProviderModelLaunchValue(modelSelection));
  return ` --model "${safeModelValue}"`;
}

export function buildPiInteractiveCommand(modelSelection?: ConcreteLaunchModelSelection): string {
  return `pi${buildPiModelArgument(modelSelection)} "$PI_PROMPT"`;
}

function defaultOnlyModelWarning(providerLabel: string): string {
  return `${providerLabel} does not have pricing-backed model choices yet. Launching with the provider's default model.`;
}

// Create a temp script to launch Codex - similar to OpenCode/Claude launch scripts
async function createCodexLaunchScript(
  projectPath: string,
  context: string,
  modelSelection?: ConcreteLaunchModelSelection
): Promise<string> {
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

  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);
  const codexCommand = buildCodexInteractiveCommand(modelSelection);

  const script = `#!/bin/bash
set -e  # Exit on error

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
${modelSelection ? "# Codex uses a one-shot model override for this launch only." : "# Codex uses the user's configured/default model."}
${codexCommand}

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;32m✅ Codex session ended.\\033[0m"
exec bash
`;

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

  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);

  const script = `#!/bin/bash
set -e  # Exit on error

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

COPILOT_PROMPT="$(cat "$CONTEXT_FILE")"
COPILOT_HELP="$(copilot --help 2>/dev/null || true)"
set +e
if echo "$COPILOT_HELP" | grep -q -- "--yolo"; then
  if echo "$COPILOT_HELP" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
    copilot --yolo -p "$COPILOT_PROMPT"
  else
    copilot --yolo "$COPILOT_PROMPT"
  fi
elif echo "$COPILOT_HELP" | grep -q -- "--allow-all-tools"; then
  if echo "$COPILOT_HELP" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
    copilot --allow-all-tools -p "$COPILOT_PROMPT"
  else
    copilot --allow-all-tools "$COPILOT_PROMPT"
  fi
elif echo "$COPILOT_HELP" | grep -q -- "--allow-tool"; then
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
  echo "  - Run: copilot --yolo"
  echo "  - Verify MCP setup: brain-dump doctor"
fi

rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;36m✅ Copilot CLI session ended.\\033[0m"
exec bash
`;

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

async function createCursorAgentLaunchScript(
  projectPath: string,
  context: string,
  agentPath: string,
  modelSelection?: ConcreteLaunchModelSelection
): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  validateProjectPath(projectPath);
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `launch-cursor-agent-${randomUUID()}.sh`);
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";

  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);
  const safeAgentPath = escapeForBashDoubleQuote(agentPath);
  const cursorAgentCommand = buildCursorAgentInteractiveCommand(modelSelection);

  const script = `#!/bin/bash
set -e  # Exit on error

cd "${safeProjectPath}"

CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

echo ""
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;33m🤖 Brain Dump - Starting with Cursor Agent\\033[0m"
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

export CURSOR_AGENT=1

CURSOR_AGENT_BIN="${safeAgentPath}"
if [[ "$CURSOR_AGENT_BIN" = /* ]]; then
  if [ ! -x "$CURSOR_AGENT_BIN" ]; then
    echo -e "\\033[0;31m✗ Cursor Agent CLI binary not found at $CURSOR_AGENT_BIN\\033[0m"
    echo "Install: curl https://cursor.com/install -fsS | bash"
    rm -f "$CONTEXT_FILE"
    exec bash
  fi
elif ! command -v "$CURSOR_AGENT_BIN" >/dev/null 2>&1; then
  echo -e "\\033[0;31m✗ Cursor Agent CLI binary not found in PATH\\033[0m"
  echo "Install: curl https://cursor.com/install -fsS | bash"
  rm -f "$CONTEXT_FILE"
  exec bash
fi

AGENT_PROMPT="$(cat "$CONTEXT_FILE")"
set +e
${modelSelection ? "# Cursor Agent uses a one-shot model override for this launch only." : "# Cursor Agent uses the user's configured/default model."}
${cursorAgentCommand}
AGENT_EXIT=$?
set -e

if [ $AGENT_EXIT -ne 0 ]; then
  echo ""
  echo -e "\\033[0;33m⚠ Cursor Agent exited with code $AGENT_EXIT\\033[0m"
  echo "Common fixes:"
  echo "  - Check agent is installed: agent --version"
  echo "  - Reinstall: curl https://cursor.com/install -fsS | bash"
  echo "  - Verify MCP setup: brain-dump doctor"
fi

rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;33m✅ Cursor Agent session ended.\\033[0m"
exec bash
`;

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

export async function createPiLaunchScript(
  projectPath: string,
  context: string,
  modelSelection?: ConcreteLaunchModelSelection
): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  validateProjectPath(projectPath);
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `launch-pi-${randomUUID()}.sh`);
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";

  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);
  const piCommand = buildPiInteractiveCommand(modelSelection);

  const script = `#!/bin/bash
set -e  # Exit on error

cd "${safeProjectPath}"

CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

echo ""
echo -e "\\033[0;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;35m🧠 Brain Dump - Starting with Pi\\033[0m"
echo -e "\\033[0;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

export PI=1
export BRAIN_DUMP_PROVIDER=pi

PI_PROMPT="$(cat "$CONTEXT_FILE")"
${modelSelection ? "# Pi uses a one-shot model override for this launch only." : "# Pi uses the user's configured/default model."}
${piCommand}

rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;35m✅ Pi session ended.\\033[0m"
exec bash
`;

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

async function runCodexAppLaunch(
  data: InteractiveTerminalLaunchInput,
  warnings: string[]
): Promise<LaunchResult> {
  const { context, projectPath, modelSelection } = data;

  if (modelSelection) {
    warnings.push(
      "Codex App does not support a documented one-shot model override. Launching with the app's default model."
    );
  }

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

    return {
      success: true,
      method: "app",
      message: `Opened Codex App. Context saved to ${contextFile}.`,
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
}

async function runCodexProviderLaunch(
  data: InteractiveTerminalLaunchInput & { launchMode?: "auto" | "cli" | "app" }
): Promise<LaunchResult> {
  const {
    ticketId,
    context,
    projectPath,
    preferredTerminal,
    projectName,
    epicName,
    ticketTitle,
    modelSelection,
  } = data;
  const { exec } = await import("child_process");
  const { existsSync } = await import("fs");
  const launchMode = data.launchMode ?? "auto";

  if (!existsSync(projectPath)) {
    return projectMissingResult(projectPath);
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
  await collectWorkflowStart(ticketId, warnings);
  await saveCurrentTicketState(projectPath, ticketId, warnings);

  const shouldUseCli = launchMode === "cli" || (launchMode === "auto" && codexCheck.mode === "cli");

  if (shouldUseCli) {
    const terminal = await resolveLaunchTerminal(preferredTerminal, warnings);
    if (!terminal) {
      return {
        success: false,
        method: "clipboard",
        message: "No supported terminal emulator found. Context copied to clipboard instead.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    const scriptPath = await createCodexLaunchScript(projectPath, context, modelSelection);
    const windowTitle = buildWindowTitle(projectName, epicName, ticketTitle);
    const { buildTerminalCommand } = await import("./terminal-utils");
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
  return runCodexAppLaunch(data, warnings);
}

interface AppLaunchConfig {
  label: string;
  notInstalledMessage: string;
  checkInstalled: () => Promise<InstallCheck>;
  /** Builds the fire-and-forget open command from validated paths. */
  buildOpenCommand: (ctx: {
    installCheck: InstallCheck;
    safeProjectPath: string;
    safeContextFile: string;
  }) => string;
}

async function runAppProviderLaunch(
  config: AppLaunchConfig,
  data: InteractiveTerminalLaunchInput
): Promise<LaunchResult> {
  const { ticketId, context, projectPath, modelSelection } = data;
  const { exec } = await import("child_process");
  const { existsSync } = await import("fs");

  if (!existsSync(projectPath)) {
    return projectMissingResult(projectPath);
  }

  const installCheck = await config.checkInstalled();
  if (!installCheck.installed) {
    return {
      success: false,
      method: "clipboard",
      message: installCheck.error || config.notInstalledMessage,
    };
  }

  const warnings: string[] = [];
  if (modelSelection) {
    warnings.push(defaultOnlyModelWarning(config.label));
  }

  await collectWorkflowStart(ticketId, warnings);
  await saveCurrentTicketState(projectPath, ticketId, warnings);

  try {
    const contextFile = await writeProjectContextFile(projectPath, context);
    const launchCommand = config.buildOpenCommand({
      installCheck,
      safeProjectPath: escapeForBashDoubleQuote(projectPath),
      safeContextFile: escapeForBashDoubleQuote(contextFile),
    });

    exec(launchCommand, (error) => {
      if (error) {
        console.error(`${config.label} launch error:`, error);
      }
    });

    return {
      success: true,
      method: "app",
      message: `Opened ${config.label}. Context saved to ${contextFile}.`,
      terminalUsed: config.label,
      ...(warnings.length > 0 && { warnings }),
    };
  } catch (error) {
    return {
      success: false,
      method: "clipboard",
      message: `Failed to launch ${config.label}: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
      ...(warnings.length > 0 && { warnings }),
    };
  }
}

const APP_LAUNCH_CONFIGS: Record<"vscode-editor" | "cursor-editor", AppLaunchConfig> = {
  "vscode-editor": {
    label: "VS Code",
    notInstalledMessage: "VS Code is not installed. Context copied to clipboard instead.",
    checkInstalled: isVSCodeInstalled,
    buildOpenCommand: ({ installCheck, safeProjectPath, safeContextFile }) =>
      installCheck.mode === "cli"
        ? `code -n "${safeProjectPath}" -g "${safeContextFile}"`
        : `open -a "Visual Studio Code" "${safeProjectPath}" && open -a "Visual Studio Code" "${safeContextFile}"`,
  },
  "cursor-editor": {
    label: "Cursor",
    notInstalledMessage: "Cursor is not installed. Context copied to clipboard instead.",
    checkInstalled: isCursorInstalled,
    buildOpenCommand: ({ installCheck, safeProjectPath }) =>
      installCheck.mode === "cli"
        ? `cursor "${safeProjectPath}"`
        : `open -a "Cursor" "${safeProjectPath}"`,
  },
};

export type InteractiveTerminalProviderMode =
  | "claude-terminal"
  | "codex-auto"
  | "codex-cli"
  | "codex-app"
  | "vscode-editor"
  | "cursor-editor"
  | "cursor-agent-terminal"
  | "copilot-cli"
  | "opencode-terminal"
  | "pi-terminal";

export interface ProviderTerminalLaunchInput extends InteractiveTerminalLaunchInput {
  providerId: InteractiveTerminalProviderMode;
  launchMode?: "auto" | "cli" | "app";
}

/**
 * Single entry point for interactive provider launches from the UI.
 * The provider/variant discriminator is providerId; per-provider specifics
 * live in the provider configs above.
 */
export async function runInteractiveProviderLaunch(
  input: ProviderTerminalLaunchInput
): Promise<LaunchResult> {
  const { providerId, ...data } = input;
  switch (providerId) {
    case "claude-terminal":
      return runTerminalProviderLaunch(TERMINAL_PROVIDERS.claude, data);
    case "opencode-terminal":
      return runTerminalProviderLaunch(TERMINAL_PROVIDERS.opencode, data);
    case "pi-terminal":
      return runTerminalProviderLaunch(TERMINAL_PROVIDERS.pi, data);
    case "copilot-cli":
      return runTerminalProviderLaunch(TERMINAL_PROVIDERS.copilot, data);
    case "cursor-agent-terminal":
      return runTerminalProviderLaunch(TERMINAL_PROVIDERS["cursor-agent"], data);
    case "codex-auto":
    case "codex-cli":
    case "codex-app": {
      const launchMode =
        providerId === "codex-auto"
          ? ("auto" as const)
          : providerId === "codex-cli"
            ? ("cli" as const)
            : ("app" as const);
      return runCodexProviderLaunch({ ...data, launchMode });
    }
    case "vscode-editor":
      return runAppProviderLaunch(APP_LAUNCH_CONFIGS["vscode-editor"], data);
    case "cursor-editor":
      return runAppProviderLaunch(APP_LAUNCH_CONFIGS["cursor-editor"], data);
  }
}

export const launchProviderInTerminal = createServerFn({ method: "POST" })
  .inputValidator((data: ProviderTerminalLaunchInput) => data)
  .handler(async ({ data }): Promise<LaunchResult> => runInteractiveProviderLaunch(data));
