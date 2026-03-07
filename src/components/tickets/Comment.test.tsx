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
});
