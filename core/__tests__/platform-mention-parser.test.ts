import { describe, it, expect } from "vitest";
import { parsePlatformMentions, autoTagFromMentions } from "../platform-mention-parser.ts";

describe("parsePlatformMentions", () => {
  it("returns empty array for empty input", () => {
    expect(parsePlatformMentions("")).toEqual([]);
    expect(parsePlatformMentions(null as unknown as string)).toEqual([]);
  });

  it("returns empty array when no platforms are mentioned", () => {
    expect(parsePlatformMentions("Just a normal description")).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // GitHub
  // -------------------------------------------------------------------------

  it("detects GitHub issue URL", () => {
    const result = parsePlatformMentions("See https://github.com/facebook/react/issues/789");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "github",
        type: "issue",
        tag: "github:facebook/react#789",
      }),
    ]);
  });

  it("detects GitHub PR URL", () => {
    const result = parsePlatformMentions("Fix in https://github.com/org/repo/pull/42");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "github",
        type: "pr",
        tag: "github:org/repo#42",
      }),
    ]);
  });

  it("detects same-repo GitHub issue reference (#123)", () => {
    const result = parsePlatformMentions("Related to #42");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "github",
        type: "issue",
        tag: "github:#42",
      }),
    ]);
  });

  it("detects cross-repo GitHub reference (org/repo#123)", () => {
    const result = parsePlatformMentions("See facebook/react#789");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "github",
        type: "issue",
        tag: "github:facebook/react#789",
      }),
    ]);
  });

  // -------------------------------------------------------------------------
  // JIRA / Linear / Generic source
  // -------------------------------------------------------------------------

  it("detects JIRA issue from URL", () => {
    const result = parsePlatformMentions("Check https://company.atlassian.net/browse/PROJ-123");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "jira",
        type: "issue",
        tag: "jira:PROJ-123",
      }),
    ]);
  });

  it("detects Linear issue from URL", () => {
    const result = parsePlatformMentions("See https://linear.app/myteam/issue/ENG-42");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "linear",
        type: "issue",
        tag: "linear:ENG-42",
      }),
    ]);
  });

  it("tags ambiguous project key as source: when no URL context", () => {
    const result = parsePlatformMentions("Implement PROJ-123 feature");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "source",
        type: "issue",
        tag: "source:PROJ-123",
      }),
    ]);
  });

  it("does not duplicate when JIRA URL and plain text mention same key", () => {
    const result = parsePlatformMentions(
      "Fix https://company.atlassian.net/browse/PROJ-123 (PROJ-123 is critical)"
    );
    // Should get jira:PROJ-123 from URL, not also source:PROJ-123 from text
    const tags = result.map((m) => m.tag);
    expect(tags).toContain("jira:PROJ-123");
    expect(tags).not.toContain("source:PROJ-123");
  });

  // -------------------------------------------------------------------------
  // GitLab
  // -------------------------------------------------------------------------

  it("detects GitLab merge request (group/project!123)", () => {
    const result = parsePlatformMentions("Review mygroup/myproject!456");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "gitlab",
        type: "mr",
        tag: "gitlab-mr:mygroup/myproject!456",
      }),
    ]);
  });

  // -------------------------------------------------------------------------
  // Confluence
  // -------------------------------------------------------------------------

  it("detects Confluence page URL", () => {
    const result = parsePlatformMentions(
      "Docs at https://company.atlassian.net/wiki/spaces/ENG/pages/123456"
    );
    expect(result).toEqual([
      expect.objectContaining({
        platform: "confluence",
        type: "page",
        tag: "confluence:ENG",
      }),
    ]);
  });

  // -------------------------------------------------------------------------
  // Notion
  // -------------------------------------------------------------------------

  it("detects Notion page URL", () => {
    const result = parsePlatformMentions(
      "See https://notion.so/myworkspace/My-Page-1429989fabcd1234abcd1234abcd1234"
    );
    expect(result).toEqual([
      expect.objectContaining({
        platform: "notion",
        type: "page",
        tag: "notion:page",
      }),
    ]);
  });

  // -------------------------------------------------------------------------
  // Asana
  // -------------------------------------------------------------------------

  it("detects Asana task URL", () => {
    const result = parsePlatformMentions(
      "Track at https://app.asana.com/0/1234567890/9876543210123"
    );
    expect(result).toEqual([
      expect.objectContaining({
        platform: "asana",
        type: "task",
        tag: "asana:task",
      }),
    ]);
  });

  // -------------------------------------------------------------------------
  // Trello
  // -------------------------------------------------------------------------

  it("detects Trello card URL", () => {
    const result = parsePlatformMentions("Card at https://trello.com/c/wIia0909");
    expect(result).toEqual([
      expect.objectContaining({
        platform: "trello",
        type: "card",
        tag: "trello:wIia0909",
      }),
    ]);
  });

  // -------------------------------------------------------------------------
  // Mixed content
  // -------------------------------------------------------------------------

  it("detects multiple platforms in mixed content", () => {
    const text = `
      Related to #42 and PROJ-123.
      See https://github.com/org/repo/pull/99.
      Docs: https://company.atlassian.net/wiki/spaces/DEV/pages/555
    `;
    const tags = parsePlatformMentions(text).map((m) => m.tag);
    expect(tags).toContain("github:org/repo#99");
    expect(tags).toContain("confluence:DEV");
    expect(tags).toContain("github:#42");
    expect(tags).toContain("source:PROJ-123");
  });

  // -------------------------------------------------------------------------
  // Duplicate prevention
  // -------------------------------------------------------------------------

  it("deduplicates when same reference appears multiple times", () => {
    const result = parsePlatformMentions("Fix #42, see #42, also #42");
    expect(result).toHaveLength(1);
    expect(result[0]!.tag).toBe("github:#42");
  });
});

describe("autoTagFromMentions", () => {
  it("preserves existing tags and adds auto-detected ones", () => {
    const result = autoTagFromMentions("Fix PROJ-123 bug", null, ["bug", "frontend"]);
    expect(result).toEqual(["bug", "frontend", "source:PROJ-123"]);
  });

  it("returns existing tags unchanged when no mentions found", () => {
    const result = autoTagFromMentions("Simple ticket", "No platform references", ["bug"]);
    expect(result).toEqual(["bug"]);
  });

  it("prevents duplicate auto-tags (case-insensitive)", () => {
    const result = autoTagFromMentions("Fix PROJ-123", null, ["source:PROJ-123"]);
    expect(result).toEqual(["source:PROJ-123"]);
  });

  it("combines title and description for detection", () => {
    const result = autoTagFromMentions(
      "Fix performance issue",
      "See https://github.com/org/repo/issues/55 for details",
      []
    );
    expect(result).toEqual(["github:org/repo#55"]);
  });

  it("handles null description", () => {
    const result = autoTagFromMentions("Fix #42", null, []);
    expect(result).toEqual(["github:#42"]);
  });

  it("handles empty existing tags", () => {
    const result = autoTagFromMentions("Fix PROJ-123", null, []);
    expect(result).toEqual(["source:PROJ-123"]);
  });
});
