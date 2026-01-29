import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ClaudeTasks } from "./ClaudeTasks";
import type { ClaudeTask } from "../../lib/schema";

// Mock the hook
vi.mock("../../lib/hooks", () => ({
  useClaudeTasks: vi.fn(),
}));

import { useClaudeTasks } from "../../lib/hooks";

const mockUseClaudeTasks = vi.mocked(useClaudeTasks);

function renderWithQueryClient(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

describe("ClaudeTasks Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when no tasks and not loading", () => {
    mockUseClaudeTasks.mockReturnValue({
      tasks: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { container } = renderWithQueryClient(
      <ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" />
    );

    // Component returns null when no tasks and not loading
    expect(container.firstChild).toBeNull();
  });

  it("shows loading state while fetching", () => {
    mockUseClaudeTasks.mockReturnValue({
      tasks: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(
      <ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" defaultExpanded={true} />
    );

    // Check for skeleton loaders (3 pulsing items when loading)
    const skeletonItems = document.querySelectorAll("[role='list'] li");
    expect(skeletonItems).toHaveLength(3);

    // Verify skeleton animation classes are present
    const animatedElements = document.querySelectorAll(".animate-pulse");
    expect(animatedElements.length).toBeGreaterThan(0);
  });

  it("shows error message when fetch fails", () => {
    mockUseClaudeTasks.mockReturnValue({
      tasks: [],
      loading: false,
      error: { message: "Failed to fetch tasks", code: undefined },
      refetch: vi.fn(),
    });

    renderWithQueryClient(<ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" />);

    expect(screen.getByText(/failed to fetch tasks/i)).toBeInTheDocument();
  });

  it("displays tasks with correct status icons", () => {
    const tasks: ClaudeTask[] = [
      {
        id: "1",
        ticketId: "ticket-1",
        subject: "Pending task",
        status: "pending",
        description: null,
        activeForm: null,
        position: 1,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
      {
        id: "2",
        ticketId: "ticket-1",
        subject: "In progress task",
        status: "in_progress",
        description: null,
        activeForm: "Running tests",
        position: 2,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
      {
        id: "3",
        ticketId: "ticket-1",
        subject: "Completed task",
        status: "completed",
        description: null,
        activeForm: null,
        position: 3,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ];

    mockUseClaudeTasks.mockReturnValue({
      tasks,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(<ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" />);

    // Verify tasks are rendered
    expect(screen.getByText("Pending task")).toBeInTheDocument();
    expect(screen.getByText("In progress task")).toBeInTheDocument();
    expect(screen.getByText("Completed task")).toBeInTheDocument();

    // Verify completed task has strikethrough
    const completedTask = screen.getByText("Completed task");
    expect(completedTask).toHaveClass("line-through");
  });

  it("shows active form text for in-progress tasks", () => {
    const tasks: ClaudeTask[] = [
      {
        id: "1",
        ticketId: "ticket-1",
        subject: "Running task",
        status: "in_progress",
        description: null,
        activeForm: "Building and testing",
        position: 1,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
    ];

    mockUseClaudeTasks.mockReturnValue({
      tasks,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(
      <ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" defaultExpanded={true} />
    );

    // ActiveForm text should include the ellipsis from the component
    expect(screen.getByText("Building and testing...")).toBeInTheDocument();
  });

  it("shows task count in header", () => {
    const tasks: ClaudeTask[] = [
      {
        id: "1",
        ticketId: "ticket-1",
        subject: "Task 1",
        status: "completed",
        description: null,
        activeForm: null,
        position: 1,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      {
        id: "2",
        ticketId: "ticket-1",
        subject: "Task 2",
        status: "pending",
        description: null,
        activeForm: null,
        position: 2,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
    ];

    mockUseClaudeTasks.mockReturnValue({
      tasks,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(
      <ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" defaultExpanded={true} />
    );

    // Header should show "(1/2 complete)"
    expect(screen.getByText("(1/2 complete)")).toBeInTheDocument();
  });

  it("toggles expanded state on button click", async () => {
    const user = userEvent.setup();

    const tasks: ClaudeTask[] = [
      {
        id: "1",
        ticketId: "ticket-1",
        subject: "Task 1",
        status: "pending",
        description: null,
        activeForm: null,
        position: 1,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
    ];

    mockUseClaudeTasks.mockReturnValue({
      tasks,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(
      <ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" defaultExpanded={true} />
    );

    const button = screen.getByRole("button", { name: /claude tasks/i });

    // Initially expanded, should show task
    expect(screen.getByText("Task 1")).toBeInTheDocument();

    // Click to collapse
    await user.click(button);
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();

    // Click to expand
    await user.click(button);
    expect(screen.getByText("Task 1")).toBeInTheDocument();
  });

  it("starts collapsed when defaultExpanded is false", () => {
    const tasks: ClaudeTask[] = [
      {
        id: "1",
        ticketId: "ticket-1",
        subject: "Task 1",
        status: "pending",
        description: null,
        activeForm: null,
        position: 1,
        statusHistory: null,
        sessionId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
    ];

    mockUseClaudeTasks.mockReturnValue({
      tasks,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithQueryClient(
      <ClaudeTasks ticketId="ticket-1" ticketStatus="backlog" defaultExpanded={false} />
    );

    // Task should not be visible
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument();
  });
});
