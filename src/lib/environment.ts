/**
 * Environment detection utility for Brain Dump
 *
 * Detects whether the application is being invoked from:
 * - Claude Code (Anthropic's CLI)
 * - OpenCode (open source AI coding agent)
 * - VS Code (with MCP extension)
 * - Unknown environment
 */

export type Environment = "claude-code" | "opencode" | "vscode" | "unknown";

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

/**
 * Known OpenCode environment variable patterns.
 * OpenCode uses the OPENCODE_* prefix for configuration via Viper.
 */
const OPENCODE_ENV_PATTERNS = [
  "OPENCODE_EXPERIMENTAL", // Enables experimental features
  "OPENCODE_EXPERIMENTAL_LSP_TOOL", // Enables LSP tool
  "OPENCODE_DEV_DEBUG", // Enables debug logging
  "OPENCODE_SERVER_PASSWORD", // Server mode authentication
  "OPENCODE_SERVER_USERNAME", // Server mode username
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
 * Check if any OpenCode environment variables are present.
 * OpenCode uses the OPENCODE_* prefix for configuration.
 */
function hasOpenCodeEnvironment(): boolean {
  // Check known OpenCode environment variables
  for (const envVar of OPENCODE_ENV_PATTERNS) {
    if (process.env[envVar]) {
      return true;
    }
  }

  // Check for any OPENCODE_* prefixed environment variable
  // OpenCode uses Viper which supports env var overrides with this prefix
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("OPENCODE_")) {
      return true;
    }
  }

  return false;
}

/**
 * Detect the current environment
 *
 * Detection priority:
 * 1. If Claude Code env vars are present -> "claude-code"
 * 2. If OpenCode env vars are present -> "opencode"
 * 3. If VS Code env vars are present -> "vscode"
 * 4. Otherwise -> "unknown"
 *
 * Claude Code takes priority because it may run inside a VS Code terminal,
 * and OpenCode takes priority over VS Code for similar reasons.
 * We want to use tool-specific features when available.
 */
export function detectEnvironment(): Environment {
  // Allow test override
  if (environmentOverride !== null) {
    return environmentOverride;
  }

  // Check Claude Code first (highest priority)
  if (hasClaudeCodeEnvironment()) {
    return "claude-code";
  }

  // Check OpenCode (second priority)
  if (hasOpenCodeEnvironment()) {
    return "opencode";
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
 * Check if currently running in OpenCode
 */
export function isOpenCode(): boolean {
  return detectEnvironment() === "opencode";
}

/**
 * Check if currently running in VS Code
 */
export function isVSCode(): boolean {
  return detectEnvironment() === "vscode";
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

  // Collect OpenCode env vars (both known patterns and any OPENCODE_* prefix)
  for (const envVar of OPENCODE_ENV_PATTERNS) {
    if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }
  // Also check for any other OPENCODE_* prefixed variables
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("OPENCODE_") &&
      !OPENCODE_ENV_PATTERNS.includes(key as (typeof OPENCODE_ENV_PATTERNS)[number])
    ) {
      envVarsDetected.push(key);
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
    } catch (error) {
      // Log for debugging - cwd can fail if directory was deleted or permissions changed
      console.warn(
        "[environment] Could not determine working directory:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  return {
    environment,
    workspacePath,
    envVarsDetected,
  };
}
