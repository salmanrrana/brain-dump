/**
 * Environment detection for Brain Dump MCP server.
 * Detects whether the MCP server is being invoked from:
 * - Claude Code (Anthropic's CLI)
 * - OpenCode (open source AI coding agent)
 * - Copilot CLI (GitHub's CLI AI agent)
 * - Codex (OpenAI Codex CLI/App)
 * - VS Code (with MCP extension)
 * - Cursor (with MCP extension)
 * - Unknown environment
 */

import fs from "fs";
import path from "path";

type Environment =
  | "claude-code"
  | "opencode"
  | "copilot-cli"
  | "codex"
  | "cursor"
  | "vscode"
  | "unknown";

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
  "TERM_PROGRAM",
];

const CLAUDE_CODE_ENV_PATTERNS = [
  "CLAUDE_CODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_API_KEY",
  "ANTHROPIC_API_KEY",
  "MCP_SERVER_NAME",
  "CLAUDE_CODE_TERMINAL_ID",
];

// Simple flags to indicate which tool is calling (set via MCP config)
const OPENCODE_FLAG = "OPENCODE";
const COPILOT_CLI_FLAG = "COPILOT_CLI";
const CURSOR_FLAG = "CURSOR";
const CODEX_FLAG = "CODEX";

/**
 * Known OpenCode environment variable patterns.
 * OpenCode uses the OPENCODE_* prefix for configuration via Viper.
 */
const OPENCODE_ENV_PATTERNS = [
  "OPENCODE_EXPERIMENTAL",
  "OPENCODE_EXPERIMENTAL_LSP_TOOL",
  "OPENCODE_DEV_DEBUG",
  "OPENCODE_SERVER_PASSWORD",
  "OPENCODE_SERVER_USERNAME",
];

/**
 * Copilot CLI environment variable patterns.
 * GitHub Copilot CLI uses COPILOT_* prefixed environment variables.
 */
const COPILOT_CLI_ENV_PATTERNS = ["COPILOT_TRACE_ID", "COPILOT_SESSION", "COPILOT_CLI_VERSION"];

/**
 * Cursor environment variable patterns.
 * Cursor uses CURSOR_* prefixed environment variables.
 */
const CURSOR_ENV_PATTERNS = ["CURSOR_TRACE_ID", "CURSOR_SESSION", "CURSOR_PID", "CURSOR_CWD"];

/**
 * Codex environment variable patterns.
 * Codex commonly exposes CODEX_* variables and CODEX_HOME.
 */
const CODEX_ENV_PATTERNS = [
  "CODEX_HOME",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_EXECUTOR",
  "CODEX_PROFILE",
  "CODEX_APPROVAL_POLICY",
];

function hasVSCodeEnvironment(): boolean {
  for (const envVar of VSCODE_ENV_PATTERNS) {
    if (envVar === "TERM_PROGRAM") {
      if (process.env.TERM_PROGRAM === "vscode") return true;
    } else if (process.env[envVar]) return true;
  }
  return false;
}

function hasClaudeCodeEnvironment(): boolean {
  for (const envVar of CLAUDE_CODE_ENV_PATTERNS) {
    if (process.env[envVar]) return true;
  }
  if (process.env.SHELL && process.env.SHELL.includes("claude")) return true;
  return false;
}

/**
 * Check if any OpenCode environment variables are present.
 * OpenCode uses the OPENCODE_* prefix for configuration.
 * Also checks for explicit OPENCODE flag set via MCP config.
 */
function hasOpenCodeEnvironment(): boolean {
  // Check explicit flag (set via MCP config environment section)
  if (process.env[OPENCODE_FLAG]) return true;

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
 * Check if any Cursor environment variables are present.
 * Cursor uses CURSOR_* prefixed environment variables.
 * Also checks for explicit CURSOR flag set via MCP config.
 */
function hasCursorEnvironment(): boolean {
  // Check explicit flag (set via MCP config env section)
  if (process.env[CURSOR_FLAG]) return true;

  // Check known Cursor environment variables
  for (const envVar of CURSOR_ENV_PATTERNS) {
    if (process.env[envVar]) return true;
  }
  // Check for any CURSOR_* prefixed environment variable
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CURSOR_")) return true;
  }
  return false;
}

/**
 * Check if any Copilot CLI environment variables are present.
 * GitHub Copilot CLI uses COPILOT_* prefixed environment variables.
 * Also checks for explicit COPILOT_CLI flag set via MCP config.
 */
