import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill, type TicketStatus } from "./StatusPill";

describe("StatusPill", () => {
  describe("Rendering", () => {
    it("renders with default md size", () => {
      render(<StatusPill status="in_progress" />);

      const pill = screen.getByRole("status");
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveAttribute("data-size", "md");
    });

    it("renders with sm size when specified", () => {
      render(<StatusPill status="done" size="sm" />);

      const pill = screen.getByRole("status");
      expect(pill).toHaveAttribute("data-size", "sm");
    });

    it("renders the status data attribute", () => {
      render(<StatusPill status="ai_review" />);

      const pill = screen.getByRole("status");
      expect(pill).toHaveAttribute("data-status", "ai_review");
    });
  });

  describe("Status labels", () => {
    const statusLabels: Array<{ status: TicketStatus; label: string }> = [
      { status: "backlog", label: "Backlog" },
      { status: "ready", label: "Ready" },
      { status: "in_progress", label: "In Progress" },
      { status: "ai_review", label: "AI Review" },
      { status: "human_review", label: "Human Review" },
      { status: "done", label: "Done" },
    ];

    it.each(statusLabels)("displays correct label for $status status", ({ status, label }) => {
      render(<StatusPill status={status} />);

      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has role=status for screen readers", () => {
      render(<StatusPill status="backlog" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("has aria-label with status information", () => {
      render(<StatusPill status="in_progress" />);

      const pill = screen.getByRole("status");
      expect(pill).toHaveAttribute("aria-label", "Status: In Progress");
    });

    it("hides the dot from screen readers", () => {
      const { container } = render(<StatusPill status="done" />);

      // The dot should have aria-hidden="true"
      const dot = container.querySelector('[aria-hidden="true"]');
      expect(dot).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      render(<StatusPill status="ready" className="custom-class" />);

      const pill = screen.getByRole("status");
      expect(pill).toHaveClass("custom-class");
    });

    it("applies custom inline styles", () => {
      render(<StatusPill status="ready" style={{ marginTop: "10px" }} />);

      const pill = screen.getByRole("status");
      expect(pill).toHaveStyle({ marginTop: "10px" });
    });

    it("has inline-flex display for proper alignment", () => {
      render(<StatusPill status="backlog" />);

      const pill = screen.getByRole("status");
      expect(pill).toHaveStyle({ display: "inline-flex" });
    });
  });

  describe("Visual elements", () => {
    it("renders a colored dot element", () => {
      const { container } = render(<StatusPill status="in_progress" />);

      // The dot is the first span child with aria-hidden
      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveStyle({ borderRadius: "50%" });
    });

    it("renders the label text", () => {
      render(<StatusPill status="done" />);

      expect(screen.getByText("Done")).toBeInTheDocument();
    });
  });
});
