import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  it("renders language-aware syntax tokens", () => {
    render(<CodeBlock code={'const label = "Brain Dump";'} language="typescript" />);

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("const")).toHaveClass("code-token-keyword");
    expect(screen.getByText('"Brain Dump"')).toHaveClass("code-token-string");
  });
});
