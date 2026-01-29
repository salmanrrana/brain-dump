import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatsGrid } from "./StatsGrid";

describe("StatsGrid", () => {
  const defaultProps = {
    total: 24,
    inProgress: 3,
    aiActive: 1,
    done: 15,
  };

  describe("Rendering", () => {
    it("renders 4 stat cards", () => {
      render(<StatsGrid {...defaultProps} />);

      const list = screen.getByRole("list", { name: "Ticket statistics" });
      const items = within(list).getAllByRole("listitem");

      expect(items).toHaveLength(4);
    });

    it("displays correct count for Total", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByTestId("stat-value-all")).toHaveTextContent("24");
    });

    it("displays correct count for In Progress", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByTestId("stat-value-in_progress")).toHaveTextContent("3");
    });

    it("displays correct count for AI Active", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByTestId("stat-value-ai_active")).toHaveTextContent("1");
    });

    it("displays correct count for Done", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByTestId("stat-value-done")).toHaveTextContent("15");
    });

    it("displays all labels", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByText("Total")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("AI Active")).toBeInTheDocument();
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("updates counts when props change", () => {
      const { rerender } = render(<StatsGrid {...defaultProps} />);

      expect(screen.getByTestId("stat-value-all")).toHaveTextContent("24");

      rerender(<StatsGrid {...defaultProps} total={50} inProgress={10} />);

      expect(screen.getByTestId("stat-value-all")).toHaveTextContent("50");
      expect(screen.getByTestId("stat-value-in_progress")).toHaveTextContent("10");
    });

    it("handles zero counts", () => {
      render(<StatsGrid total={0} inProgress={0} aiActive={0} done={0} />);

      expect(screen.getByTestId("stat-value-all")).toHaveTextContent("0");
      expect(screen.getByTestId("stat-value-in_progress")).toHaveTextContent("0");
      expect(screen.getByTestId("stat-value-ai_active")).toHaveTextContent("0");
      expect(screen.getByTestId("stat-value-done")).toHaveTextContent("0");
    });
  });

  describe("Click interactions", () => {
    it("calls onStatClick with 'all' when Total card is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<StatsGrid {...defaultProps} onStatClick={handleClick} />);

      await user.click(screen.getByLabelText(/Total: 24 tickets/));

      expect(handleClick).toHaveBeenCalledWith("all");
    });

    it("calls onStatClick with 'in_progress' when In Progress card is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<StatsGrid {...defaultProps} onStatClick={handleClick} />);

      await user.click(screen.getByLabelText(/In Progress: 3 tickets/));

      expect(handleClick).toHaveBeenCalledWith("in_progress");
    });

    it("calls onStatClick with 'ai_active' when AI Active card is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<StatsGrid {...defaultProps} onStatClick={handleClick} />);

      await user.click(screen.getByLabelText(/AI Active: 1 tickets/));

      expect(handleClick).toHaveBeenCalledWith("ai_active");
    });

    it("calls onStatClick with 'done' when Done card is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<StatsGrid {...defaultProps} onStatClick={handleClick} />);

      await user.click(screen.getByLabelText(/Done: 15 tickets/));

      expect(handleClick).toHaveBeenCalledWith("done");
    });

    it("does not crash when clicked without onStatClick handler", async () => {
      const user = userEvent.setup();
      render(<StatsGrid {...defaultProps} />);

      // Should not throw
      await user.click(screen.getByLabelText(/Total: 24 tickets/));
    });
  });

  describe("Keyboard navigation", () => {
    it("triggers click on Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<StatsGrid {...defaultProps} onStatClick={handleClick} />);

      const totalCard = screen.getByLabelText(/Total: 24 tickets/);
      totalCard.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledWith("all");
    });

    it("triggers click on Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<StatsGrid {...defaultProps} onStatClick={handleClick} />);

      const inProgressCard = screen.getByLabelText(/In Progress: 3 tickets/);
      inProgressCard.focus();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledWith("in_progress");
    });

    it("cards are focusable when onStatClick is provided", () => {
      render(<StatsGrid {...defaultProps} onStatClick={vi.fn()} />);

      const cards = screen.getAllByRole("listitem");
      cards.forEach((card) => {
        expect(card).toHaveAttribute("tabindex", "0");
      });
    });

    it("cards are not focusable when onStatClick is not provided", () => {
      render(<StatsGrid {...defaultProps} />);

      const cards = screen.getAllByRole("listitem");
      cards.forEach((card) => {
        expect(card).not.toHaveAttribute("tabindex");
      });
    });
  });

  describe("Accessibility", () => {
    it("has accessible list role", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByRole("list", { name: "Ticket statistics" })).toBeInTheDocument();
    });

    it("stat cards have listitem role", () => {
      render(<StatsGrid {...defaultProps} />);

      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(4);
    });

    it("provides descriptive aria-labels for each stat", () => {
      render(<StatsGrid {...defaultProps} onStatClick={vi.fn()} />);

      expect(screen.getByLabelText("Total: 24 tickets, click to filter")).toBeInTheDocument();
      expect(screen.getByLabelText("In Progress: 3 tickets, click to filter")).toBeInTheDocument();
      expect(screen.getByLabelText("AI Active: 1 tickets, click to filter")).toBeInTheDocument();
      expect(screen.getByLabelText("Done: 15 tickets, click to filter")).toBeInTheDocument();
    });

    it("aria-labels exclude 'click to filter' when not clickable", () => {
      render(<StatsGrid {...defaultProps} />);

      expect(screen.getByLabelText("Total: 24 tickets")).toBeInTheDocument();
      expect(screen.queryByLabelText(/click to filter/)).not.toBeInTheDocument();
    });
  });

  describe("Visual styling", () => {
    it("renders grid layout with 4 columns", () => {
      render(<StatsGrid {...defaultProps} />);

      const list = screen.getByRole("list");
      expect(list).toHaveStyle({ display: "grid" });
    });
  });
});
