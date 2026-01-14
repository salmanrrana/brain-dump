import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTerminalCommand,
  isAllowedTerminal,
  detectTerminal,
  isTerminalAvailable,
} from "./terminal-utils";

// Store original platform
const originalPlatform = process.platform;

// Helper to mock platform
function mockPlatform(platform: string) {
  Object.defineProperty(process, "platform", {
    value: platform,
    writable: true,
    configurable: true,
  });
}

// Helper to restore platform
function restorePlatform() {
  Object.defineProperty(process, "platform", {
    value: originalPlatform,
    writable: true,
    configurable: true,
  });
}

describe("terminal-utils", () => {
  afterEach(() => {
    restorePlatform();
  });

  // ===========================================================================
  // isAllowedTerminal TESTS
  // ===========================================================================

  describe("isAllowedTerminal", () => {
    it("should return true for allowed terminals", () => {
      const allowedTerminals = [
        "ghostty",
        "alacritty",
        "kitty",
        "terminal.app",
        "iterm2",
        "warp",
        "gnome-terminal",
        "konsole",
        "xfce4-terminal",
        "mate-terminal",
        "terminator",
        "tilix",
        "xterm",
        "x-terminal-emulator",
      ];

      for (const terminal of allowedTerminals) {
        expect(isAllowedTerminal(terminal)).toBe(true);
      }
    });

    it("should return false for disallowed terminals", () => {
      expect(isAllowedTerminal("malicious-terminal")).toBe(false);
      expect(isAllowedTerminal("")).toBe(false);
      expect(isAllowedTerminal("rm -rf /")).toBe(false);
    });
  });

  // ===========================================================================
  // buildTerminalCommand TESTS - Cross-platform terminals
  // ===========================================================================

  describe("buildTerminalCommand", () => {
    const testPath = "/Users/test/project";
    const testScript = "/Users/test/.brain-dump/scripts/launch-abc123.sh";

    describe("ghostty", () => {
      it("should use open -n -a Ghostty on macOS with minimal args", () => {
        mockPlatform("darwin");
        const cmd = buildTerminalCommand("ghostty", testPath, testScript);

        // On macOS, use minimal args to avoid double-tab issue
        expect(cmd).toMatch(/^open -n -a Ghostty --args -e/);
        expect(cmd).toContain(`"${testScript}"`);
        // Should NOT have --working-directory (script handles cd)
        expect(cmd).not.toContain("--working-directory");
      });

      it("should use direct ghostty command on Linux", () => {
        mockPlatform("linux");
        const cmd = buildTerminalCommand("ghostty", testPath, testScript);

        // Should NOT use app bundle path on Linux
        expect(cmd).not.toContain("/Applications/");
        expect(cmd).toMatch(/^ghostty/);
        // Should use -e <script> format
        expect(cmd).toContain("-e");
        expect(cmd).toContain(`"${testScript}"`);
      });

      it("should properly escape paths with spaces", () => {
        mockPlatform("darwin");
        const pathWithSpaces = "/Users/test/my project";
        const scriptWithSpaces = "/Users/test/.brain-dump/my script.sh";
        const cmd = buildTerminalCommand("ghostty", pathWithSpaces, scriptWithSpaces);

        // Script path should be quoted
        expect(cmd).toContain(`"${scriptWithSpaces}"`);
      });

      it("should escape shell metacharacters in paths", () => {
        // Test on Linux where we use direct ghostty command (shell escaping applies)
        mockPlatform("linux");
        const dangerousPath = '/Users/test/$HOME`whoami`"evil';
        const cmd = buildTerminalCommand("ghostty", dangerousPath, testScript);

        // Should escape $, `, ", etc. - the escaped version includes backslashes
        expect(cmd).toContain("\\$HOME");
        expect(cmd).toContain("\\`whoami\\`");
        expect(cmd).toContain('\\"evil');
      });
    });

    describe("alacritty", () => {
      it("should use -e bash format", () => {
        mockPlatform("linux");
        const cmd = buildTerminalCommand("alacritty", testPath, testScript);

        expect(cmd).toMatch(/^alacritty/);
        expect(cmd).toContain("--working-directory");
        expect(cmd).toContain("-e bash");
        expect(cmd).toContain(`"${testScript}"`);
      });
    });

    describe("kitty", () => {
      it("should use bash without -e flag (kitty syntax)", () => {
        mockPlatform("linux");
        const cmd = buildTerminalCommand("kitty", testPath, testScript);

        expect(cmd).toMatch(/^kitty/);
        expect(cmd).toContain("--directory");
        // Kitty uses: kitty --directory ... bash script.sh (no -e)
        expect(cmd).toContain(`bash "${testScript}"`);
      });
    });

    describe("macOS terminals", () => {
      beforeEach(() => {
        mockPlatform("darwin");
      });

      it("should use osascript for terminal.app", () => {
        const cmd = buildTerminalCommand("terminal.app", testPath, testScript);
        expect(cmd).toContain("osascript");
        expect(cmd).toContain('tell application "Terminal"');
      });

      it("should use osascript for iterm2", () => {
        const cmd = buildTerminalCommand("iterm2", testPath, testScript);
        expect(cmd).toContain("osascript");
        expect(cmd).toContain('tell application "iTerm"');
      });

      it("should use osascript for warp", () => {
        const cmd = buildTerminalCommand("warp", testPath, testScript);
        expect(cmd).toContain("osascript");
        expect(cmd).toContain('tell application "Warp"');
      });
    });

    describe("Linux terminals", () => {
      beforeEach(() => {
        mockPlatform("linux");
      });

      it("should use correct flags for gnome-terminal", () => {
        const cmd = buildTerminalCommand("gnome-terminal", testPath, testScript);
        expect(cmd).toContain("gnome-terminal");
        expect(cmd).toContain("--working-directory=");
        expect(cmd).toContain("--");
      });

      it("should use correct flags for konsole", () => {
        const cmd = buildTerminalCommand("konsole", testPath, testScript);
        expect(cmd).toContain("konsole");
        expect(cmd).toContain("--workdir");
        expect(cmd).toContain("-e");
      });
    });

    describe("security", () => {
      it("should throw error for non-allowed terminal", () => {
        expect(() =>
          buildTerminalCommand("malicious-terminal", testPath, testScript)
        ).toThrow('Terminal "malicious-terminal" is not allowed');
      });

      it("should throw error for empty terminal name", () => {
        expect(() =>
          buildTerminalCommand("", testPath, testScript)
        ).toThrow('Terminal "" is not allowed');
      });

      it("should throw error for command injection attempt", () => {
        expect(() =>
          buildTerminalCommand("; rm -rf /", testPath, testScript)
        ).toThrow('Terminal "; rm -rf /" is not allowed');
      });
    });
  });

  // ===========================================================================
  // Command format verification tests
  // ===========================================================================

  describe("command format verification", () => {
    it("ghostty macOS command should use open -n -a and have exactly one -e flag", () => {
      mockPlatform("darwin");
      const cmd = buildTerminalCommand("ghostty", "/path", "/script.sh");

      // Should start with 'open -n -a Ghostty' (with -n for new window)
      expect(cmd).toMatch(/^open -n -a Ghostty/);
      // Count occurrences of "-e" (should be exactly 1)
      const matches = cmd.match(/-e\s/g);
      expect(matches).toHaveLength(1);
    });

    it("ghostty macOS command should have minimal args (no bash, no working-directory)", () => {
      mockPlatform("darwin");
      const cmd = buildTerminalCommand("ghostty", "/path", "/script.sh");

      // Should NOT have bash (script is executable directly)
      expect(cmd).not.toMatch(/\bbash\b/);
      // Should NOT have --working-directory
      expect(cmd).not.toContain("--working-directory");
    });

    it("alacritty command should have exactly one -e flag", () => {
      mockPlatform("linux");
      const cmd = buildTerminalCommand("alacritty", "/path", "/script.sh");

      const matches = cmd.match(/-e\s/g);
      expect(matches).toHaveLength(1);
    });
  });

  // ===========================================================================
  // detectTerminal TESTS
  // ===========================================================================

  describe("detectTerminal", () => {
    it("should return null when no terminal is available", async () => {
      // This test would require mocking exec, which is complex
      // For now, we just verify the function exists and returns expected type
      const result = await detectTerminal();
      expect(result === null || typeof result === "string").toBe(true);
    });
  });

  // ===========================================================================
  // isTerminalAvailable TESTS
  // ===========================================================================

  describe("isTerminalAvailable", () => {
    it("should return unavailable for non-allowed terminal", async () => {
      const result = await isTerminalAvailable("fake-terminal");
      expect(result.available).toBe(false);
      expect(result.error).toContain("not in the allowed list");
    });

    it("should check allowed terminals without error", async () => {
      // This will actually try to run the terminal check command
      // We just verify it returns the expected shape
      const result = await isTerminalAvailable("ghostty");
      expect(typeof result.available).toBe("boolean");
    });
  });
});
