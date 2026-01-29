/**
 * Terminal and editor launching utilities.
 * SECURITY: Uses spawn() with array arguments to prevent shell injection.
 * Supports both macOS and Linux terminals.
 */

import { existsSync } from "fs";
import { spawn, execFileSync } from "child_process";
import { platform } from "os";

export interface LaunchResult {
  success: boolean;
  message?: string;
  terminal?: string;
}

/**
 * Find VS Code CLI path.
 * Checks common installation locations across platforms.
 */
export async function findVSCodeCli(): Promise<string | null> {
  const { homedir } = await import("os");
  const { join } = await import("path");

  const possiblePaths = [
    "/usr/local/bin/code",
    "/opt/homebrew/bin/code",
    "/usr/bin/code",
    join(homedir(), ".local/bin/code"),
    join(homedir(), "bin/code"),
  ];

  for (const cliPath of possiblePaths) {
    if (existsSync(cliPath)) {
      return cliPath;
    }
  }

  return null;
}

/**
 * Launch project in VS Code.
 * SECURITY FIX (P0): Uses spawn() with array args instead of exec() with string interpolation.
 *
 * @param projectPath - Absolute path to project directory
 * @param contextFilePath - Optional path to .code-workspace file
 */
export async function launchInVSCode(
  projectPath: string,
  contextFilePath?: string
): Promise<LaunchResult> {
  const codeCli = await findVSCodeCli();

  if (!codeCli) {
    return {
      success: false,
      message: "VS Code CLI not found. Install VS Code and ensure 'code' is in your PATH.",
    };
  }

  const args: string[] = ["-n", projectPath];

  if (contextFilePath && existsSync(contextFilePath)) {
    args.push("-g", contextFilePath);
  }

  return new Promise((resolve) => {
    const child = spawn(codeCli, args, {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error: Error) => {
      console.error("VS Code launch error:", error);
      resolve({
        success: false,
        message: `Failed to launch VS Code: ${error.message}`,
      });
    });

    child.unref();
    resolve({ success: true });
  });
}

/**
 * Launch in terminal emulator.
 * SECURITY FIX (P0): Uses spawn() with array args instead of exec() with string interpolation.
 * Supports macOS (Ghostty, iTerm2, Terminal.app) and Linux (gnome-terminal, konsole, xfce4-terminal, xterm).
 *
 * @param projectPath - Absolute path to project directory
 * @param claudeCodePath - Path to claude-code binary or script
 * @param preferredTerminal - Optional terminal preference
 */
export async function launchInTerminal(
  projectPath: string,
  claudeCodePath: string,
  preferredTerminal?: string | null
): Promise<LaunchResult> {
  const detectedTerminal = preferredTerminal || detectTerminal();

  let result: LaunchResult;
  switch (detectedTerminal) {
    // macOS terminals
    case "ghostty":
      result = await launchGhostty(projectPath, claudeCodePath);
      break;
    case "iterm2":
      result = await launchITerm2(projectPath, claudeCodePath);
      break;
    case "terminal.app":
      result = await launchTerminalApp(projectPath, claudeCodePath);
      break;
    // Linux terminals - all use the generic launcher with appropriate flag
    case "gnome-terminal":
    case "konsole":
    case "xfce4-terminal":
    case "xterm":
    case "kitty":
    case "alacritty":
    case "mate-terminal":
    case "terminator":
    case "tilix":
      result = await launchLinuxTerminal(
        detectedTerminal,
        getLaunchFlag(detectedTerminal),
        claudeCodePath
      );
      break;
    default:
      return {
        success: false,
        message: `Unsupported terminal: ${detectedTerminal}. Supported: ghostty, iterm2, terminal.app (macOS), gnome-terminal, konsole, xfce4-terminal, kitty, alacritty, xterm (Linux)`,
      };
  }

  // Add terminal name to result
  if (result.success) {
    result.terminal = detectedTerminal;
  }
  return result;
}

/**
 * Check if a command exists in PATH using 'which'.
 * SECURITY: Uses execFileSync with hardcoded 'which' command - no user input.
 */
