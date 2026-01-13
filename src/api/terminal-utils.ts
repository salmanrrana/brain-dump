// Shared terminal detection and command building utilities

import { createLogger } from "../lib/logger";

const logger = createLogger("terminal-utils");

// Terminal check commands - single source of truth for availability detection
const TERMINAL_CHECKS = {
  // Cross-platform terminals
  ghostty: "ghostty --version",
  alacritty: "alacritty --version",
  kitty: "kitty --version",
  // macOS terminals (check for .app bundles)
  "terminal.app": "test -d '/System/Applications/Utilities/Terminal.app' || test -d '/Applications/Utilities/Terminal.app'",
  iterm2: "test -d '/Applications/iTerm.app'",
  warp: "test -d '/Applications/Warp.app'",
  // Linux terminals
  "gnome-terminal": "gnome-terminal --version",
  konsole: "konsole --version",
  "xfce4-terminal": "xfce4-terminal --version",
  "mate-terminal": "mate-terminal --version",
  terminator: "terminator --version",
  tilix: "tilix --version",
  xterm: "xterm -version",
  "x-terminal-emulator": "which x-terminal-emulator",
} as const;

const ALLOWED_TERMINALS = Object.keys(TERMINAL_CHECKS) as AllowedTerminal[];

export type AllowedTerminal = keyof typeof TERMINAL_CHECKS;

// Check if a terminal is in the whitelist
export function isAllowedTerminal(terminal: string): terminal is AllowedTerminal {
  return ALLOWED_TERMINALS.includes(terminal as AllowedTerminal);
}

// Cross-platform terminals to check first (in order of preference)
const CROSS_PLATFORM_TERMINALS: AllowedTerminal[] = ["ghostty", "alacritty", "kitty"];

// Platform-specific terminals (in order of preference)
const MACOS_TERMINALS: AllowedTerminal[] = ["warp", "iterm2", "terminal.app"];
const LINUX_TERMINALS: AllowedTerminal[] = [
  "gnome-terminal",
  "konsole",
  "xfce4-terminal",
  "mate-terminal",
  "terminator",
  "tilix",
  "xterm",
  "x-terminal-emulator",
];

// Check if an error is an expected "not found" error
function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const err = error as Error & { code?: string };
  // ENOENT = command not found, exit code 1 = test -d failed or command returned error
  return err.code === "ENOENT" || err.message?.includes("not found") || err.message?.includes("exit code 1");
}

// Detect available terminal emulator
export async function detectTerminal(): Promise<AllowedTerminal | null> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const { platform } = await import("os");
  const execAsync = promisify(exec);

  const isMacOS = platform() === "darwin";
  const platformTerminals = isMacOS ? MACOS_TERMINALS : LINUX_TERMINALS;
  const terminalsToCheck = [...CROSS_PLATFORM_TERMINALS, ...platformTerminals];

  const unexpectedErrors: Array<{ terminal: string; error: string }> = [];

  for (const terminal of terminalsToCheck) {
    try {
      await execAsync(TERMINAL_CHECKS[terminal]);
      return terminal;
    } catch (error) {
      if (!isNotFoundError(error)) {
        // Unexpected error - log it for debugging
        const errorMsg = error instanceof Error ? error.message : String(error);
        unexpectedErrors.push({ terminal, error: errorMsg });
        logger.warn(`Unexpected error checking terminal "${terminal}": ${errorMsg}`);
      }
      // Terminal not available or error, try next
    }
  }

  if (unexpectedErrors.length > 0) {
    logger.error(`Terminal detection completed with ${unexpectedErrors.length} unexpected error(s)`);
  }

  return null;
}

// Result type for terminal availability check
export interface TerminalAvailabilityResult {
  available: boolean;
  error?: string;
}

