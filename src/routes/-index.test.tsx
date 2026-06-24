import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ProjectWithAIActivity } from "../lib/hooks";

const mockNavigate = vi.hoisted(() => vi.fn());
const mockOpenProjectModal = vi.hoisted(() => vi.fn());
const mockMutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../components/AppLayoutContext", () => ({
  useAppModalActions: () => ({ openProjectModal: mockOpenProjectModal }),
}));

vi.mock("../lib/hooks", () => ({
  useProjectsWithAIActivity: vi.fn(),
  useUpdateProjectPosition: vi.fn(() => ({ mutateAsync: mockMutateAsync })),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: (event: unknown) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onDragEnd({ active: { id: "alpha" }, over: { id: "beta" } })}
      >
        Drop Alpha on Beta
      </button>
      {children}
    </div>
  ),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  useSortable: vi.fn(({ id, disabled }: { id: string; disabled?: boolean }) => ({
    attributes: {
      "data-sortable-id": id,
      tabIndex: disabled ? -1 : 0,
    },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}));

import { useProjectsWithAIActivity, useUpdateProjectPosition } from "../lib/hooks";

const mockUseProjectsWithAIActivity = useProjectsWithAIActivity as ReturnType<typeof vi.fn>;
const mockUseUpdateProjectPosition = useUpdateProjectPosition as ReturnType<typeof vi.fn>;

function createProject(overrides: Partial<ProjectWithAIActivity>): ProjectWithAIActivity {
  return {
    id: overrides.id ?? "project",
    name: overrides.name ?? "Project",
    path: overrides.path ?? "/tmp/project",
    color: overrides.color ?? "#8b5cf6",
    position: overrides.position ?? 1,
    workingMethod: overrides.workingMethod ?? "auto",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    epics: overrides.epics ?? [],
    hasActiveAI: overrides.hasActiveAI ?? false,
    activeSessionCount: overrides.activeSessionCount ?? 0,
    ticketCount: overrides.ticketCount ?? 0,
  };
}

const projects = [
  createProject({ id: "alpha", name: "Alpha", position: 1 }),
  createProject({ id: "beta", name: "Beta", position: 2 }),
  createProject({ id: "charlie", name: "Charlie", position: 3 }),
];

let Home: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  mockMutateAsync.mockResolvedValue({});
  mockUseProjectsWithAIActivity.mockReturnValue({
    projects,
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseUpdateProjectPosition.mockReturnValue({ mutateAsync: mockMutateAsync });

  const module = await import("./index");
  Home = module.Route.options.component as React.ComponentType;
});

describe("Projects home", () => {
  it("keeps row click navigation separate from the reorder handle", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Reorder Alpha" }));
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("project-list-item-alpha"));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/projects/$projectId",
      params: { projectId: "alpha" },
    });
  });

  it("persists a midpoint position when a project is dropped on another project", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole("button", { name: "Drop Alpha on Beta" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ id: "alpha", position: 2.5 });
    });
  });

  it("documents and disables reordering while search is active", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("textbox", { name: "Search projects by name" }), "bet");

    expect(screen.getByText("Reordering is paused while search is active.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Beta" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByRole("button", { name: "Reorder Beta" })).toHaveAttribute(
      "title",
      "Clear search to reorder projects"
    );
  });
});
