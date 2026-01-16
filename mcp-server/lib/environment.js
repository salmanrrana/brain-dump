/**
 * Environment detection for Brain Dump MCP server.
 * Detects whether the MCP server is being invoked from:
 * - Claude Code (Anthropic's CLI)
 * - OpenCode (open source AI coding agent)
 * - VS Code (with MCP extension)
 * - Unknown environment
 * @module lib/environment
 */

const VSCODE_ENV_PATTERNS = [
  "VSCODE_GIT_ASKPASS_NODE", "VSCODE_GIT_ASKPASS_MAIN", "VSCODE_GIT_IPC_HANDLE",
  "VSCODE_INJECTION", "VSCODE_CLI", "VSCODE_PID", "VSCODE_CWD",
  "VSCODE_NLS_CONFIG", "VSCODE_IPC_HOOK", "TERM_PROGRAM",
];

const CLAUDE_CODE_ENV_PATTERNS = [
  "CLAUDE_CODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_API_KEY",
  "ANTHROPIC_API_KEY", "MCP_SERVER_NAME", "CLAUDE_CODE_TERMINAL_ID",
];

/**
 * Known OpenCode environment variable patterns.
 * OpenCode uses the OPENCODE_* prefix for configuration via Viper.
 */
const OPENCODE_ENV_PATTERNS = [
  "OPENCODE_EXPERIMENTAL", "OPENCODE_EXPERIMENTAL_LSP_TOOL",
  "OPENCODE_DEV_DEBUG", "OPENCODE_SERVER_PASSWORD", "OPENCODE_SERVER_USERNAME",
];

function hasVSCodeEnvironment() {
  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") return true;
    } else if (process.env[envVar]) return true;
  }
  return false;
}

function hasClaudeCodeEnvironment() {
  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) return true;
  }
  if (process.env.SHELL && process.env.SHELL.includes("claude")) return true;
  return false;
}

/**
 * Check if any OpenCode environment variables are present.
 * OpenCode uses the OPENCODE_* prefix for configuration.
 */
function hasOpenCodeEnvironment() {
  // Check known OpenCode environment variables
  for (const envVar of OPENCODE_ENV_PATTERNS) {
    if (process.env[envVar]) return true;
  }
  // Check for any OPENCODE_* prefixed environment variable
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("OPENCODE_")) return true;
  }
  return false;
}

/**
 * Detect the current environment (claude-code, opencode, vscode, or unknown).
 * Claude Code takes priority, then OpenCode, then VS Code.
 * @returns {"claude-code"|"opencode"|"vscode"|"unknown"}
 */
export function detectEnvironment() {
  if (hasClaudeCodeEnvironment()) return "claude-code";
  if (hasOpenCodeEnvironment()) return "opencode";
  if (hasVSCodeEnvironment()) return "vscode";
  return "unknown";
}

/**
 * Get detailed environment information.
 * @returns {{environment: string, workspacePath: string|null, envVarsDetected: string[]}}
 */
export function getEnvironmentInfo() {
  const environment = detectEnvironment();
  const envVarsDetected = [];
  let workspacePath = null;

  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) envVarsDetected.push(envVar);
  }

  // Collect OpenCode env vars (both known patterns and any OPENCODE_* prefix)
  for (const envVar of OPENCODE_ENV_PATTERNS) {
    if (process.env[envVar]) envVarsDetected.push(envVar);
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("OPENCODE_") && !OPENCODE_ENV_PATTERNS.includes(key)) {
      envVarsDetected.push(key);
    }
  }

  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") envVarsDetected.push("TERM_PROGRAM=vscode");
    } else if (process.env[envVar]) envVarsDetected.push(envVar);
  }

  if (process.env.VSCODE_CWD) workspacePath = process.env.VSCODE_CWD;
  else if (process.env.PWD) workspacePath = process.env.PWD;
  else {
    try {
      workspacePath = process.cwd();
    } catch (error) {
      // Log for debugging - cwd can fail if directory was deleted or permissions changed
      console.warn("[environment] Could not determine working directory:", error.message);
    }
  }

  return { environment, workspacePath, envVarsDetected };
}
