import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  describe("Status variant", () => {
    it("displays correct labels for all status values", () => {
      const { rerender } = render(<Badge variant="status" value="backlog" />);
      expect(screen.getByText("Backlog")).toBeInTheDocument();

      rerender(<Badge variant="status" value="ready" />);
      expect(screen.getByText("Ready")).toBeInTheDocument();

      rerender(<Badge variant="status" value="in_progress" />);
      expect(screen.getByText("In Progress")).toBeInTheDocument();

      rerender(<Badge variant="status" value="review" />);
      expect(screen.getByText("Review")).toBeInTheDocument();

      rerender(<Badge variant="status" value="ai_review" />);
      expect(screen.getByText("AI Review")).toBeInTheDocument();

      rerender(<Badge variant="status" value="human_review" />);
      expect(screen.getByText("Human Review")).toBeInTheDocument();

      rerender(<Badge variant="status" value="done" />);
      expect(screen.getByText("Done")).toBeInTheDocument();
    });
  });

  describe("Priority variant", () => {
    it("displays correct labels for all priority values", () => {
      const { rerender } = render(<Badge variant="priority" value="high" />);
      expect(screen.getByText("High")).toBeInTheDocument();

      rerender(<Badge variant="priority" value="medium" />);
      expect(screen.getByText("Medium")).toBeInTheDocument();

      rerender(<Badge variant="priority" value="low" />);
      expect(screen.getByText("Low")).toBeInTheDocument();
    });
  });

  describe("PR status variant", () => {
    it("displays correct labels for all PR status values", () => {
      const { rerender } = render(<Badge variant="pr-status" value="open" />);
      expect(screen.getByText("Open")).toBeInTheDocument();

      rerender(<Badge variant="pr-status" value="draft" />);
      expect(screen.getByText("Draft")).toBeInTheDocument();

      rerender(<Badge variant="pr-status" value="merged" />);
      expect(screen.getByText("Merged")).toBeInTheDocument();

      rerender(<Badge variant="pr-status" value="closed" />);
      expect(screen.getByText("Closed")).toBeInTheDocument();
    });
  });

  describe("Props", () => {
    it("accepts className prop", () => {
      render(<Badge variant="status" value="done" className="custom-class" />);
      expect(screen.getByText("Done")).toHaveClass("custom-class");
    });

    it("forwards ref to span element", () => {
      const ref = vi.fn();
      render(<Badge variant="status" value="done" ref={ref} />);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLSpanElement);
    });
  });
});
