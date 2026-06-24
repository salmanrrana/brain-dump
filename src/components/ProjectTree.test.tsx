import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProjectTree from "./ProjectTree";
import type { ProjectWithEpics } from "../lib/hooks";

const customOrderedProjects: ProjectWithEpics[] = [
  {
    id: "gamma",
    name: "Gamma Project",
    path: "/tmp/gamma",
    color: "#f97316",
    position: 3,
    workingMethod: "auto",
    createdAt: "2026-01-03T00:00:00Z",
    epics: [],
  },
  {
    id: "alpha",
    name: "Alpha Project",
    path: "/tmp/alpha",
    color: "#8b5cf6",
    position: 1,
    workingMethod: "auto",
    createdAt: "2026-01-01T00:00:00Z",
    epics: [],
  },
  {
    id: "beta",
    name: "Beta Project",
    path: "/tmp/beta",
    color: "#10b981",
    position: 2,
    workingMethod: "auto",
    createdAt: "2026-01-02T00:00:00Z",
    epics: [],
  },
];

describe("ProjectTree", () => {
  it("renders projects in the incoming custom order", () => {
    render(
      <ProjectTree
        projects={customOrderedProjects}
        selectedProjectId={null}
        selectedEpicId={null}
        onSelectProject={vi.fn()}
        onSelectEpic={vi.fn()}
        onAddProject={vi.fn()}
        onAddEpic={vi.fn()}
      />
    );

    expect(screen.getAllByText(/Project$/).map((project) => project.textContent)).toEqual([
      "Gamma Project",
      "Alpha Project",
      "Beta Project",
    ]);
  });
});
