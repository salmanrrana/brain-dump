/**
 * Environment detection utility for Brain Dumpy
 *
 * Detects whether the application is being invoked from:
 * - Claude Code (Anthropic's CLI)
 * - VS Code (with MCP extension)
 * - Unknown environment
 */

export type Environment = "claude-code" | "vscode" | "unknown";

/**
 * Environment variable patterns used for detection
 */
const VSCODE_ENV_PATTERNS = [
  "VSCODE_GIT_ASKPASS_NODE",
  "VSCODE_GIT_ASKPASS_MAIN",
  "VSCODE_GIT_IPC_HANDLE",
  "VSCODE_INJECTION",
  "VSCODE_CLI",
  "VSCODE_PID",
  "VSCODE_CWD",
  "VSCODE_NLS_CONFIG",
  "VSCODE_IPC_HOOK",
  "TERM_PROGRAM", // Check if value is "vscode"
] as const;

const CLAUDE_CODE_ENV_PATTERNS = [
  "CLAUDE_CODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_API_KEY", // May indicate Claude Code context
  "ANTHROPIC_API_KEY", // May indicate Anthropic tooling
  "MCP_SERVER_NAME", // When run as MCP server in Claude Code
] as const;

let environmentOverride: Environment | null = null;

/** @internal - Only for use in tests */
export function _setEnvironmentOverride(env: Environment | null): void {
  environmentOverride = env;
}

/**
 * Check if any VS Code environment variables are present
 */
function hasVSCodeEnvironment(): boolean {
  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") {
        return true;
      }
    } else if (process.env[envVar]) {
      return true;
    }
  }
  return false;
}

/**
 * Check if any Claude Code environment variables are present
 */
function hasClaudeCodeEnvironment(): boolean {
  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) {
      return true;
    }
  }

  // Additional checks for Claude Code indicators
  // Claude Code sets specific shell integration
  if (process.env.CLAUDE_CODE_TERMINAL_ID) {
    return true;
  }

  // Check if running in a Claude Code session
  if (process.env.SHELL && process.env.SHELL.includes("claude")) {
    return true;
  }

  return false;
}

/**
 * Detect the current environment
 *
 * Detection priority:
 * 1. If Claude Code env vars are present -> "claude-code"
 * 2. If VS Code env vars are present -> "vscode"
 * 3. Otherwise -> "unknown"
 *
 * Claude Code takes priority because it may run inside a VS Code terminal,
 * but we want to use Claude Code-specific features when available.
 */
export function detectEnvironment(): Environment {
  // Allow test override
  if (environmentOverride !== null) {
    return environmentOverride;
  }

  // Check Claude Code first (higher priority)
  if (hasClaudeCodeEnvironment()) {
    return "claude-code";
  }

  // Check VS Code
  if (hasVSCodeEnvironment()) {
    return "vscode";
  }

  return "unknown";
}

/**
 * Check if currently running in Claude Code
 */
export function isClaudeCode(): boolean {
  return detectEnvironment() === "claude-code";
}

/**
 * Check if currently running in VS Code
 */
export function isVSCode(): boolean {
  return detectEnvironment() === "vscode";
}

/**
 * Check if the environment is known (not "unknown")
 */
export function isKnownEnvironment(): boolean {
  return detectEnvironment() !== "unknown";
}

/**
 * Get environment info including workspace path
 */
export interface EnvironmentInfo {
  environment: Environment;
  workspacePath: string | null;
  envVarsDetected: string[];
}

/**
 * Get detailed environment information
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const environment = detectEnvironment();
  const envVarsDetected: string[] = [];
  let workspacePath: string | null = null;

  // Collect detected env vars
  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }

  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") {
        envVarsDetected.push("TERM_PROGRAM=vscode");
      }
      // Skip TERM_PROGRAM for other values
    } else if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }

  // Try to determine workspace path
  if (process.env.VSCODE_CWD) {
    workspacePath = process.env.VSCODE_CWD;
  } else if (process.env.PWD) {
    workspacePath = process.env.PWD;
  } else if (process.cwd) {
    try {
      workspacePath = process.cwd();
    } catch {
      // Ignore cwd errors
    }
  }

  return {
    environment,
    workspacePath,
    envVarsDetected,
  };
}
