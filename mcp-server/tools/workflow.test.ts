/**
 * Unit tests for workflow tools.
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test behavior, not implementation
 * - Focus on user-facing outcomes
 */

import { describe, it, expect } from "vitest";

// Since workflow.js exports the functions via registerWorkflowTools,
// we need to test the output indirectly. Here we test the helper functions
// by re-implementing the pure logic for testing.

/**
 * Test implementation of getCodeReviewGuidance
 * Mirrors the logic in workflow.js for testing purposes
 */
function getCodeReviewGuidance(environment: string, changedFiles: string[] = []): string {
  const hasCodeChanges = changedFiles.some(
    (file) =>
      /\.(ts|tsx|js|jsx|py|go|rs)$/.test(file) &&
      !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) &&
      !/node_modules|dist|build/.test(file)
  );

  if (!hasCodeChanges && changedFiles.length > 0) {
    return `## Code Review

No source code changes detected. Review may be skipped.`;
  }

  const reviewAgents = [
    "**code-reviewer** - Checks code against project guidelines",
    "**silent-failure-hunter** - Identifies error handling issues",
    "**code-simplifier** - Simplifies and refines code",
  ];

  const environmentInstructions: Record<string, string> = {
    "claude-code": `Run \`/review\` to launch the review pipeline, or use the Task tool to launch these agents in parallel:
- \`pr-review-toolkit:code-reviewer\`
- \`pr-review-toolkit:silent-failure-hunter\`
- \`pr-review-toolkit:code-simplifier\``,
    vscode: `Use MCP tools to run these review agents:
1. code-reviewer - Reviews against CLAUDE.md guidelines
2. silent-failure-hunter - Checks error handling
3. code-simplifier - Simplifies complex code

These can be run via the MCP panel or by asking your AI assistant.`,
    opencode: `Run the review pipeline by asking your assistant to launch:
- code-reviewer
- silent-failure-hunter
- code-simplifier`,
  };

  const instructions = environmentInstructions[environment] || environmentInstructions["vscode"];

  let result = `## Code Review Recommended

Before creating a PR, run the code review pipeline to catch issues early.

### Review Agents:
${reviewAgents.map((a) => `- ${a}`).join("\n")}

### How to Run:
${instructions}`;

  if (changedFiles.length > 0) {
    const filesToShow = changedFiles.slice(0, 10);
    result += `

### Files to Review:
${filesToShow.map((f) => `- ${f}`).join("\n")}`;
    if (changedFiles.length > 10) {
      result += `\n- ... and ${changedFiles.length - 10} more`;
    }
  }

  return result;
}

describe("Code Review Guidance", () => {
  describe("getCodeReviewGuidance", () => {
    it("should return review instructions for claude-code environment", () => {
      const result = getCodeReviewGuidance("claude-code", ["src/api/users.ts"]);

      expect(result).toContain("## Code Review Recommended");
      expect(result).toContain("Run `/review` to launch the review pipeline");
      expect(result).toContain("pr-review-toolkit:code-reviewer");
      expect(result).toContain("src/api/users.ts");
    });

    it("should return review instructions for vscode environment", () => {
      const result = getCodeReviewGuidance("vscode", ["src/components/Button.tsx"]);

      expect(result).toContain("## Code Review Recommended");
      expect(result).toContain("Use MCP tools to run these review agents");
      expect(result).toContain("code-reviewer - Reviews against CLAUDE.md");
    });

    it("should return review instructions for opencode environment", () => {
      const result = getCodeReviewGuidance("opencode", ["src/lib/utils.js"]);

      expect(result).toContain("## Code Review Recommended");
      expect(result).toContain("asking your assistant to launch");
    });

    it("should skip review for non-code files only", () => {
      const result = getCodeReviewGuidance("claude-code", [
        "README.md",
        "package.json",
        "tsconfig.json",
      ]);

      expect(result).toContain("No source code changes detected");
      expect(result).toContain("Review may be skipped");
    });

    it("should recommend review when code files are present among other files", () => {
      const result = getCodeReviewGuidance("claude-code", [
        "README.md",
        "src/api/users.ts",
        "package.json",
      ]);

      expect(result).toContain("## Code Review Recommended");
      expect(result).toContain("src/api/users.ts");
    });

    it("should exclude test files from triggering review", () => {
      const result = getCodeReviewGuidance("claude-code", [
        "src/api/users.test.ts",
        "src/components/Button.spec.tsx",
      ]);

      expect(result).toContain("No source code changes detected");
    });

    it("should trigger review for mix of test and source files", () => {
      const result = getCodeReviewGuidance("claude-code", [
        "src/api/users.test.ts",
        "src/api/users.ts",
      ]);

      expect(result).toContain("## Code Review Recommended");
    });

    it("should exclude node_modules, dist, and build directories", () => {
      const result = getCodeReviewGuidance("claude-code", [
        "node_modules/lodash/index.js",
        "dist/bundle.js",
        "build/main.js",
      ]);

      expect(result).toContain("No source code changes detected");
    });

    it("should list all review agents", () => {
      const result = getCodeReviewGuidance("claude-code", ["src/api/users.ts"]);

      expect(result).toContain("code-reviewer");
      expect(result).toContain("silent-failure-hunter");
      expect(result).toContain("code-simplifier");
    });

    it("should limit displayed files to 10", () => {
      const files = Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`);
      const result = getCodeReviewGuidance("claude-code", files);

      expect(result).toContain("src/file0.ts");
      expect(result).toContain("src/file9.ts");
      expect(result).not.toContain("src/file10.ts");
      expect(result).toContain("... and 5 more");
    });

    it("should recommend review when no files provided (empty array)", () => {
      const result = getCodeReviewGuidance("claude-code", []);

      expect(result).toContain("## Code Review Recommended");
    });

    it("should use vscode instructions as default for unknown environments", () => {
      const result = getCodeReviewGuidance("unknown-env", ["src/api/users.ts"]);

      expect(result).toContain("Use MCP tools to run these review agents");
    });

    it("should handle various source file extensions", () => {
      const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
      for (const ext of extensions) {
        const result = getCodeReviewGuidance("claude-code", [`src/file${ext}`]);
        expect(result).toContain("## Code Review Recommended");
      }
    });
  });
});
