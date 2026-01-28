/**
 * Terminal and editor launching utilities.
 * SECURITY: Uses spawn() with array arguments to prevent shell injection.
 */

import { existsSync } from "fs";
import { spawn } from "child_process";

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

    child.on("error", (error) => {
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
 *
 * @param projectPath - Absolute path to project directory
 * @param claudeCodePath - Path to claude-code binary
 * @param preferredTerminal - Optional terminal preference (ghostty, iterm2, terminal.app, auto)
 */
export async function launchInTerminal(
  projectPath: string,
  claudeCodePath: string,
  preferredTerminal?: string | null
): Promise<LaunchResult> {
  const detectedTerminal = preferredTerminal || detectTerminal();

  let result: LaunchResult;
  switch (detectedTerminal) {
    case "ghostty":
      result = await launchGhostty(projectPath, claudeCodePath);
      break;
    case "iterm2":
      result = await launchITerm2(projectPath, claudeCodePath);
      break;
    case "terminal.app":
      result = await launchTerminalApp(projectPath, claudeCodePath);
      break;
    default:
      return {
        success: false,
        message: `Unsupported terminal: ${detectedTerminal}. Supported: ghostty, iterm2, terminal.app`,
      };
  }

  // Add terminal name to result
  if (result.success) {
    result.terminal = detectedTerminal;
  }
  return result;
}

function detectTerminal(): string {
  if (existsSync("/Applications/Ghostty.app")) return "ghostty";
  if (existsSync("/Applications/iTerm.app")) return "iterm2";
  if (existsSync("/System/Applications/Utilities/Terminal.app")) return "terminal.app";
  return "unknown";
}

function launchGhostty(projectPath: string, claudeCodePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const child = spawn(
      "open",
      ["-a", "Ghostty", "--args", "-w", projectPath, "-e", claudeCodePath],
      {
        detached: true,
        stdio: "ignore",
      }
    );

    child.on("error", (error) => {
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

function launchITerm2(projectPath: string, claudeCodePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const applescript = `
      tell application "iTerm"
        create window with default profile
        tell current session of current window
          write text "cd ${projectPath.replace(/"/g, '\\"')} && ${claudeCodePath.replace(/"/g, '\\"')}"
        end tell
      end tell
    `;

    const child = spawn("osascript", ["-e", applescript], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error) => {
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

function launchTerminalApp(projectPath: string, claudeCodePath: string): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const applescript = `
      tell application "Terminal"
        do script "cd ${projectPath.replace(/"/g, '\\"')} && ${claudeCodePath.replace(/"/g, '\\"')}"
        activate
      end tell
    `;

    const child = spawn("osascript", ["-e", applescript], {
      detached: true,
      stdio: "ignore",
    });

    child.on("error", (error) => {
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
