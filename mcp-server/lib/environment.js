/**
 * Environment detection for Brain Dump MCP server.
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
 * Detect the current environment (claude-code, vscode, or unknown).
 * Claude Code takes priority because it may run inside a VS Code terminal.
 * @returns {"claude-code"|"vscode"|"unknown"}
 */
export function detectEnvironment() {
  if (hasClaudeCodeEnvironment()) return "claude-code";
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

  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") envVarsDetected.push("TERM_PROGRAM=vscode");
    } else if (process.env[envVar]) envVarsDetected.push(envVar);
  }

  if (process.env.VSCODE_CWD) workspacePath = process.env.VSCODE_CWD;
  else if (process.env.PWD) workspacePath = process.env.PWD;
  else { try { workspacePath = process.cwd(); } catch { /* ignore */ } }

  return { environment, workspacePath, envVarsDetected };
}
