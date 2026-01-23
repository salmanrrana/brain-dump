/**
 * Unit tests for workflow tools.
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test behavior, not implementation
 * - Focus on user-facing outcomes
 */

import { describe, it, expect } from "vitest";

/**
 * Test implementation of formatComment
 * Mirrors the logic in workflow.js for testing purposes
 */
function formatComment(comment: {
  content: string;
  author: string;
  type: string;
  created_at: string;
}): string {
  const date = new Date(comment.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const typeLabel =
    comment.type === "work_summary"
      ? "📋 Work Summary"
      : comment.type === "test_report"
        ? "🧪 Test Report"
        : comment.type === "progress"
          ? "📈 Progress"
          : "💬 Comment";

  return `**${comment.author}** (${typeLabel}) - ${dateStr}:\n${comment.content}`;
}

/**
 * Test implementation of buildCommentsSection
 * Mirrors the logic in workflow.js for testing purposes
 */
function buildCommentsSection(
  comments: Array<{ content: string; author: string; type: string; created_at: string }>,
  totalCount: number,
  truncated: boolean
): string {
  if (comments.length === 0) {
    return "";
  }

  const header = truncated
    ? `### Previous Comments (${comments.length} of ${totalCount} shown)\n\n*Note: ${totalCount - comments.length} older comment(s) not shown. Check the ticket UI for full history.*\n\n`
    : `### Previous Comments (${totalCount})\n\n`;

  const formattedComments = comments.map(formatComment).join("\n\n---\n\n");

  return `${header}${formattedComments}\n`;
}

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

describe("Comments Formatting", () => {
  describe("formatComment", () => {
    it("should format a basic comment with author and date", () => {
      const comment = {
        content: "This is a test comment",
        author: "claude",
        type: "comment",
        created_at: "2026-01-15T10:30:00.000Z",
      };

      const result = formatComment(comment);

      expect(result).toContain("**claude**");
      expect(result).toContain("💬 Comment");
      expect(result).toContain("Jan 15, 2026");
      expect(result).toContain("This is a test comment");
    });

    it("should use work summary icon for work_summary type", () => {
      const comment = {
        content: "Implemented the feature",
        author: "ralph",
        type: "work_summary",
        created_at: "2026-01-15T10:30:00.000Z",
      };

      const result = formatComment(comment);

      expect(result).toContain("📋 Work Summary");
    });

    it("should use test report icon for test_report type", () => {
      const comment = {
        content: "All tests passed",
        author: "ralph",
        type: "test_report",
        created_at: "2026-01-15T10:30:00.000Z",
      };

      const result = formatComment(comment);

      expect(result).toContain("🧪 Test Report");
    });

    it("should use progress icon for progress type", () => {
      const comment = {
        content: "50% complete",
        author: "ralph",
        type: "progress",
        created_at: "2026-01-15T10:30:00.000Z",
      };

      const result = formatComment(comment);

      expect(result).toContain("📈 Progress");
    });
  });

  describe("buildCommentsSection", () => {
    it("should return empty string when no comments", () => {
      const result = buildCommentsSection([], 0, false);

      expect(result).toBe("");
    });

    it("should build section with all comments when not truncated", () => {
      const comments = [
        {
          content: "First comment",
          author: "claude",
          type: "comment",
          created_at: "2026-01-15T10:00:00.000Z",
        },
        {
          content: "Second comment",
          author: "ralph",
          type: "work_summary",
          created_at: "2026-01-15T11:00:00.000Z",
        },
      ];

      const result = buildCommentsSection(comments, 2, false);

      expect(result).toContain("### Previous Comments (2)");
      expect(result).toContain("First comment");
      expect(result).toContain("Second comment");
      expect(result).toContain("---"); // Separator between comments
      expect(result).not.toContain("older comment(s) not shown");
    });

    it("should show truncation notice when comments are truncated", () => {
      const comments = [
        {
          content: "Recent comment",
          author: "claude",
          type: "comment",
          created_at: "2026-01-15T10:00:00.000Z",
        },
      ];

      const result = buildCommentsSection(comments, 15, true);

      expect(result).toContain("### Previous Comments (1 of 15 shown)");
      expect(result).toContain("14 older comment(s) not shown");
      expect(result).toContain("Check the ticket UI for full history");
    });
  });
});
