import { describe, it, expect } from "vitest";
import {
  slugify,
  shortId,
  generateBranchName,
  generateEpicBranchName,
  findBaseBranch,
} from "../git-utils.ts";
import type { GitOperations, GitCommandResult } from "../types.ts";

// ============================================
// Pure function tests
// ============================================

describe("slugify", () => {
  it("converts spaces and special chars to hyphens", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("strips leading/trailing hyphens", () => {
    expect(slugify("--test--")).toBe("test");
  });

  it("truncates to 50 characters", () => {
    const long = "a".repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("shortId", () => {
  it("returns first 8 characters", () => {
    expect(shortId("abcdefgh-1234-5678")).toBe("abcdefgh");
  });

  it("handles short input", () => {
    expect(shortId("abc")).toBe("abc");
  });
});

describe("generateBranchName", () => {
  it("produces feature/{shortId}-{slug}", () => {
    const result = generateBranchName("12345678-abcd-efgh", "Fix login bug");
    expect(result).toBe("feature/12345678-fix-login-bug");
  });
});

describe("generateEpicBranchName", () => {
  it("produces feature/epic-{shortId}-{slug}", () => {
    const result = generateEpicBranchName("abcdefab-1234-5678", "Auth Overhaul");
    expect(result).toBe("feature/epic-abcdefab-auth-overhaul");
  });
});

// ============================================
// findBaseBranch tests (with mock GitOperations)
// ============================================

function createMockGit(branches: string[]): GitOperations {
  return {
    run(_cmd: string, _cwd: string): GitCommandResult {
      return { success: true, output: "" };
    },
    branchExists(branch: string, _cwd: string): boolean {
      return branches.includes(branch);
    },
    checkout(_branch: string, _cwd: string): GitCommandResult {
      return { success: true, output: "" };
    },
    createBranch(_branch: string, _cwd: string): GitCommandResult {
      return { success: true, output: "" };
    },
  };
}

describe("findBaseBranch", () => {
  it("returns 'main' when main exists", () => {
    const git = createMockGit(["main", "master"]);
    expect(findBaseBranch(git, "/tmp")).toBe("main");
  });

  it("returns 'master' when only master exists", () => {
    const git = createMockGit(["master"]);
    expect(findBaseBranch(git, "/tmp")).toBe("master");
  });

  it("defaults to 'main' when neither exists", () => {
    const git = createMockGit([]);
    expect(findBaseBranch(git, "/tmp")).toBe("main");
  });
});
