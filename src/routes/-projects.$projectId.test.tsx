import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import type { Epic, ProjectWithEpics } from "../lib/hooks";

const mockNavigate = vi.hoisted(() => vi.fn());
const mockOpenEpicModal = vi.hoisted(() => vi.fn());
const mockUseProjects = vi.hoisted(() => vi.fn());
const mockUseEpicTicketCounts = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({ ...config, options: config }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../components/AppLayoutContext", () => ({
  useAppModalActions: () => ({ openEpicModal: mockOpenEpicModal }),
}));

vi.mock("../lib/hooks", () => ({
  useProjects: mockUseProjects,
  useEpicTicketCounts: mockUseEpicTicketCounts,
}));

vi.mock("../api/tickets", () => ({
  getEpicTicketCounts: vi.fn(),
}));

vi.mock("../api/projects", () => ({
  getProjectsWithEpics: vi.fn(),
}));

vi.mock("../components/projects/DevHubToolbar", () => ({
  default: () => <div>Dev hub toolbar</div>,
}));

vi.mock("../components/projects/GitHistoryCard", () => ({
  default: () => <div>Git history</div>,
}));

vi.mock("../components/navigation/EpicListItem", () => ({
  default: ({
    epic,
    ticketCount,
    onSelect,
  }: {
    epic: Epic;
    ticketCount?: number;
    onSelect: () => void;
  }) => (
    <button type="button" onClick={onSelect} data-testid={`epic-list-item-${epic.id}`}>
      <span>{epic.title}</span>
      {ticketCount !== undefined && <span>{ticketCount} tickets</span>}
    </button>
  ),
}));

vi.mock("../components/route-skeletons", () => ({
  ProjectDetailSkeleton: () => <div>Loading project detail</div>,
}));

function createEpic(overrides: Partial<Epic>): Epic {
  return {
    id: overrides.id ?? "epic",
    title: overrides.title ?? "Epic",
    description: overrides.description ?? null,
    projectId: overrides.projectId ?? "project-1",
    color: overrides.color ?? "#3b82f6",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function createProject(epics: Epic[]): ProjectWithEpics {
  return {
    id: "project-1",
    name: "Brain Dump",
    path: "/tmp/brain-dump",
    color: "#8b5cf6",
    workingMethod: "auto",
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    epics,
  };
}

let ProjectDetailPage: ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();

  const module = await import("./projects.$projectId");
  Object.assign(module.Route, { useParams: () => ({ projectId: "project-1" }) });
  ProjectDetailPage = module.Route.options.component as ComponentType;
});

describe("ProjectDetail", () => {
  it("renders epics newest-first without losing ticket counts or add epic actions", async () => {
    const user = userEvent.setup();
    const oldestEpic = createEpic({
      id: "oldest",
      title: "Oldest Epic",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newestEpic = createEpic({
      id: "newest",
      title: "Newest Epic",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    const middleEpic = createEpic({
      id: "middle",
      title: "Middle Epic",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    mockUseProjects.mockReturnValue({
      projects: [createProject([oldestEpic, newestEpic, middleEpic])],
      loading: false,
      error: null,
    });
    mockUseEpicTicketCounts.mockReturnValue({
      data: {
        newest: 3,
        middle: 2,
        oldest: 1,
      },
    });

    render(<ProjectDetailPage />);

    const renderedEpics = screen.getAllByTestId(/epic-list-item-/);
    expect(renderedEpics.map((epic) => within(epic).getByText(/Epic$/).textContent)).toEqual([
      "Newest Epic",
      "Middle Epic",
      "Oldest Epic",
    ]);
    expect(within(renderedEpics[0]!).getByText("3 tickets")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Epic" }));
    expect(mockOpenEpicModal).toHaveBeenCalledWith("project-1");
  });
});
