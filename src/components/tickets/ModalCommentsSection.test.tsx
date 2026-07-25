import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Comment as CommentData } from "../../api/comments";
import { Comment } from "./Comment";
import { ModalCommentsSection } from "./ModalCommentsSection";

const comments: CommentData[] = [
  {
    id: "ai-provenance",
    ticketId: "ticket-1",
    content: "Reviewed from the board modal.",
    author: "opencode",
    type: "comment",
    phase: "ai_review",
    actorKind: "ai",
    provider: "opencode",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-6",
    createdAt: new Date().toISOString(),
  },
  {
    id: "legacy",
    ticketId: "ticket-1",
    content: "Historical comment remains normal.",
    author: "user",
    type: "comment",
    phase: null,
    actorKind: null,
    provider: null,
    modelProvider: null,
    modelName: null,
    createdAt: new Date().toISOString(),
  },
];

vi.mock("../../lib/hooks", () => ({
  usePaginatedComments: () => ({
    comments,
    totalCount: comments.length,
    loading: false,
    hasMore: false,
    fetchMore: vi.fn(),
    isFetchingMore: false,
  }),
  useCreateComment: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("../Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

describe("ModalCommentsSection", () => {
  it("uses the same provenance rendering as ticket detail and keeps legacy comments normal", () => {
    render(
      <>
        <Comment comment={comments[0]!} testId="detail-comment" />
        <ModalCommentsSection ticketId="ticket-1" ticketStatus="in_progress" />
      </>
    );

    expect(screen.getByTestId("modal-comment-ai-provenance-provenance")).toHaveTextContent(
      screen.getByTestId("detail-comment-provenance").textContent ?? ""
    );
    expect(screen.getByTestId("modal-comment-legacy")).toHaveTextContent(
      "Historical comment remains normal."
    );
    expect(screen.queryByTestId("modal-comment-legacy-provenance")).not.toBeInTheDocument();
  });
});
