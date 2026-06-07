import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderHighlightedDiffLine } from "./syntax-highlight";

describe("syntax highlighting", () => {
  it("applies language-aware tokens to diff content", () => {
    render(
      <code>{renderHighlightedDiffLine('+const label = "new";', "typescript", "diff-test")}</code>
    );

    expect(screen.getByText("+")).toHaveClass("code-diff-marker-addition");
    expect(screen.getByText("const")).toHaveClass("code-token-keyword");
    expect(screen.getByText('"new"')).toHaveClass("code-token-string");
  });

  it("marks hunk headers separately from code content", () => {
    render(<code>{renderHighlightedDiffLine("@@ -1,2 +1,2 @@", "typescript", "hunk-test")}</code>);

    expect(screen.getByText("@@ -1,2 +1,2 @@")).toHaveClass("code-token-hunk");
  });
});
