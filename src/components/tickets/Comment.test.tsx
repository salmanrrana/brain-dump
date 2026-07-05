import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Comment } from "./Comment";

describe("Comment", () => {
  it("shows direct provider comment authors by provider name", () => {
    render(
      <Comment
        comment={{
          id: "comment-1",
          ticketId: "ticket-1",
          content: "Implemented the requested flow.",
          author: "codex",
          type: "comment",
          createdAt: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("shows Pi comment authors by provider name", () => {
    render(
      <Comment
        comment={{
          id: "comment-pi",
          ticketId: "ticket-1",
          content: "Implemented with Pi.",
          author: "pi",
          type: "comment",
          createdAt: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText("Pi")).toBeInTheDocument();
  });

  it("shows Ralph-prefixed provider comments as provider-qualified Ralph", () => {
    render(
      <Comment
        comment={{
          id: "comment-2",
          ticketId: "ticket-1",
          content: "Automated pass completed.",
          author: "ralph:codex",
          type: "progress",
          createdAt: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText("Codex Ralph")).toBeInTheDocument();
  });

  it("shows provider Ralph comments clearly", () => {
    render(
      <Comment
        comment={{
          id: "comment-ralph-pi",
          ticketId: "ticket-1",
          content: "Automated Pi pass completed.",
          author: "pi ralph",
          type: "progress",
          createdAt: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText("Pi Ralph")).toBeInTheDocument();
  });

  it("labels verification report comments", () => {
    render(
      <Comment
        comment={{
          id: "comment-verification",
          ticketId: "ticket-1",
          content: "## Verification passed\n\nEvidence captured.",
          author: "opencode ralph",
          type: "verification_report",
          createdAt: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText("OpenCode Ralph")).toBeInTheDocument();
    expect(screen.getByText("Verification Report")).toBeInTheDocument();
  });

  it("visually distinguishes change-request comments", () => {
    render(
      <Comment
        comment={{
          id: "comment-3",
          ticketId: "ticket-1",
          content: "## Changes Requested\n\nButton did not save.",
          author: "brain-dump",
          type: "change_request",
          createdAt: new Date().toISOString(),
        }}
      />
    );

    expect(screen.getByText("Changes Requested")).toBeInTheDocument();
    const comment = screen.getByTestId("comment");
    expect(comment).toHaveStyle({
      background: "var(--warning-muted)",
    });
    expect(comment.getAttribute("style")).toContain(
      "border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent)"
    );
    expect(comment).not.toHaveStyle({
      borderLeft: "3px solid #f97316",
    });
  });
});
