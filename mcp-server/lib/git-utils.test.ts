import { describe, it, expect } from "vitest";
import {
  runGitCommand,
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

  describe("runGitCommand", () => {
    it("should return success structure for valid commands", () => {
      // This test might fail in CI if git is not available
      // but it shows the expected interface
      const result = runGitCommand("git --version", "/tmp");
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.output).toBe("string");
      if (result.success) {
        expect(result.output).toContain("git version");
      } else {
        expect(result.error).toBeDefined();
      }
    });

    it("should return error structure for invalid commands", () => {
      const result = runGitCommand("git-invalid-command", "/tmp");
      expect(result.success).toBe(false);
      expect(result.output).toBe("");
      expect(result.error).toBeDefined();
    });
  });
});