function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function detectTerminal(): string {
  const os = platform();

  if (os === "darwin") {
    // macOS detection
    if (existsSync("/Applications/Ghostty.app")) return "ghostty";
    if (existsSync("/Applications/iTerm.app")) return "iterm2";
    if (existsSync("/System/Applications/Utilities/Terminal.app")) return "terminal.app";
  } else if (os === "linux") {
    // Linux detection - check for common terminals in order of preference
    // Modern GPU-accelerated terminals first
    if (commandExists("ghostty")) return "ghostty";
    if (commandExists("kitty")) return "kitty";
    if (commandExists("alacritty")) return "alacritty";
    // Desktop environment defaults
    if (commandExists("gnome-terminal")) return "gnome-terminal";
    if (commandExists("konsole")) return "konsole";
    if (commandExists("xfce4-terminal")) return "xfce4-terminal";
    if (commandExists("mate-terminal")) return "mate-terminal";
    // Other popular terminals
    if (commandExists("tilix")) return "tilix";
    if (commandExists("terminator")) return "terminator";
    // Fallback
    if (commandExists("xterm")) return "xterm";
  }

  return "unknown";
}

function launchGhostty(_projectPath: string, claudeCodePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const os = platform();
    let child;

    if (os === "darwin") {
      // On macOS, use 'open -n -a Ghostty --args -e <script>' with minimal args.
      // The -n flag opens a new instance, and -e executes the script.
      // The script already cd's to the working directory, so we don't pass -w.
      // Passing too many args through 'open --args' causes Ghostty to create multiple tabs.
      // Official docs: https://github.com/ghostty-org/ghostty/discussions/4434
      child = spawn("open", ["-n", "-a", "Ghostty", "--args", "-e", claudeCodePath], {
        detached: true,
        stdio: "ignore",
      });
    } else {
      // On Linux, run ghostty directly with -e to execute the script
      child = spawn("ghostty", ["-e", claudeCodePath], {
        detached: true,
        stdio: "ignore",
      });
    }

    child.on("error", (error: Error) => {
      console.error("Ghostty launch error:", error);
      resolve({
        success: false,
        message: `Failed to launch Ghostty: ${error.message}`,
      });
    });

    child.unref();
    resolve({ success: true });
  });
}

function launchITerm2(_projectPath: string, claudeCodePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    // iTerm2: Use official AppleScript API to create window with command
    // Official syntax: create window with default profile command "command"
    // See: https://iterm2.com/documentation-scripting.html
    const escapedScriptPath = claudeCodePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const applescript = `tell application "iTerm" to create window with default profile command "${escapedScriptPath}"`;

    const child = spawn("osascript", ["-e", applescript], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error: Error) => {
      console.error("iTerm2 launch error:", error);
      resolve({
        success: false,
        message: `Failed to launch iTerm2: ${error.message}`,
      });
    });

    child.unref();
    resolve({ success: true });
  });
}

function launchTerminalApp(_projectPath: string, claudeCodePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    // Terminal.app: Use do script command per Apple's official documentation
    // See: https://support.apple.com/guide/terminal/automate-tasks-using-applescript-and-terminal-trml1003/mac
    const escapedScriptPath = claudeCodePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const applescript = `tell application "Terminal" to do script "${escapedScriptPath}"`;

    const child = spawn("osascript", ["-e", applescript], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error: Error) => {
      console.error("Terminal.app launch error:", error);
      resolve({
        success: false,
        message: `Failed to launch Terminal.app: ${error.message}`,
      });
    });

    child.unref();
    resolve({ success: true });
  });
}

// ============================================
// Linux Terminal Launchers
// ============================================

/**
 * Generic launcher for Linux terminals that accept a script via a flag.
 * Most Linux terminals use either `-e` or `--` to execute a script.
 *
 * @param terminalCmd - The terminal command (e.g., "gnome-terminal", "konsole")
 * @param flag - The flag to pass before the script path (e.g., "-e" or "--")
 * @param scriptPath - Path to the script to execute
 */
function launchLinuxTerminal(
  terminalCmd: string,
  flag: string,
  scriptPath: string
): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const child = spawn(terminalCmd, [flag, scriptPath], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error: Error) => {
      console.error(`${terminalCmd} launch error:`, error);
      resolve({
        success: false,
        message: `Failed to launch ${terminalCmd}: ${error.message}`,
      });
    });

    child.unref();
    resolve({ success: true });
  });
}

/**
 * Terminal launch flag configuration.
 * Terminals that use "--" to separate the command from arguments are listed here;
 * all others use "-e" to execute a script.
 */
const LINUX_TERMINAL_FLAGS: Record<string, string> = {
  "gnome-terminal": "--",
  kitty: "--",
};

function getLaunchFlag(terminal: string): string {
  return LINUX_TERMINAL_FLAGS[terminal] ?? "-e";
}
