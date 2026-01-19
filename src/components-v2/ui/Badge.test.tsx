/**
 * Badge Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (what users see)
 * - Test visual states and color mappings
 * - Verify correct labels display for each value
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("Badge", () => {
  describe("Status variant", () => {
    it("should display backlog status with gray color", () => {
      render(<Badge variant="status" value="backlog" />);

      const badge = screen.getByText("Backlog");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("data-variant", "status");
      expect(badge).toHaveAttribute("data-value", "backlog");
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-backlog)" });
    });

    it("should display ready status with blue color", () => {
      render(<Badge variant="status" value="ready" />);

      const badge = screen.getByText("Ready");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-ready)" });
    });

    it("should display in_progress status with purple color", () => {
      render(<Badge variant="status" value="in_progress" />);

      const badge = screen.getByText("In Progress");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-in-progress)" });
    });

    it("should display review status with purple color", () => {
      render(<Badge variant="status" value="review" />);

      const badge = screen.getByText("Review");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-review)" });
    });

    it("should display ai_review status with review color", () => {
      render(<Badge variant="status" value="ai_review" />);

      const badge = screen.getByText("AI Review");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-review)" });
    });

    it("should display human_review status with review color", () => {
      render(<Badge variant="status" value="human_review" />);

      const badge = screen.getByText("Human Review");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-review)" });
    });

    it("should display done status with green color", () => {
      render(<Badge variant="status" value="done" />);

      const badge = screen.getByText("Done");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--status-done)" });
    });
  });

  describe("Priority variant", () => {
    it("should display high priority with red color", () => {
      render(<Badge variant="priority" value="high" />);

      const badge = screen.getByText("High");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("data-variant", "priority");
      expect(badge).toHaveAttribute("data-value", "high");
      expect(badge).toHaveStyle({ backgroundColor: "var(--priority-high)" });
    });

    it("should display medium priority with orange color", () => {
      render(<Badge variant="priority" value="medium" />);

      const badge = screen.getByText("Medium");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--priority-medium)" });
    });

    it("should display low priority with gray color", () => {
      render(<Badge variant="priority" value="low" />);

      const badge = screen.getByText("Low");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--priority-low)" });
    });
  });

  describe("PR status variant", () => {
    it("should display open PR status with green color", () => {
      render(<Badge variant="pr-status" value="open" />);

      const badge = screen.getByText("Open");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("data-variant", "pr-status");
      expect(badge).toHaveAttribute("data-value", "open");
      expect(badge).toHaveStyle({ backgroundColor: "var(--pr-open)" });
    });

    it("should display draft PR status with gray color", () => {
      render(<Badge variant="pr-status" value="draft" />);

      const badge = screen.getByText("Draft");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--pr-draft)" });
    });

    it("should display merged PR status with purple color", () => {
      render(<Badge variant="pr-status" value="merged" />);

      const badge = screen.getByText("Merged");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--pr-merged)" });
    });

    it("should display closed PR status with red color", () => {
      render(<Badge variant="pr-status" value="closed" />);

      const badge = screen.getByText("Closed");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveStyle({ backgroundColor: "var(--pr-closed)" });
    });
  });

  // ===========================================================================
  // SIZE TESTS
  // ===========================================================================

  describe("Size variants", () => {
    it("should render sm size by default as md", () => {
      render(<Badge variant="status" value="done" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveAttribute("data-size", "md");
    });

    it("should render sm size correctly", () => {
      render(<Badge variant="status" value="done" size="sm" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveAttribute("data-size", "sm");
      expect(badge).toHaveStyle({
        padding: "var(--spacing-1) var(--spacing-2)",
        fontSize: "var(--font-size-xs)",
      });
    });

    it("should render md size correctly", () => {
      render(<Badge variant="status" value="done" size="md" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveAttribute("data-size", "md");
      expect(badge).toHaveStyle({
        padding: "var(--spacing-1) var(--spacing-3)",
        fontSize: "var(--font-size-sm)",
      });
    });
  });

  // ===========================================================================
  // VISUAL STYLING TESTS
  // ===========================================================================

  describe("Visual styling", () => {
    it("should have pill shape with full border radius", () => {
      render(<Badge variant="status" value="done" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveStyle({ borderRadius: "var(--radius-full)" });
    });

    it("should have white text color for contrast", () => {
      render(<Badge variant="status" value="done" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveStyle({ color: "#ffffff" });
    });

    it("should display inline-flex for proper alignment", () => {
      render(<Badge variant="status" value="done" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveStyle({ display: "inline-flex" });
    });

    it("should have medium font weight", () => {
      render(<Badge variant="status" value="done" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveStyle({
        fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
      });
    });
  });

  // ===========================================================================
  // PROPS PASS-THROUGH TESTS
  // ===========================================================================

  describe("Props pass-through", () => {
    it("should accept className prop for custom styling", () => {
      render(<Badge variant="status" value="done" className="custom-class" />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveClass("custom-class");
    });

    it("should accept custom style prop", () => {
      render(<Badge variant="status" value="done" style={{ marginLeft: "8px" }} />);

      const badge = screen.getByText("Done");
      expect(badge).toHaveStyle({ marginLeft: "8px" });
    });

    it("should forward ref to span element", () => {
      const ref = vi.fn();
      render(<Badge variant="status" value="done" ref={ref} />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0]?.[0];
      expect(callArg).toBeInstanceOf(HTMLSpanElement);
    });

    it("should pass through data attributes", () => {
      render(<Badge variant="status" value="done" data-testid="my-badge" />);

      expect(screen.getByTestId("my-badge")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // ALL VARIANTS RENDER TEST (Acceptance Criteria)
  // ===========================================================================

  describe("All variants render", () => {
    it("should render all status values", () => {
      const statusValues = [
        "backlog",
        "ready",
        "in_progress",
        "review",
        "ai_review",
        "human_review",
        "done",
      ] as const;

      const { rerender, container } = render(<Badge variant="status" value="backlog" />);

      for (const value of statusValues) {
        rerender(<Badge variant="status" value={value} />);
        const badge = container.querySelector("[data-variant='status']");
        expect(badge).toHaveAttribute("data-value", value);
      }
    });

    it("should render all priority values", () => {
      const priorityValues = ["high", "medium", "low"] as const;

      const { rerender, container } = render(<Badge variant="priority" value="high" />);

      for (const value of priorityValues) {
        rerender(<Badge variant="priority" value={value} />);
        const badge = container.querySelector("[data-variant='priority']");
        expect(badge).toHaveAttribute("data-value", value);
      }
    });

    it("should render all PR status values", () => {
      const prStatusValues = ["open", "draft", "merged", "closed"] as const;

      const { rerender, container } = render(<Badge variant="pr-status" value="open" />);

      for (const value of prStatusValues) {
        rerender(<Badge variant="pr-status" value={value} />);
        const badge = container.querySelector("[data-variant='pr-status']");
        expect(badge).toHaveAttribute("data-value", value);
      }
    });
  });
});
