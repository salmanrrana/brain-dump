import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectEnvironment,
  isClaudeCode,
  isVSCode,
  isKnownEnvironment,
  getEnvironmentInfo,
  _setEnvironmentOverride,
  type Environment,
} from "./environment";

describe("Environment Detection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all environment variables that affect detection
    delete process.env.CLAUDE_CODE;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MCP_SERVER_NAME;
    delete process.env.CLAUDE_CODE_TERMINAL_ID;
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
      process.env.MCP_SERVER_NAME = "brain-dumpy";
      expect(detectEnvironment()).toBe("claude-code");
    });

    it("should detect CLAUDE_CODE_TERMINAL_ID env var", () => {
      process.env.CLAUDE_CODE_TERMINAL_ID = "terminal-123";
      expect(detectEnvironment()).toBe("claude-code");
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

    it("should return false when in VS Code environment", () => {
      _setEnvironmentOverride("vscode");
      expect(isClaudeCode()).toBe(false);
    });

    it("should return false when in unknown environment", () => {
      _setEnvironmentOverride("unknown");
      expect(isClaudeCode()).toBe(false);
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

    it("should return false when in unknown environment", () => {
      _setEnvironmentOverride("unknown");
      expect(isVSCode()).toBe(false);
    });
  });

  describe("isKnownEnvironment", () => {
    it("should return true for Claude Code", () => {
      _setEnvironmentOverride("claude-code");
      expect(isKnownEnvironment()).toBe(true);
    });

    it("should return true for VS Code", () => {
      _setEnvironmentOverride("vscode");
      expect(isKnownEnvironment()).toBe(true);
    });

    it("should return false for unknown", () => {
      _setEnvironmentOverride("unknown");
      expect(isKnownEnvironment()).toBe(false);
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
      const validEnvironments: Environment[] = ["claude-code", "vscode", "unknown"];
      expect(validEnvironments.length).toBe(3);
    });
  });
});
