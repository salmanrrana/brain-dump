import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join, dirname } from "path";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";

import {
  validateProjectPath,
  validateWorktreePath,
  ensureNotSymlink,
  validatePathComponent,
  SecurityError as SecurityErrorClass,
} from "./path-validation.js";

// Create a unique test directory for each test run
const TEST_DIR = join(tmpdir(), `path-validation-test-${Date.now()}`);

describe("path-validation", () => {
  beforeEach(() => {
    // Create test directory structure
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "project"), { recursive: true });
    mkdirSync(join(TEST_DIR, "project", ".claude"), { recursive: true });
    mkdirSync(join(TEST_DIR, "project", ".worktrees"), { recursive: true });
    mkdirSync(join(TEST_DIR, "sibling-project"), { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Log cleanup errors for debugging but don't fail the test.
      // The force: true flag handles most legitimate cases (e.g., already deleted),
      // but we log in case something unexpected happens.
      console.warn(
        `[path-validation.test] Cleanup warning for ${TEST_DIR}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  describe("validateProjectPath", () => {
    describe("valid paths", () => {
      it("accepts absolute path that exists", () => {
        const projectPath = join(TEST_DIR, "project");
        const result = validateProjectPath(projectPath);
        // On macOS, /var is a symlink to /private/var, so realpathSync
        // may return a different but equivalent path. We just check it's valid.
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
        // The result should end with our project path (after any prefix resolution)
        expect(result.endsWith("project")).toBe(true);
      });

      it("returns resolved real path", () => {
        const projectPath = join(TEST_DIR, "project");
        const result = validateProjectPath(projectPath);
        // Result should be a valid path
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe("relative path attacks", () => {
      it("rejects relative path starting with ./", () => {
        expect(() => validateProjectPath("./project")).toThrow(SecurityErrorClass);
        expect(() => validateProjectPath("./project")).toThrow(
          "Security: Project path must be absolute"
        );
      });

      it("rejects relative path without prefix", () => {
        expect(() => validateProjectPath("project")).toThrow(SecurityErrorClass);
      });

      it("rejects path starting with ../", () => {
        expect(() => validateProjectPath("../project")).toThrow(SecurityErrorClass);
      });
    });

    describe("path traversal attacks", () => {
      it("rejects path containing .. in middle", () => {
        expect(() => validateProjectPath("/Users/dev/../../../etc/passwd")).toThrow(
          SecurityErrorClass
        );
        expect(() => validateProjectPath("/Users/dev/../../../etc/passwd")).toThrow(
          "Security: Path traversal detected"
        );
      });

      it("rejects path with traversal even if it resolves to valid location", () => {
        // Even if the path would resolve to a valid location, we reject
        // any input containing ".." as it indicates suspicious input.
        // Note: We construct the path manually because path.join() normalizes away ".."
        const traversalPath = `${TEST_DIR}/project/../project`;
        expect(() => validateProjectPath(traversalPath)).toThrow(SecurityErrorClass);
        expect(() => validateProjectPath(traversalPath)).toThrow(
          "Security: Path traversal detected"
        );
      });

      it("rejects path with multiple .. sequences", () => {
        expect(() => validateProjectPath("/a/b/c/../../d/../e/../../etc")).toThrow(
          SecurityErrorClass
        );
      });
    });

    describe("invalid input handling", () => {
      it("rejects null input", () => {
        expect(() => validateProjectPath(null as unknown as string)).toThrow(SecurityErrorClass);
        expect(() => validateProjectPath(null as unknown as string)).toThrow(
          "Security: Project path must be a non-empty string"
        );
      });

      it("rejects undefined input", () => {
        expect(() => validateProjectPath(undefined as unknown as string)).toThrow(
          SecurityErrorClass
        );
      });

      it("rejects empty string", () => {
        expect(() => validateProjectPath("")).toThrow(SecurityErrorClass);
      });

      it("rejects non-string input", () => {
        expect(() => validateProjectPath(123 as unknown as string)).toThrow(SecurityErrorClass);
      });
    });

    describe("non-existent path handling", () => {
      it("rejects path that does not exist", () => {
        expect(() => validateProjectPath("/nonexistent/path/to/project")).toThrow(
          SecurityErrorClass
        );
        expect(() => validateProjectPath("/nonexistent/path/to/project")).toThrow(
          "Security: Project path does not exist"
        );
      });
    });
  });

  describe("validateWorktreePath", () => {
    const PROJECT_PATH = join(TEST_DIR, "project");

    describe("valid locations", () => {
      it("accepts sibling directory (same parent)", () => {
        const worktreePath = join(TEST_DIR, "project-worktree");
        // Should not throw
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).not.toThrow();
      });

      it("accepts path within project directory", () => {
        const worktreePath = join(TEST_DIR, "project", ".worktrees", "epic-1");
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).not.toThrow();
      });

      it("accepts nested subfolder within project", () => {
        const worktreePath = join(TEST_DIR, "project", ".worktrees", "nested", "epic-1");
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).not.toThrow();
      });
    });

    describe("invalid locations", () => {
      it("rejects path in completely different directory", () => {
        const worktreePath = "/tmp/malicious-worktree";
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).toThrow(SecurityErrorClass);
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).toThrow(
          "Security: Worktree must be sibling or within project directory"
        );
      });

      it("rejects path in parent directory", () => {
        const worktreePath = dirname(TEST_DIR);
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).toThrow(SecurityErrorClass);
      });

      it("rejects path in unrelated subdirectory", () => {
        const worktreePath = "/var/log/worktree";
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).toThrow(SecurityErrorClass);
      });
    });

    describe("relative path attacks", () => {
      it("rejects relative worktree path", () => {
        expect(() => validateWorktreePath("./worktree", PROJECT_PATH)).toThrow(SecurityErrorClass);
        expect(() => validateWorktreePath("./worktree", PROJECT_PATH)).toThrow(
          "Security: Worktree path must be absolute"
        );
      });

      it("rejects worktree path starting with ../", () => {
        expect(() => validateWorktreePath("../worktree", PROJECT_PATH)).toThrow(SecurityErrorClass);
      });
    });

    describe("path traversal in worktree path", () => {
      it("rejects traversal in worktree path", () => {
        // Construct path manually to preserve ".." (path.join normalizes it away)
        const worktreePath = `${TEST_DIR}/project/../evil`;
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).toThrow(SecurityErrorClass);
        expect(() => validateWorktreePath(worktreePath, PROJECT_PATH)).toThrow(
          "Security: Path traversal detected in worktree path"
        );
      });
    });

    describe("invalid input handling", () => {
      it("rejects null worktree path", () => {
        expect(() => validateWorktreePath(null as unknown as string, PROJECT_PATH)).toThrow(
          SecurityErrorClass
        );
      });

      it("rejects null project path", () => {
        expect(() => validateWorktreePath("/valid/path", null as unknown as string)).toThrow(
          SecurityErrorClass
        );
      });

      it("rejects empty worktree path", () => {
        expect(() => validateWorktreePath("", PROJECT_PATH)).toThrow(SecurityErrorClass);
      });

      it("rejects empty project path", () => {
        expect(() => validateWorktreePath("/valid/path", "")).toThrow(SecurityErrorClass);
      });
    });
  });

  describe("ensureNotSymlink", () => {
    describe("safe paths", () => {
      it("allows regular directory", () => {
        const dir = join(TEST_DIR, "project");
        expect(() => ensureNotSymlink(dir)).not.toThrow();
      });

      it("allows regular file", () => {
        const file = join(TEST_DIR, "project", "test.txt");
        writeFileSync(file, "test content");
        expect(() => ensureNotSymlink(file)).not.toThrow();
      });

      it("allows path that does not exist (ENOENT)", () => {
        const nonexistent = join(TEST_DIR, "does-not-exist");
        expect(() => ensureNotSymlink(nonexistent)).not.toThrow();
      });
    });

    describe("symlink attacks", () => {
      it("rejects symlink to directory", () => {
        const realDir = join(TEST_DIR, "project");
        const symlink = join(TEST_DIR, "symlink-dir");
        symlinkSync(realDir, symlink);

        expect(() => ensureNotSymlink(symlink)).toThrow(SecurityErrorClass);
        expect(() => ensureNotSymlink(symlink)).toThrow(
          "Security: Path is a symlink - refusing operation"
        );
      });

      it("rejects symlink to file", () => {
        const realFile = join(TEST_DIR, "project", "test.txt");
        writeFileSync(realFile, "test content");
        const symlink = join(TEST_DIR, "symlink-file");
        symlinkSync(realFile, symlink);

        expect(() => ensureNotSymlink(symlink)).toThrow(SecurityErrorClass);
      });

      it("rejects symlink even if target is safe location", () => {
        // Even if the symlink points to a safe directory,
        // we reject it because the symlink itself could be
        // replaced with a malicious one later
        const safeDir = join(TEST_DIR, "project", ".claude");
        const symlink = join(TEST_DIR, "safe-symlink");
        symlinkSync(safeDir, symlink);

        expect(() => ensureNotSymlink(symlink)).toThrow(SecurityErrorClass);
      });

      it("rejects broken symlink", () => {
        const nonexistent = join(TEST_DIR, "nonexistent-target");
        const symlink = join(TEST_DIR, "broken-symlink");
        symlinkSync(nonexistent, symlink);

        expect(() => ensureNotSymlink(symlink)).toThrow(SecurityErrorClass);
      });
    });

    describe("invalid input handling", () => {
      it("rejects null path", () => {
        expect(() => ensureNotSymlink(null as unknown as string)).toThrow(SecurityErrorClass);
        expect(() => ensureNotSymlink(null as unknown as string)).toThrow(
          "Security: Target path must be a non-empty string"
        );
      });

      it("rejects empty string", () => {
        expect(() => ensureNotSymlink("")).toThrow(SecurityErrorClass);
      });

      it("rejects undefined", () => {
        expect(() => ensureNotSymlink(undefined as unknown as string)).toThrow(SecurityErrorClass);
      });
    });
  });

  describe("validatePathComponent", () => {
    describe("valid names", () => {
      it("accepts alphanumeric name", () => {
        expect(validatePathComponent("myproject123")).toBe(true);
      });

      it("accepts name with hyphens", () => {
        expect(validatePathComponent("my-project")).toBe(true);
      });

      it("accepts name with underscores", () => {
        expect(validatePathComponent("my_project")).toBe(true);
      });

      it("accepts name with dots", () => {
        expect(validatePathComponent("my.project")).toBe(true);
      });

      it("accepts name with spaces", () => {
        expect(validatePathComponent("my project")).toBe(true);
      });
    });

    describe("path separator attacks", () => {
      it("rejects forward slash", () => {
        expect(() => validatePathComponent("my/project")).toThrow(SecurityErrorClass);
        expect(() => validatePathComponent("my/project")).toThrow(
          "Security: Path component cannot contain path separators"
        );
      });

      it("rejects backslash", () => {
        expect(() => validatePathComponent("my\\project")).toThrow(SecurityErrorClass);
      });

      it("rejects mixed separators", () => {
        expect(() => validatePathComponent("my/proj\\ect")).toThrow(SecurityErrorClass);
      });
    });

    describe("null byte injection", () => {
      it("rejects null byte in middle", () => {
        expect(() => validatePathComponent("my\0project")).toThrow(SecurityErrorClass);
        expect(() => validatePathComponent("my\0project")).toThrow(
          "Security: Path component cannot contain null bytes"
        );
      });

      it("rejects null byte at end", () => {
        expect(() => validatePathComponent("myproject\0")).toThrow(SecurityErrorClass);
      });
    });

    describe("control character attacks", () => {
      it("rejects tab character", () => {
        expect(() => validatePathComponent("my\tproject")).toThrow(SecurityErrorClass);
        expect(() => validatePathComponent("my\tproject")).toThrow(
          "Security: Path component cannot contain control characters"
        );
      });

      it("rejects newline", () => {
        expect(() => validatePathComponent("my\nproject")).toThrow(SecurityErrorClass);
      });

      it("rejects carriage return", () => {
        expect(() => validatePathComponent("my\rproject")).toThrow(SecurityErrorClass);
      });

      it("rejects bell character", () => {
        expect(() => validatePathComponent("my\x07project")).toThrow(SecurityErrorClass);
      });
    });

    describe("Windows reserved names", () => {
      it("rejects CON", () => {
        expect(() => validatePathComponent("CON")).toThrow(SecurityErrorClass);
        expect(() => validatePathComponent("CON")).toThrow(
          "Security: Path component uses reserved Windows name"
        );
      });

      it("rejects PRN", () => {
        expect(() => validatePathComponent("PRN")).toThrow(SecurityErrorClass);
      });

      it("rejects NUL", () => {
        expect(() => validatePathComponent("NUL")).toThrow(SecurityErrorClass);
      });

      it("rejects COM1", () => {
        expect(() => validatePathComponent("COM1")).toThrow(SecurityErrorClass);
      });

      it("rejects LPT1", () => {
        expect(() => validatePathComponent("LPT1")).toThrow(SecurityErrorClass);
      });

      it("rejects reserved names case-insensitively", () => {
        expect(() => validatePathComponent("con")).toThrow(SecurityErrorClass);
        expect(() => validatePathComponent("Con")).toThrow(SecurityErrorClass);
        expect(() => validatePathComponent("CON")).toThrow(SecurityErrorClass);
      });

      it("allows reserved names as part of longer name", () => {
        // "CONNECT" should be allowed (contains "CON" but isn't reserved)
        expect(validatePathComponent("CONNECT")).toBe(true);
        expect(validatePathComponent("PRNT")).toBe(true);
      });
    });

    describe("invalid input handling", () => {
      it("rejects null", () => {
        expect(() => validatePathComponent(null as unknown as string)).toThrow(SecurityErrorClass);
      });

      it("rejects empty string", () => {
        expect(() => validatePathComponent("")).toThrow(SecurityErrorClass);
      });

      it("rejects undefined", () => {
        expect(() => validatePathComponent(undefined as unknown as string)).toThrow(
          SecurityErrorClass
        );
      });
    });
  });

  describe("SecurityErrorClass", () => {
    it("has correct name", () => {
      const error = new SecurityErrorClass("test message", "test_type");
      expect(error.name).toBe("SecurityError");
    });

    it("has correct message", () => {
      const error = new SecurityErrorClass("test message", "test_type");
      expect(error.message).toBe("test message");
    });

    it("has correct type", () => {
      const error = new SecurityErrorClass("test message", "test_type");
      expect(error.type).toBe("test_type");
    });

    it("is instance of Error", () => {
      const error = new SecurityErrorClass("test message", "test_type");
      expect(error).toBeInstanceOf(Error);
    });

    it("is instance of SecurityErrorClass", () => {
      const error = new SecurityErrorClass("test message", "test_type");
      expect(error).toBeInstanceOf(SecurityErrorClass);
    });
  });
});
