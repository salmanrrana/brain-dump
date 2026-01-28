import { describe, it, expect } from "vitest";

import {
  runGitCommandSafe,
  slugify,
  shortId,
  generateBranchName,
  generateEpicBranchName,
} from "./git-utils.js";

describe("git-utils module", () => {
  describe("slugify", () => {
    it("should convert text to lowercase and replace spaces with hyphens", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("should replace multiple non-alphanumeric characters with single hyphen", () => {
      expect(slugify("Test   Case!!!")).toBe("test-case");
    });

    it("should remove leading and trailing hyphens", () => {
      expect(slugify("---Test---")).toBe("test");
    });

    it("should limit output to 50 characters", () => {
      const longText = "A".repeat(60);
      const result = slugify(longText);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should handle empty string", () => {
      expect(slugify("")).toBe("");
    });

    it("should handle special characters", () => {
      expect(slugify("Test@#$%^&*()Case")).toBe("test-case");
    });
  });

  describe("shortId", () => {
    it("should return first 8 characters of UUID", () => {
      const uuid = "12345678-1234-1234-1234-123456789012";
      expect(shortId(uuid)).toBe("12345678");
    });

    it("should handle shorter UUIDs", () => {
      const shortUuid = "123456";
      expect(shortId(shortUuid)).toBe("123456");
    });

    it("should handle empty string", () => {
      expect(shortId("")).toBe("");
    });
  });

  describe("generateBranchName", () => {
    it("should generate branch name in correct format", () => {
      const ticketId = "12345678-1234-1234-1234-123456789012";
      const ticketTitle = "Add new feature";
      const result = generateBranchName(ticketId, ticketTitle);
      expect(result).toBe("feature/12345678-add-new-feature");
    });

    it("should slugify ticket title", () => {
      const ticketId = "12345678-1234-1234-1234-123456789012";
      const ticketTitle = "Add New Feature!!!";
      const result = generateBranchName(ticketId, ticketTitle);
      expect(result).toBe("feature/12345678-add-new-feature");
    });

    it("should handle long titles", () => {
      const ticketId = "12345678-1234-1234-1234-123456789012";
      const longTitle = "A".repeat(60);
      const result = generateBranchName(ticketId, longTitle);
      expect(result).toMatch(/^feature\/12345678-/);
      expect(result.length).toBeLessThan(100); // Reasonable limit
    });
  });

  describe("generateEpicBranchName", () => {
    it("should generate epic branch name in correct format", () => {
      const epicId = "87654321-4321-4321-4321-210987654321";
      const epicTitle = "Epic Feature Implementation";
      const result = generateEpicBranchName(epicId, epicTitle);
      expect(result).toBe("feature/epic-87654321-epic-feature-implementation");
    });

    it("should slugify epic title", () => {
      const epicId = "87654321-4321-4321-4321-210987654321";
      const epicTitle = "Epic Feature!!! Implementation";
      const result = generateEpicBranchName(epicId, epicTitle);
      expect(result).toBe("feature/epic-87654321-epic-feature-implementation");
    });

    it("should handle long epic titles", () => {
      const epicId = "87654321-4321-4321-4321-210987654321";
      const longTitle = "A".repeat(60);
      const result = generateEpicBranchName(epicId, longTitle);
      expect(result).toMatch(/^feature\/epic-87654321-/);
      expect(result.length).toBeLessThan(100); // Reasonable limit
    });

    it("should differentiate from regular branch names", () => {
      const ticketId = "12345678-1234-1234-1234-123456789012";
      const epicId = "87654321-4321-4321-4321-210987654321";
      const title = "Test Feature";

      const ticketBranch = generateBranchName(ticketId, title);
      const epicBranch = generateEpicBranchName(epicId, title);

      expect(ticketBranch).toBe("feature/12345678-test-feature");
      expect(epicBranch).toBe("feature/epic-87654321-test-feature");
      expect(epicBranch).toContain("epic-");
      expect(ticketBranch).not.toContain("epic-");
    });

    it("should handle empty epic title", () => {
      const epicId = "87654321-4321-4321-4321-210987654321";
      const result = generateEpicBranchName(epicId, "");
      expect(result).toBe("feature/epic-87654321-");
    });

    it("should handle empty epic ID", () => {
      const epicTitle = "Test Epic";
      const result = generateEpicBranchName("", epicTitle);
      expect(result).toBe("feature/epic--test-epic");
    });
  });

  describe("runGitCommandSafe", () => {
    describe("basic functionality", () => {
      it("should return success for valid git commands", () => {
        const result = runGitCommandSafe(["--version"], "/tmp");
        expect(result.success).toBe(true);
        expect(result.output).toContain("git version");
        expect(result.error).toBeUndefined();
      });

      it("should return error for invalid git subcommand", () => {
        const result = runGitCommandSafe(["nonexistent-command"], "/tmp");
        expect(result.success).toBe(false);
        expect(result.output).toBe("");
        expect(result.error).toBeDefined();
      });

      it("should handle empty args array", () => {
        // git with no args shows help/usage
        const result = runGitCommandSafe([], "/tmp");
        // Git without args usually fails or shows usage
        expect(typeof result.success).toBe("boolean");
      });
    });

    describe("input validation", () => {
      it("should return error for non-array args", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = runGitCommandSafe("--version" as any, "/tmp");
        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid arguments: expected array of git command arguments");
      });

      it("should return error for empty cwd", () => {
        const result = runGitCommandSafe(["--version"], "");
        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid working directory: cwd must be a non-empty string");
      });

      it("should return error for non-string cwd", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = runGitCommandSafe(["--version"], null as any);
        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid working directory: cwd must be a non-empty string");
      });

      it("should return error for undefined cwd", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = runGitCommandSafe(["--version"], undefined as any);
        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid working directory: cwd must be a non-empty string");
      });
    });

    describe("security (command injection prevention)", () => {
      it("should not execute shell metacharacters in arguments", () => {
        // This command should fail because git doesn't understand the argument
        // NOT because rm was executed
        const maliciousArg = "; rm -rf /";
        const result = runGitCommandSafe(["branch", "-m", maliciousArg], "/tmp");

        // The command should fail (not in a git repo, or invalid branch)
        // but importantly, it should NOT execute the rm command
        expect(result.success).toBe(false);
        // Error should be from git, not a shell error
        expect(result.error).toBeDefined();
      });

      it("should safely handle paths with spaces", () => {
        // This tests that paths with spaces are handled correctly
        const pathWithSpaces = "/tmp/test path with spaces";
        const result = runGitCommandSafe(["status"], pathWithSpaces);

        // Should fail because directory doesn't exist, not because of parsing issues
        expect(result.success).toBe(false);
        // Error should mention the path doesn't exist or isn't a repo
        expect(result.error).toBeDefined();
      });

      it("should safely handle paths with special characters", () => {
        const pathWithSpecialChars = "/tmp/test$path`with$(echo)special";
        const result = runGitCommandSafe(["status"], pathWithSpecialChars);

        // Should fail because directory doesn't exist, not because shell expanded anything
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it("should safely handle arguments with backticks", () => {
        const maliciousArg = "`whoami`";
        const result = runGitCommandSafe(["branch", "-m", maliciousArg], "/tmp");

        // Should fail safely without executing the backtick command
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // The whoami output should NOT appear anywhere
        expect(result.error).not.toContain(process.env["USER"] || "");
      });

      it("should safely handle arguments with $() command substitution", () => {
        const maliciousArg = "$(echo hacked)";
        const result = runGitCommandSafe(["branch", "-m", maliciousArg], "/tmp");

        // Should fail safely without executing the command substitution
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // "hacked" should NOT appear in output (would if shell expanded it)
        expect(result.output).not.toContain("hacked");
      });

      it("should safely handle arguments with pipes", () => {
        const maliciousArg = "| cat /etc/passwd";
        const result = runGitCommandSafe(["branch", "-m", maliciousArg], "/tmp");

        // Should fail safely without executing the pipe
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // Should NOT contain /etc/passwd content
        expect(result.output).not.toContain("root:");
      });
    });

    describe("error handling", () => {
      it("should return informative error for non-existent directory", () => {
        const result = runGitCommandSafe(["status"], "/this/path/does/not/exist");
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.length).toBeGreaterThan(0);
      });

      it("should return informative error for non-git directory", () => {
        const result = runGitCommandSafe(["status"], "/tmp");
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // Git error for non-repo usually mentions "not a git repository"
        expect(
          result.error!.toLowerCase().includes("not a git repository") ||
            result.error!.toLowerCase().includes("fatal")
        ).toBe(true);
      });
    });

    describe("options", () => {
      it("should accept timeout option without error", () => {
        // Just verify the function accepts the option
        const result = runGitCommandSafe(["--version"], "/tmp", { timeout: 5000 });
        expect(result.success).toBe(true);
        expect(result.output).toContain("git version");
      });

      it("should accept maxBuffer option without error", () => {
        // Just verify the function accepts the option
        const result = runGitCommandSafe(["--version"], "/tmp", {
          maxBuffer: 1024 * 1024,
        });
        expect(result.success).toBe(true);
        expect(result.output).toContain("git version");
      });

      it("should accept both options together", () => {
        const result = runGitCommandSafe(["--version"], "/tmp", {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        });
        expect(result.success).toBe(true);
        expect(result.output).toContain("git version");
      });
    });
  });
});