// Check if a specific terminal is available
export async function isTerminalAvailable(terminal: string): Promise<TerminalAvailabilityResult> {
  if (!isAllowedTerminal(terminal)) {
    const msg = `Terminal "${terminal}" is not in the allowed list`;
    logger.warn(msg);
    return { available: false, error: msg };
  }

  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync(TERMINAL_CHECKS[terminal]);
    return { available: true };
  } catch (error) {
    if (isNotFoundError(error)) {
      // Expected "not found" error - terminal simply not installed
      return { available: false };
    }
    // Unexpected error - include it in the result
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Unexpected error checking terminal "${terminal}": ${errorMsg}`);
    return { available: false, error: `Terminal check failed: ${errorMsg}` };
  }
}

// Escape a path for safe use in bash shell double-quoted strings
function escapeShellPath(path: string): string {
  // In bash double quotes, escape: \ $ ` " !
  return path.replace(/[\\$`"!]/g, "\\$&");
}

// Escape a path for safe use in AppleScript double-quoted strings
// AppleScript uses backslash escaping inside double quotes
function escapeAppleScriptPath(path: string): string {
  // In AppleScript double quotes, escape: \ and "
  return path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Build terminal launch command based on terminal type
export function buildTerminalCommand(
  terminal: string,
  projectPath: string,
  scriptPath: string
): string {
  // Validate terminal is in whitelist
  if (!isAllowedTerminal(terminal)) {
    throw new Error(`Terminal "${terminal}" is not allowed`);
  }

  // Escape paths for bash context
  const safePath = escapeShellPath(projectPath);
  const safeScript = escapeShellPath(scriptPath);

  // Escape paths for AppleScript context (used by macOS terminals)
  const appleScriptPath = escapeAppleScriptPath(scriptPath);

  switch (terminal) {
    // Cross-platform terminals
    case "ghostty":
      // Ghostty: use -e with the script path directly
      return `ghostty --working-directory="${safePath}" -e "${safeScript}"`;
    case "alacritty":
      return `alacritty --working-directory "${safePath}" -e "${safeScript}"`;
    case "kitty":
      return `kitty --directory "${safePath}" "${safeScript}"`;

    // macOS terminals - use osascript (AppleScript) for reliable execution
    case "terminal.app":
      // Terminal.app: Use AppleScript to run the script
      return `osascript -e 'tell application "Terminal" to do script "${appleScriptPath}"' -e 'tell application "Terminal" to activate'`;
    case "iterm2":
      // iTerm2: Use AppleScript to create a new window and run the script
      return `osascript -e 'tell application "iTerm" to create window with default profile command "${appleScriptPath}"' -e 'tell application "iTerm" to activate'`;
    case "warp":
      // Warp: Use AppleScript to open Warp and execute the script
      // Note: Warp's AppleScript support is limited, so we use 'do script' similar to Terminal.app
      return `osascript -e 'tell application "Warp" to activate' -e 'delay 0.5' -e 'tell application "System Events" to tell process "Warp" to keystroke "t" using command down' -e 'delay 0.3' -e 'tell application "System Events" to tell process "Warp" to keystroke "${appleScriptPath}"' -e 'tell application "System Events" to tell process "Warp" to key code 36'`;

    // Linux terminals
    case "gnome-terminal":
      return `gnome-terminal --working-directory="${safePath}" -- "${safeScript}"`;
    case "konsole":
      return `konsole --workdir "${safePath}" -e "${safeScript}"`;
    case "xfce4-terminal":
      return `xfce4-terminal --working-directory="${safePath}" -e "${safeScript}"`;
    case "mate-terminal":
      return `mate-terminal --working-directory="${safePath}" -e "${safeScript}"`;
    case "terminator":
      return `terminator --working-directory="${safePath}" -e "${safeScript}"`;
    case "tilix":
      return `tilix --working-directory="${safePath}" -e "${safeScript}"`;
    case "xterm":
      return `xterm -e "${safeScript}"`;
    case "x-terminal-emulator":
      return `x-terminal-emulator -e "${safeScript}"`;
  }
}
