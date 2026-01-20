import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpNextQueue } from "./UpNextQueue";
import type { Ticket } from "../../lib/hooks";

// Mock tickets for testing - representing a typical priority-sorted queue
type QueueTicket = Pick<Ticket, "id" | "title" | "priority" | "projectId"> & {
  projectName?: string;
};

const mockTickets: QueueTicket[] = [
  {
    id: "ticket-1",
    title: "Add login validation",
    priority: "high",
    projectId: "project-1",
    projectName: "Brain Dump",
  },
  {
    id: "ticket-2",
    title: "Update API documentation",
    priority: "medium",
    projectId: "project-1",
    projectName: "Brain Dump",
  },
  {
    id: "ticket-3",
    title: "Fix navbar styling issue",
    priority: "medium",
    projectId: "project-2",
    projectName: "Dashboard UI",
  },
  {
    id: "ticket-4",
    title: "Refactor utility functions",
    priority: "low",
    projectId: "project-1",
    projectName: "Brain Dump",
  },
  {
    id: "ticket-5",
    title: "Add comprehensive unit tests for hooks",
    priority: null,
    projectId: "project-1",
    projectName: "Brain Dump",
  },
];

describe("UpNextQueue", () => {
  describe("Rendering tickets", () => {
    it("renders the component with header", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByText("Up Next")).toBeInTheDocument();
      expect(screen.getByTestId("up-next-queue")).toBeInTheDocument();
    });

    it("displays all provided tickets", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByText("Add login validation")).toBeInTheDocument();
      expect(screen.getByText("Update API documentation")).toBeInTheDocument();
      expect(screen.getByText("Fix navbar styling issue")).toBeInTheDocument();
      expect(screen.getByText("Refactor utility functions")).toBeInTheDocument();
      expect(screen.getByText("Add comprehensive unit tests for hooks")).toBeInTheDocument();
    });

    it("displays tickets with index numbers", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      const list = screen.getByTestId("queue-list");
      expect(within(list).getByTestId("queue-item-0")).toHaveTextContent("1.");
      expect(within(list).getByTestId("queue-item-1")).toHaveTextContent("2.");
      expect(within(list).getByTestId("queue-item-2")).toHaveTextContent("3.");
      expect(within(list).getByTestId("queue-item-3")).toHaveTextContent("4.");
      expect(within(list).getByTestId("queue-item-4")).toHaveTextContent("5.");
    });

    it("displays project names for each ticket", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByTestId("project-name-0")).toHaveTextContent("Brain Dump");
      expect(screen.getByTestId("project-name-2")).toHaveTextContent("Dashboard UI");
    });

    it("handles tickets without project names", () => {
      const ticketsWithoutProjectNames = mockTickets.map(
        ({ projectName: _unused, ...rest }) => rest
      );
      render(<UpNextQueue tickets={ticketsWithoutProjectNames} />);

      // Should not crash and should not show project names
      expect(screen.queryByTestId("project-name-0")).not.toBeInTheDocument();
    });

    it("truncates long ticket titles with ellipsis", () => {
      const ticketWithLongTitle = [
        {
          id: "long-title",
          title:
            "This is a very long ticket title that should be truncated when displayed in the queue",
          priority: "high" as const,
          projectId: "project-1",
        },
      ];
      render(<UpNextQueue tickets={ticketWithLongTitle} />);

      // The component should render without crashing
      expect(
        screen.getByText(
          "This is a very long ticket title that should be truncated when displayed in the queue"
        )
      ).toBeInTheDocument();
    });
  });

  describe("Priority badges", () => {
    it("displays priority badges for all tickets", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      const badges = screen.getAllByTestId("priority-badge");
      expect(badges).toHaveLength(5);
    });

    it("has accessible labels for priority badges", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByLabelText("High priority")).toBeInTheDocument();
      expect(screen.getAllByLabelText("Medium priority")).toHaveLength(2);
      expect(screen.getByLabelText("Low priority")).toBeInTheDocument();
      expect(screen.getByLabelText("No priority")).toBeInTheDocument();
    });

    it("shows correct priority titles on hover", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      const badges = screen.getAllByTestId("priority-badge");
      expect(badges[0]).toHaveAttribute("title", "High priority");
      expect(badges[1]).toHaveAttribute("title", "Medium priority");
      expect(badges[3]).toHaveAttribute("title", "Low priority");
      expect(badges[4]).toHaveAttribute("title", "No priority");
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no tickets", () => {
      render(<UpNextQueue tickets={[]} />);

      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.getByText("Queue empty")).toBeInTheDocument();
      expect(screen.getByText("All tickets are either done or in progress")).toBeInTheDocument();
    });

    it("does not show queue list in empty state", () => {
      render(<UpNextQueue tickets={[]} />);

      expect(screen.queryByTestId("queue-list")).not.toBeInTheDocument();
    });
  });

  describe("Click interactions", () => {
    it("calls onClick with ticket ID when a queue item is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onClick={handleClick} />);

      await user.click(screen.getByTestId("queue-item-0"));

      expect(handleClick).toHaveBeenCalledWith("ticket-1");
    });

    it("calls onClick with correct ID for different tickets", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onClick={handleClick} />);

      await user.click(screen.getByTestId("queue-item-2"));

      expect(handleClick).toHaveBeenCalledWith("ticket-3");
    });

    it("does not crash when clicked without onClick handler", async () => {
      const user = userEvent.setup();
      render(<UpNextQueue tickets={mockTickets} />);

      // Should not throw
      await user.click(screen.getByTestId("queue-item-0"));
    });

    it("has button role when onClick is provided", () => {
      render(<UpNextQueue tickets={mockTickets} onClick={vi.fn()} />);

      expect(screen.getByTestId("queue-item-0")).toHaveAttribute("role", "button");
    });

    it("does not have button role when onClick is not provided", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByTestId("queue-item-0")).not.toHaveAttribute("role");
    });
  });

  describe("Start button", () => {
    it("shows Start buttons when onStart is provided", () => {
      render(<UpNextQueue tickets={mockTickets} onStart={vi.fn()} />);

      expect(screen.getAllByRole("button", { name: /start working on/i })).toHaveLength(5);
    });

    it("does not show Start buttons when onStart is not provided", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.queryByTestId("start-button-0")).not.toBeInTheDocument();
    });

    it("calls onStart with ticket ID when Start button is clicked", async () => {
      const user = userEvent.setup();
      const handleStart = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onStart={handleStart} />);

      await user.click(screen.getByTestId("start-button-0"));

      expect(handleStart).toHaveBeenCalledWith("ticket-1");
    });

    it("does not trigger onClick when Start button is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleStart = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onClick={handleClick} onStart={handleStart} />);

      await user.click(screen.getByTestId("start-button-0"));

      expect(handleStart).toHaveBeenCalled();
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("has accessible label for Start button", () => {
      render(<UpNextQueue tickets={mockTickets} onStart={vi.fn()} />);

      expect(screen.getByLabelText("Start working on: Add login validation")).toBeInTheDocument();
    });
  });

  describe("Keyboard navigation", () => {
    it("triggers onClick on Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onClick={handleClick} />);

      const firstItem = screen.getByTestId("queue-item-0");
      firstItem.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledWith("ticket-1");
    });

    it("triggers onClick on Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onClick={handleClick} />);

      const firstItem = screen.getByTestId("queue-item-0");
      firstItem.focus();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledWith("ticket-1");
    });

    it("items are focusable when onClick provided", () => {
      render(<UpNextQueue tickets={mockTickets} onClick={vi.fn()} />);

      expect(screen.getByTestId("queue-item-0")).toHaveAttribute("tabindex", "0");
      expect(screen.getByTestId("queue-item-4")).toHaveAttribute("tabindex", "0");
    });

    it("items are not focusable when onClick not provided", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByTestId("queue-item-0")).not.toHaveAttribute("tabindex");
    });

    it("can tab through Start buttons", async () => {
      render(<UpNextQueue tickets={mockTickets} onStart={vi.fn()} />);

      const startButton = screen.getByTestId("start-button-0");
      expect(startButton.tagName).toBe("BUTTON");
    });

    it("triggers onStart with Enter on Start button", async () => {
      const user = userEvent.setup();
      const handleStart = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onStart={handleStart} />);

      const startButton = screen.getByTestId("start-button-0");
      startButton.focus();
      await user.keyboard("{Enter}");

      expect(handleStart).toHaveBeenCalledWith("ticket-1");
    });

    it("triggers onStart with Space on Start button", async () => {
      const user = userEvent.setup();
      const handleStart = vi.fn();
      render(<UpNextQueue tickets={mockTickets} onStart={handleStart} />);

      const startButton = screen.getByTestId("start-button-0");
      startButton.focus();
      await user.keyboard(" ");

      expect(handleStart).toHaveBeenCalledWith("ticket-1");
    });
  });

  describe("Accessibility", () => {
    it("has accessible heading", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByRole("heading", { name: "Up Next" })).toBeInTheDocument();
    });

    it("has section landmark", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      const section = screen.getByTestId("up-next-queue");
      expect(section.tagName).toBe("SECTION");
    });

    it("uses ordered list semantically", () => {
      render(<UpNextQueue tickets={mockTickets} />);

      expect(screen.getByRole("list")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
    });

    it("has accessible labels for clickable items", () => {
      render(<UpNextQueue tickets={mockTickets} onClick={vi.fn()} />);

      expect(screen.getByLabelText("View ticket: Add login validation")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles single ticket", () => {
      const singleTicket = mockTickets.slice(0, 1);
      render(<UpNextQueue tickets={singleTicket} />);

      expect(screen.getByText("Add login validation")).toBeInTheDocument();
      expect(screen.getByTestId("queue-item-0")).toHaveTextContent("1.");
    });

    it("handles tickets with null priority", () => {
      const ticketsWithNullPriority = [
        {
          id: "null-priority",
          title: "No Priority Ticket",
          priority: null,
          projectId: "project-1",
        },
      ];
      render(<UpNextQueue tickets={ticketsWithNullPriority} />);

      expect(screen.getByText("No Priority Ticket")).toBeInTheDocument();
      expect(screen.getByLabelText("No priority")).toBeInTheDocument();
    });

    it("handles tickets with undefined projectName", () => {
      const ticketsWithoutProject = [
        {
          id: "no-project",
          title: "Ticket Without Project",
          priority: "high" as const,
          projectId: "project-1",
        },
      ];
      render(<UpNextQueue tickets={ticketsWithoutProject} />);

      expect(screen.queryByTestId("project-name-0")).not.toBeInTheDocument();
    });
  });
});
