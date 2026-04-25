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

  it("shows Ralph-prefixed provider comments with the underlying provider", () => {
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

    expect(screen.getByText("Ralph (Codex)")).toBeInTheDocument();
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
    expect(screen.getByTestId("comment")).toHaveStyle({
      background: "rgba(249, 115, 22, 0.1)",
      borderLeft: "3px solid #f97316",
    });
  });
});
