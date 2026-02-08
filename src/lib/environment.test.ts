import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectEnvironment,
  isClaudeCode,
  isOpenCode,
  isCopilotCli,
  isCodex,
  isCursor,
  isVSCode,
  getEnvironmentInfo,
  _setEnvironmentOverride,
  type Environment,
} from "./environment";

describe("Environment Detection", () => {
  const originalEnv = { ...process.env };
  const detectionPrefixes = ["OPENCODE_", "COPILOT_", "CURSOR_", "CODEX_"] as const;

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (detectionPrefixes.some((prefix) => key.startsWith(prefix))) {
        delete process.env[key];
      }
    }

    // Clear all environment variables that affect detection
    delete process.env.CLAUDE_CODE;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MCP_SERVER_NAME;
    delete process.env.CLAUDE_CODE_TERMINAL_ID;
    delete process.env.OPENCODE;
    delete process.env.OPENCODE_EXPERIMENTAL;
    delete process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL;
    delete process.env.OPENCODE_DEV_DEBUG;
    delete process.env.OPENCODE_SERVER_PASSWORD;
    delete process.env.OPENCODE_SERVER_USERNAME;
    delete process.env.COPILOT_CLI;
    delete process.env.COPILOT_TRACE_ID;
    delete process.env.COPILOT_SESSION;
    delete process.env.COPILOT_CLI_VERSION;
    delete process.env.CURSOR;
    delete process.env.CURSOR_TRACE_ID;
    delete process.env.CURSOR_SESSION;
    delete process.env.CURSOR_PID;
    delete process.env.CURSOR_CWD;
    delete process.env.CODEX;
    delete process.env.CODEX_HOME;
    delete process.env.CODEX_SANDBOX_NETWORK_DISABLED;
    delete process.env.CODEX_EXECUTOR;
    delete process.env.CODEX_PROFILE;
    delete process.env.CODEX_APPROVAL_POLICY;
    delete process.env.VSCODE_GIT_ASKPASS_NODE;
    delete process.env.VSCODE_GIT_ASKPASS_MAIN;
    delete process.env.VSCODE_GIT_IPC_HANDLE;
    delete process.env.VSCODE_INJECTION;
    delete process.env.VSCODE_CLI;
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_CWD;
    delete process.env.VSCODE_NLS_CONFIG;
    delete process.env.VSCODE_IPC_HOOK;
    delete process.env.TERM_PROGRAM;
    // Reset override
    _setEnvironmentOverride(null);
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    _setEnvironmentOverride(null);
  });

  // ===========================================================================
  // ENVIRONMENT OVERRIDE TESTS
  // ===========================================================================

  describe("Environment Override", () => {
    it("should return override when set to 'claude-code'", () => {
      _setEnvironmentOverride("claude-code");
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should return override when set to 'opencode'", () => {
      _setEnvironmentOverride("opencode");
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should return override when set to 'copilot-cli'", () => {
      _setEnvironmentOverride("copilot-cli");
      expect(detectEnvironment()).toBe("copilot-cli");
    });

    it("should return override when set to 'codex'", () => {
      _setEnvironmentOverride("codex");
      expect(detectEnvironment()).toBe("codex");
    });

    it("should return override when set to 'cursor'", () => {
      _setEnvironmentOverride("cursor");
      expect(detectEnvironment()).toBe("cursor");
    });

    it("should return override when set to 'vscode'", () => {
      _setEnvironmentOverride("vscode");
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should return override when set to 'unknown'", () => {
      _setEnvironmentOverride("unknown");
      expect(detectEnvironment()).toBe("unknown");
    });

    it("should detect normally when override is cleared", () => {
      _setEnvironmentOverride("claude-code");
      expect(detectEnvironment()).toBe("claude-code");

      _setEnvironmentOverride(null);
      // With no env vars set, should be unknown
      expect(detectEnvironment()).toBe("unknown");
    });
  });

  // ===========================================================================
  // CLAUDE CODE DETECTION TESTS
  // ===========================================================================

  describe("Claude Code Detection", () => {
    it("should detect CLAUDE_CODE env var", () => {
      process.env.CLAUDE_CODE = "true";
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect CLAUDE_CODE_ENTRYPOINT env var", () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = "/path/to/claude";
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect CLAUDE_API_KEY env var", () => {
      process.env.CLAUDE_API_KEY = "sk-test-key";
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect ANTHROPIC_API_KEY env var", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect MCP_SERVER_NAME env var", () => {
      process.env.MCP_SERVER_NAME = "brain-dump";
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect CLAUDE_CODE_TERMINAL_ID env var", () => {
      process.env.CLAUDE_CODE_TERMINAL_ID = "terminal-123";
      expect(detectEnvironment()).toBe("claude-code");
    });
  });

  // ===========================================================================
  // OPENCODE DETECTION TESTS
  // ===========================================================================

  describe("OpenCode Detection", () => {
    it("should detect OPENCODE_EXPERIMENTAL env var", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should detect OPENCODE_EXPERIMENTAL_LSP_TOOL env var", () => {
      process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL = "true";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should detect OPENCODE_DEV_DEBUG env var", () => {
      process.env.OPENCODE_DEV_DEBUG = "true";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should detect OPENCODE_SERVER_PASSWORD env var", () => {
      process.env.OPENCODE_SERVER_PASSWORD = "secret";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should detect OPENCODE_SERVER_USERNAME env var", () => {
      process.env.OPENCODE_SERVER_USERNAME = "admin";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should detect any OPENCODE_* prefixed env var", () => {
      process.env.OPENCODE_CUSTOM_SETTING = "value";
      expect(detectEnvironment()).toBe("opencode");
      delete process.env.OPENCODE_CUSTOM_SETTING;
    });
  });

  // ===========================================================================
  // COPILOT CLI DETECTION TESTS
  // ===========================================================================

  describe("Copilot CLI Detection", () => {
    it("should detect COPILOT_CLI flag", () => {
      process.env.COPILOT_CLI = "1";
      expect(detectEnvironment()).toBe("copilot-cli");
    });

    it("should detect COPILOT_TRACE_ID env var", () => {
      process.env.COPILOT_TRACE_ID = "trace-123";
      expect(detectEnvironment()).toBe("copilot-cli");
    });

    it("should detect COPILOT_SESSION env var", () => {
      process.env.COPILOT_SESSION = "session-123";
      expect(detectEnvironment()).toBe("copilot-cli");
    });

    it("should detect COPILOT_CLI_VERSION env var", () => {
      process.env.COPILOT_CLI_VERSION = "1.0.0";
      expect(detectEnvironment()).toBe("copilot-cli");
    });
  });

  // ===========================================================================
  // CODEX DETECTION TESTS
  // ===========================================================================

  describe("Codex Detection", () => {
    it("should detect CODEX flag", () => {
      process.env.CODEX = "1";
      expect(detectEnvironment()).toBe("codex");
    });

    it("should detect CODEX_HOME env var", () => {
      process.env.CODEX_HOME = "/Users/test/.codex";
      expect(detectEnvironment()).toBe("codex");
    });

    it("should detect any CODEX_* prefixed env var", () => {
      process.env.CODEX_CUSTOM_SETTING = "enabled";
      expect(detectEnvironment()).toBe("codex");
      delete process.env.CODEX_CUSTOM_SETTING;
    });
  });

  // ===========================================================================
  // CURSOR DETECTION TESTS
  // ===========================================================================

  describe("Cursor Detection", () => {
    it("should detect CURSOR flag", () => {
      process.env.CURSOR = "1";
      expect(detectEnvironment()).toBe("cursor");
    });

    it("should detect CURSOR_TRACE_ID env var", () => {
      process.env.CURSOR_TRACE_ID = "trace-123";
      expect(detectEnvironment()).toBe("cursor");
    });

    it("should detect any CURSOR_* prefixed env var", () => {
      process.env.CURSOR_CUSTOM_SETTING = "enabled";
      expect(detectEnvironment()).toBe("cursor");
      delete process.env.CURSOR_CUSTOM_SETTING;
    });
  });

  // ===========================================================================
  // VS CODE DETECTION TESTS
  // ===========================================================================

  describe("VS Code Detection", () => {
    it("should detect VSCODE_GIT_ASKPASS_NODE env var", () => {
      process.env.VSCODE_GIT_ASKPASS_NODE = "/path/to/node";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_GIT_ASKPASS_MAIN env var", () => {
      process.env.VSCODE_GIT_ASKPASS_MAIN = "/path/to/main";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_GIT_IPC_HANDLE env var", () => {
      process.env.VSCODE_GIT_IPC_HANDLE = "/path/to/handle";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_INJECTION env var", () => {
      process.env.VSCODE_INJECTION = "1";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_CLI env var", () => {
      process.env.VSCODE_CLI = "1";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_PID env var", () => {
      process.env.VSCODE_PID = "12345";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_CWD env var", () => {
      process.env.VSCODE_CWD = "/path/to/workspace";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_NLS_CONFIG env var", () => {
      process.env.VSCODE_NLS_CONFIG = "{}";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect VSCODE_IPC_HOOK env var", () => {
      process.env.VSCODE_IPC_HOOK = "/path/to/hook";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should detect TERM_PROGRAM=vscode", () => {
      process.env.TERM_PROGRAM = "vscode";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should NOT detect TERM_PROGRAM with other values", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      expect(detectEnvironment()).toBe("unknown");
    });
  });

  // ===========================================================================
  // PRIORITY TESTS
  // ===========================================================================

  describe("Detection Priority", () => {
    it("should prioritize Claude Code over VS Code when both are present", () => {
      // Set both VS Code and Claude Code env vars
      process.env.VSCODE_GIT_ASKPASS_NODE = "/path/to/node";
      process.env.VSCODE_PID = "12345";
      process.env.CLAUDE_CODE = "true";

      // Claude Code should win
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should prioritize Claude Code over OpenCode when both are present", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true";
      process.env.CLAUDE_CODE = "true";

      // Claude Code should win
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should prioritize OpenCode over VS Code when both are present", () => {
      process.env.VSCODE_GIT_ASKPASS_NODE = "/path/to/node";
      process.env.OPENCODE_DEV_DEBUG = "true";

      // OpenCode should win
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should prioritize OpenCode over Copilot CLI when both are present", () => {
      process.env.OPENCODE_DEV_DEBUG = "true";
      process.env.COPILOT_TRACE_ID = "trace-123";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should prioritize Copilot CLI over Codex when both are present", () => {
      process.env.COPILOT_TRACE_ID = "trace-123";
      process.env.CODEX = "1";
      expect(detectEnvironment()).toBe("copilot-cli");
    });

    it("should prioritize Codex over Cursor when both are present", () => {
      process.env.CODEX = "1";
      process.env.CURSOR = "1";
      expect(detectEnvironment()).toBe("codex");
    });

    it("should prioritize Cursor over VS Code when both are present", () => {
      process.env.CURSOR = "1";
      process.env.VSCODE_CLI = "1";
      expect(detectEnvironment()).toBe("cursor");
    });

    it("should prioritize Claude Code over both OpenCode and VS Code", () => {
      process.env.VSCODE_GIT_ASKPASS_NODE = "/path/to/node";
      process.env.OPENCODE_EXPERIMENTAL = "true";
      process.env.CLAUDE_CODE = "true";

      // Claude Code should win
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect OpenCode when only OpenCode vars are present", () => {
      process.env.OPENCODE_DEV_DEBUG = "true";
      expect(detectEnvironment()).toBe("opencode");
    });

    it("should detect Copilot CLI when only Copilot vars are present", () => {
      process.env.COPILOT_TRACE_ID = "trace-123";
      expect(detectEnvironment()).toBe("copilot-cli");
    });

    it("should detect Codex when only Codex vars are present", () => {
      process.env.CODEX = "1";
      expect(detectEnvironment()).toBe("codex");
    });

    it("should detect Cursor when only Cursor vars are present", () => {
      process.env.CURSOR = "1";
      expect(detectEnvironment()).toBe("cursor");
    });

    it("should detect VS Code when only VS Code vars are present", () => {
      process.env.VSCODE_GIT_ASKPASS_NODE = "/path/to/node";
      expect(detectEnvironment()).toBe("vscode");
    });

    it("should return unknown when no indicators are present", () => {
      expect(detectEnvironment()).toBe("unknown");
    });
  });

  // ===========================================================================
  // HELPER FUNCTION TESTS
  // ===========================================================================

  describe("isClaudeCode", () => {
    it("should return true when in Claude Code environment", () => {
      _setEnvironmentOverride("claude-code");
      expect(isClaudeCode()).toBe(true);
    });

    it("should return false when in OpenCode environment", () => {
      _setEnvironmentOverride("opencode");
      expect(isClaudeCode()).toBe(false);
    });

    it("should return false when in VS Code environment", () => {
      _setEnvironmentOverride("vscode");
      expect(isClaudeCode()).toBe(false);
    });

    it("should return false when in unknown environment", () => {
      _setEnvironmentOverride("unknown");
      expect(isClaudeCode()).toBe(false);
    });
  });

  describe("isOpenCode", () => {
    it("should return true when in OpenCode environment", () => {
      _setEnvironmentOverride("opencode");
      expect(isOpenCode()).toBe(true);
    });

    it("should return false when in Claude Code environment", () => {
      _setEnvironmentOverride("claude-code");
      expect(isOpenCode()).toBe(false);
    });

    it("should return false when in VS Code environment", () => {
      _setEnvironmentOverride("vscode");
      expect(isOpenCode()).toBe(false);
    });

    it("should return false when in unknown environment", () => {
      _setEnvironmentOverride("unknown");
      expect(isOpenCode()).toBe(false);
    });
  });

  describe("isCopilotCli", () => {
    it("should return true when in Copilot CLI environment", () => {
      _setEnvironmentOverride("copilot-cli");
      expect(isCopilotCli()).toBe(true);
    });

    it("should return false when in Codex environment", () => {
      _setEnvironmentOverride("codex");
      expect(isCopilotCli()).toBe(false);
    });
  });

  describe("isCodex", () => {
    it("should return true when in Codex environment", () => {
      _setEnvironmentOverride("codex");
      expect(isCodex()).toBe(true);
    });

    it("should return false when in Cursor environment", () => {
      _setEnvironmentOverride("cursor");
      expect(isCodex()).toBe(false);
    });
  });

  describe("isCursor", () => {
    it("should return true when in Cursor environment", () => {
      _setEnvironmentOverride("cursor");
      expect(isCursor()).toBe(true);
    });

    it("should return false when in Copilot CLI environment", () => {
      _setEnvironmentOverride("copilot-cli");
      expect(isCursor()).toBe(false);
    });
  });

  describe("isVSCode", () => {
    it("should return true when in VS Code environment", () => {
      _setEnvironmentOverride("vscode");
      expect(isVSCode()).toBe(true);
    });

    it("should return false when in Claude Code environment", () => {
      _setEnvironmentOverride("claude-code");
      expect(isVSCode()).toBe(false);
    });

    it("should return false when in OpenCode environment", () => {
      _setEnvironmentOverride("opencode");
      expect(isVSCode()).toBe(false);
    });

    it("should return false when in unknown environment", () => {
      _setEnvironmentOverride("unknown");
      expect(isVSCode()).toBe(false);
    });
  });

  // ===========================================================================
  // ENVIRONMENT INFO TESTS
  // ===========================================================================

  describe("getEnvironmentInfo", () => {
    it("should return environment type", () => {
      _setEnvironmentOverride("claude-code");
      const info = getEnvironmentInfo();
      expect(info.environment).toBe("claude-code");
    });

    it("should include workspace path from VSCODE_CWD", () => {
      process.env.VSCODE_CWD = "/path/to/workspace";
      const info = getEnvironmentInfo();
      expect(info.workspacePath).toBe("/path/to/workspace");
    });

    it("should include workspace path from PWD when VSCODE_CWD not set", () => {
      process.env.PWD = "/home/user/project";
      const info = getEnvironmentInfo();
      expect(info.workspacePath).toBe("/home/user/project");
    });

    it("should list detected Claude Code env vars", () => {
      process.env.CLAUDE_CODE = "true";
      process.env.ANTHROPIC_API_KEY = "sk-test";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("CLAUDE_CODE");
      expect(info.envVarsDetected).toContain("ANTHROPIC_API_KEY");
    });

    it("should list detected VS Code env vars", () => {
      process.env.VSCODE_PID = "12345";
      process.env.VSCODE_CWD = "/workspace";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("VSCODE_PID");
      expect(info.envVarsDetected).toContain("VSCODE_CWD");
    });

    it("should list detected OpenCode env vars", () => {
      process.env.OPENCODE_EXPERIMENTAL = "true";
      process.env.OPENCODE_DEV_DEBUG = "true";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("OPENCODE_EXPERIMENTAL");
      expect(info.envVarsDetected).toContain("OPENCODE_DEV_DEBUG");
    });

    it("should list detected Copilot CLI env vars", () => {
      process.env.COPILOT_TRACE_ID = "trace-123";
      process.env.COPILOT_CLI = "1";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("COPILOT_TRACE_ID");
      expect(info.envVarsDetected).toContain("COPILOT_CLI");
    });

    it("should list detected Cursor env vars", () => {
      process.env.CURSOR_TRACE_ID = "trace-123";
      process.env.CURSOR_CUSTOM_CONFIG = "value";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("CURSOR_TRACE_ID");
      expect(info.envVarsDetected).toContain("CURSOR_CUSTOM_CONFIG");
      delete process.env.CURSOR_CUSTOM_CONFIG;
    });

    it("should list detected Codex env vars", () => {
      process.env.CODEX_HOME = "/Users/test/.codex";
      process.env.CODEX_CUSTOM_CONFIG = "value";
      process.env.CODEX = "1";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("CODEX_HOME");
      expect(info.envVarsDetected).toContain("CODEX_CUSTOM_CONFIG");
      expect(info.envVarsDetected).toContain("CODEX");
      delete process.env.CODEX_CUSTOM_CONFIG;
    });

    it("should list custom OPENCODE_* prefixed env vars", () => {
      process.env.OPENCODE_CUSTOM_CONFIG = "value";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("OPENCODE_CUSTOM_CONFIG");
      delete process.env.OPENCODE_CUSTOM_CONFIG;
    });

    it("should handle TERM_PROGRAM=vscode specially", () => {
      process.env.TERM_PROGRAM = "vscode";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toContain("TERM_PROGRAM=vscode");
    });

    it("should NOT include TERM_PROGRAM with non-vscode values", () => {
      process.env.TERM_PROGRAM = "iTerm.app";
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).not.toContain("TERM_PROGRAM");
      expect(info.envVarsDetected).not.toContain("TERM_PROGRAM=iTerm.app");
    });

    it("should return empty envVarsDetected array when none found", () => {
      _setEnvironmentOverride("unknown");
      const info = getEnvironmentInfo();
      expect(info.envVarsDetected).toEqual([]);
    });
  });

  // ===========================================================================
  // TYPE EXPORTS TEST
  // ===========================================================================

  describe("Type Exports", () => {
    it("should export Environment type with correct values", () => {
      const validEnvironments: Environment[] = [
        "claude-code",
        "opencode",
        "copilot-cli",
        "codex",
        "cursor",
        "vscode",
        "unknown",
      ];
      expect(validEnvironments.length).toBe(7);
    });
  });
});