function hasCopilotCliEnvironment(): boolean {
  // Check explicit flag (set via MCP config env section)
  if (process.env[COPILOT_CLI_FLAG]) return true;

  // Check known Copilot CLI environment variables
  for (const envVar of COPILOT_CLI_ENV_PATTERNS) {
    if (process.env[envVar]) return true;
  }
  return false;
}

/**
 * Check if any Codex environment variables are present.
 * Also checks for explicit CODEX flag set via MCP config.
 */
function hasCodexEnvironment(): boolean {
  if (process.env[CODEX_FLAG]) return true;

  for (const envVar of CODEX_ENV_PATTERNS) {
    if (process.env[envVar]) return true;
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CODEX_")) return true;
  }

  return false;
}

/**
 * Detect the current environment (claude-code, opencode, copilot-cli, codex, cursor, vscode, or unknown).
 * Claude Code takes priority, then OpenCode, then Copilot CLI, then Codex, then Cursor, then VS Code.
 */
export function detectEnvironment(): Environment {
  if (hasClaudeCodeEnvironment()) return "claude-code";
  if (hasOpenCodeEnvironment()) return "opencode";
  if (hasCopilotCliEnvironment()) return "copilot-cli";
  if (hasCodexEnvironment()) return "codex";
  if (hasCursorEnvironment()) return "cursor";
  if (hasVSCodeEnvironment()) return "vscode";
  return "unknown";
}

/**
 * Get the author name for comments based on the current environment.
 * Also checks for Ralph session to prefix with "ralph:".
 */
export function detectAuthor(): string {
  // Use synchronous fs access - this is safe in Node.js MCP server context
  // Check if Ralph session is active
  let isRalphSession = !!process.env.RALPH_SESSION;
  if (!isRalphSession) {
    try {
      const ralphStatePath = path.join(process.cwd(), ".claude/ralph-state.json");
      isRalphSession = fs.existsSync(ralphStatePath);
    } catch {
      // If file check fails, assume no Ralph session
      isRalphSession = false;
    }
  }

  let baseTool = "ai"; // fallback

  // Detect the underlying AI tool
  const environment = detectEnvironment();
  switch (environment) {
    case "claude-code":
      baseTool = "claude";
      break;
    case "opencode":
      baseTool = "opencode";
      break;
    case "copilot-cli":
      baseTool = "copilot";
      break;
    case "cursor":
      baseTool = "cursor";
      break;
    case "codex":
      baseTool = "codex";
      break;
    case "vscode":
      baseTool = "vscode";
      break;
    default:
      baseTool = "ai";
  }

  // If Ralph is orchestrating, prefix with ralph:
  if (isRalphSession) {
    return `ralph:${baseTool}`;
  }

  return baseTool;
}

interface EnvironmentInfo {
  environment: Environment;
  workspacePath: string | null;
  envVarsDetected: string[];
}

/**
 * Get detailed environment information.
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const environment = detectEnvironment();
  const envVarsDetected: string[] = [];
  let workspacePath: string | null = null;

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

  // Collect Copilot CLI env vars
  for (const envVar of COPILOT_CLI_ENV_PATTERNS) {
    if (process.env[envVar]) envVarsDetected.push(envVar);
  }
  if (process.env[COPILOT_CLI_FLAG]) envVarsDetected.push(COPILOT_CLI_FLAG);

  // Collect Cursor env vars
  for (const envVar of CURSOR_ENV_PATTERNS) {
    if (process.env[envVar]) envVarsDetected.push(envVar);
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CURSOR_") && !CURSOR_ENV_PATTERNS.includes(key)) {
      envVarsDetected.push(key);
    }
  }
  if (process.env[CURSOR_FLAG]) envVarsDetected.push(CURSOR_FLAG);

  // Collect Codex env vars
  for (const envVar of CODEX_ENV_PATTERNS) {
    if (process.env[envVar]) envVarsDetected.push(envVar);
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CODEX_") && !CODEX_ENV_PATTERNS.includes(key)) {
      envVarsDetected.push(key);
    }
  }
  if (process.env[CODEX_FLAG]) envVarsDetected.push(CODEX_FLAG);

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
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn("[environment] Could not determine working directory:", err.message);
    }
  }

  return { environment, workspacePath, envVarsDetected };
}
