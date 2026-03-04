/**
 * Environment detection utility for Brain Dump
 *
 * Detects whether the application is being invoked from:
 * - Claude Code (Anthropic's CLI)
 * - OpenCode (open source AI coding agent)
 * - Copilot CLI (GitHub's CLI AI agent)
 * - Codex (OpenAI Codex CLI/App)
 * - Cursor (AI-first editor)
 * - VS Code (with MCP extension)
 * - Unknown environment
 */

export type Environment =
  | "claude-code"
  | "opencode"
  | "copilot-cli"
  | "codex"
  | "cursor"
  | "vscode"
  | "unknown";

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
  "CLAUDE_CODE_TERMINAL_ID",
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

const COPILOT_CLI_ENV_PATTERNS = [
  "COPILOT_TRACE_ID",
  "COPILOT_SESSION",
  "COPILOT_CLI_VERSION",
] as const;

const CURSOR_ENV_PATTERNS = ["CURSOR_TRACE_ID", "CURSOR_SESSION", "CURSOR_PID", "CURSOR_CWD"] as const;

const CODEX_ENV_PATTERNS = [
  "CODEX_HOME",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_EXECUTOR",
  "CODEX_PROFILE",
  "CODEX_APPROVAL_POLICY",
] as const;

// Explicit environment flags set by Brain Dump MCP config
const OPENCODE_FLAG = "OPENCODE";
const COPILOT_CLI_FLAG = "COPILOT_CLI";
const CURSOR_FLAG = "CURSOR";
const CODEX_FLAG = "CODEX";

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
  // Check explicit flag (set via MCP config)
  if (process.env[OPENCODE_FLAG]) {
    return true;
  }

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
 * Check if any Copilot CLI environment variables are present.
 */
function hasCopilotCliEnvironment(): boolean {
  if (process.env[COPILOT_CLI_FLAG]) {
    return true;
  }

  for (const envVar of COPILOT_CLI_ENV_PATTERNS) {
    if (process.env[envVar]) {
      return true;
    }
  }

  return false;
}

/**
 * Check if any Cursor environment variables are present.
 */
function hasCursorEnvironment(): boolean {
  if (process.env[CURSOR_FLAG]) {
    return true;
  }

  for (const envVar of CURSOR_ENV_PATTERNS) {
    if (process.env[envVar]) {
      return true;
    }
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CURSOR_")) {
      return true;
    }
  }

  return false;
}

/**
 * Check if any Codex environment variables are present.
 */
function hasCodexEnvironment(): boolean {
  if (process.env[CODEX_FLAG]) {
    return true;
  }

  for (const envVar of CODEX_ENV_PATTERNS) {
    if (process.env[envVar]) {
      return true;
    }
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CODEX_")) {
      return true;
    }
  }

  return false;
}

/**
 * Detect the current environment
 *
 * Detection priority:
 * 1. Claude Code runtime vars (CLAUDE_CODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_TERMINAL_ID)
 *    — set by Claude Code process, not inherited from user shell
 * 2. Explicit provider flags (OPENCODE, COPILOT_CLI, CODEX, CURSOR)
 *    — set intentionally via MCP config env section
 * 3. Provider-specific env var patterns (OPENCODE_*, COPILOT_*, etc.)
 *    — heuristic detection from provider-specific env vars
 * 4. VS Code env vars (lowest priority since other tools may run inside VS Code terminals)
 *
 * NOTE: Generic env vars like ANTHROPIC_API_KEY, CLAUDE_API_KEY, and MCP_SERVER_NAME are
 * intentionally excluded from Claude Code detection as they may be present in any environment.
 */
export function detectEnvironment(): Environment {
  // Allow test override
  if (environmentOverride !== null) {
    return environmentOverride;
  }

  // Claude Code runtime vars — set by Claude Code process itself, very reliable
  if (hasClaudeCodeEnvironment()) return "claude-code";

  // Explicit provider flags — intentionally set via MCP config
  if (process.env[OPENCODE_FLAG]) return "opencode";
  if (process.env[COPILOT_CLI_FLAG]) return "copilot-cli";
  if (process.env[CODEX_FLAG]) return "codex";
  if (process.env[CURSOR_FLAG]) return "cursor";

  // Heuristic detection via provider-specific env var patterns
  if (hasOpenCodeEnvironment()) return "opencode";
  if (hasCopilotCliEnvironment()) return "copilot-cli";
  if (hasCodexEnvironment()) return "codex";
  if (hasCursorEnvironment()) return "cursor";
  if (hasVSCodeEnvironment()) return "vscode";
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
 * Check if currently running in Copilot CLI
 */
export function isCopilotCli(): boolean {
  return detectEnvironment() === "copilot-cli";
}

/**
 * Check if currently running in Codex
 */
export function isCodex(): boolean {
  return detectEnvironment() === "codex";
}

/**
 * Check if currently running in Cursor
 */
export function isCursor(): boolean {
  return detectEnvironment() === "cursor";
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
  if (process.env[OPENCODE_FLAG]) {
    envVarsDetected.push(OPENCODE_FLAG);
  }
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

  for (const envVar of COPILOT_CLI_ENV_PATTERNS) {
    if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }
  if (process.env[COPILOT_CLI_FLAG]) {
    envVarsDetected.push(COPILOT_CLI_FLAG);
  }

  for (const envVar of CURSOR_ENV_PATTERNS) {
    if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("CURSOR_") &&
      !CURSOR_ENV_PATTERNS.includes(key as (typeof CURSOR_ENV_PATTERNS)[number])
    ) {
      envVarsDetected.push(key);
    }
  }
  if (process.env[CURSOR_FLAG]) {
    envVarsDetected.push(CURSOR_FLAG);
  }

  for (const envVar of CODEX_ENV_PATTERNS) {
    if (process.env[envVar]) {
      envVarsDetected.push(envVar);
    }
  }
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("CODEX_") &&
      !CODEX_ENV_PATTERNS.includes(key as (typeof CODEX_ENV_PATTERNS)[number])
    ) {
      envVarsDetected.push(key);
    }
  }
  if (process.env[CODEX_FLAG]) {
    envVarsDetected.push(CODEX_FLAG);
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
