// Shared terminal detection and command building utilities

// Allowed terminal emulators (whitelist for security)
const ALLOWED_TERMINALS = [
  "ghostty",
  "gnome-terminal",
  "konsole",
  "xfce4-terminal",
  "mate-terminal",
  "terminator",
  "alacritty",
  "kitty",
  "tilix",
  "xterm",
  "x-terminal-emulator",
] as const;

export type AllowedTerminal = (typeof ALLOWED_TERMINALS)[number];

// Check if a terminal is in the whitelist
export function isAllowedTerminal(terminal: string): terminal is AllowedTerminal {
  return ALLOWED_TERMINALS.includes(terminal as AllowedTerminal);
}

// Detect available terminal emulator
export async function detectTerminal(): Promise<AllowedTerminal | null> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  // List of terminal emulators to try (in order of preference)
  const terminals: Array<{ cmd: AllowedTerminal; check: string }> = [
    { cmd: "ghostty", check: "ghostty --version" },
    { cmd: "gnome-terminal", check: "gnome-terminal --version" },
    { cmd: "konsole", check: "konsole --version" },
    { cmd: "xfce4-terminal", check: "xfce4-terminal --version" },
    { cmd: "mate-terminal", check: "mate-terminal --version" },
    { cmd: "terminator", check: "terminator --version" },
    { cmd: "alacritty", check: "alacritty --version" },
    { cmd: "kitty", check: "kitty --version" },
    { cmd: "tilix", check: "tilix --version" },
    { cmd: "xterm", check: "xterm -version" },
    { cmd: "x-terminal-emulator", check: "which x-terminal-emulator" },
  ];

  for (const terminal of terminals) {
    try {
      await execAsync(terminal.check);
      return terminal.cmd;
    } catch {
      // Terminal not available, try next
    }
  }

  return null;
}

// Check if a specific terminal is available
export async function isTerminalAvailable(terminal: string): Promise<boolean> {
  // First, validate the terminal is in our whitelist (security check)
  if (!isAllowedTerminal(terminal)) {
    console.warn(`Terminal "${terminal}" is not in the allowed list`);
    return false;
  }

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  // Use the predefined check commands for each terminal
  const terminalChecks: Record<AllowedTerminal, { cmd: string; args: string[] }> = {
    ghostty: { cmd: "ghostty", args: ["--version"] },
    "gnome-terminal": { cmd: "gnome-terminal", args: ["--version"] },
    konsole: { cmd: "konsole", args: ["--version"] },
    "xfce4-terminal": { cmd: "xfce4-terminal", args: ["--version"] },
    "mate-terminal": { cmd: "mate-terminal", args: ["--version"] },
    terminator: { cmd: "terminator", args: ["--version"] },
    alacritty: { cmd: "alacritty", args: ["--version"] },
    kitty: { cmd: "kitty", args: ["--version"] },
    tilix: { cmd: "tilix", args: ["--version"] },
    xterm: { cmd: "xterm", args: ["-version"] },
    "x-terminal-emulator": { cmd: "which", args: ["x-terminal-emulator"] },
  };

  const check = terminalChecks[terminal];
  try {
    // Use execFile instead of exec to avoid shell injection
    await execFileAsync(check.cmd, check.args);
    return true;
  } catch {
    return false;
  }
}

// Escape a path for safe use in shell commands
function escapeShellPath(path: string): string {
  // Replace any potentially dangerous characters
  return path.replace(/[`$\\!"']/g, "\\$&");
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

  // Escape paths to prevent injection
  const safePath = escapeShellPath(projectPath);
  const safeScript = escapeShellPath(scriptPath);

  switch (terminal) {
    case "ghostty":
      // Ghostty: use -e with the script path directly
      return `ghostty --working-directory="${safePath}" -e "${safeScript}"`;
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
    case "alacritty":
      return `alacritty --working-directory "${safePath}" -e "${safeScript}"`;
    case "kitty":
      return `kitty --directory "${safePath}" "${safeScript}"`;
    case "tilix":
      return `tilix --working-directory="${safePath}" -e "${safeScript}"`;
    case "xterm":
      return `xterm -e "${safeScript}"`;
    case "x-terminal-emulator":
      return `x-terminal-emulator -e "${safeScript}"`;
  }
}
