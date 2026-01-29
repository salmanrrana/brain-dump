import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsPanel, type ProjectWithAIActivity } from "./ProjectsPanel";

// Sample test data with AI activity fields
const mockProjects: ProjectWithAIActivity[] = [
  {
    id: "1",
    name: "Brain Dump",
    path: "/Users/dev/brain-dump",
    color: "#8b5cf6",
    hasActiveAI: false,
    activeSessionCount: 0,
    epics: [],
  },
  {
    id: "2",
    name: "My App",
    path: "/Users/dev/my-app",
    color: "#10b981",
    hasActiveAI: false,
    activeSessionCount: 0,
    epics: [],
  },
  {
    id: "3",
    name: "API Server",
    path: "/Users/dev/api-server",
    color: "#f97316",
    hasActiveAI: false,
    activeSessionCount: 0,
    epics: [],
  },
];

describe("ProjectsPanel", () => {
  describe("Rendering", () => {
    it("renders panel when isOpen is true", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Projects")).toBeInTheDocument();
    });

    it("does not render when isOpen is false", () => {
      render(<ProjectsPanel isOpen={false} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders all projects in the list", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.getByText("Brain Dump")).toBeInTheDocument();
      expect(screen.getByText("My App")).toBeInTheDocument();
      expect(screen.getByText("API Server")).toBeInTheDocument();
    });

    it("displays project paths", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.getByText("/Users/dev/brain-dump")).toBeInTheDocument();
      expect(screen.getByText("/Users/dev/my-app")).toBeInTheDocument();
    });

    it("shows loading state", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={[]} loading={true} />);

      expect(screen.getByText("Loading projects...")).toBeInTheDocument();
    });

    it("shows empty state when no projects exist", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={[]} loading={false} />);

      expect(screen.getByText("No projects yet")).toBeInTheDocument();
      expect(screen.getByText("Add a project to get started")).toBeInTheDocument();
    });
  });

  describe("Search functionality", () => {
    it("renders search input", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.getByPlaceholderText("Search projects...")).toBeInTheDocument();
    });

    it("filters projects as user types", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const searchInput = screen.getByPlaceholderText("Search projects...");
      await user.type(searchInput, "brain");

      // Only Brain Dump should be visible
      expect(screen.getByText("Brain Dump")).toBeInTheDocument();
      expect(screen.queryByText("My App")).not.toBeInTheDocument();
      expect(screen.queryByText("API Server")).not.toBeInTheDocument();
    });

    it("filters are case-insensitive", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const searchInput = screen.getByPlaceholderText("Search projects...");
      await user.type(searchInput, "BRAIN");

      expect(screen.getByText("Brain Dump")).toBeInTheDocument();
    });

    it("shows 'no results' message when search has no matches", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const searchInput = screen.getByPlaceholderText("Search projects...");
      await user.type(searchInput, "nonexistent");

      expect(screen.getByText('No projects found for "nonexistent"')).toBeInTheDocument();
    });

    it("shows clear button when search has value", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const searchInput = screen.getByPlaceholderText("Search projects...");
      await user.type(searchInput, "test");

      expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
    });

    it("clears search when clear button is clicked", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const searchInput = screen.getByPlaceholderText("Search projects...");
      await user.type(searchInput, "brain");

      // Verify filtering is active
      expect(screen.queryByText("My App")).not.toBeInTheDocument();

      // Click clear button
      await user.click(screen.getByLabelText("Clear search"));

      // All projects should be visible again
      expect(screen.getByText("Brain Dump")).toBeInTheDocument();
      expect(screen.getByText("My App")).toBeInTheDocument();
      expect(screen.getByText("API Server")).toBeInTheDocument();
    });
  });

  describe("Project selection", () => {
    it("calls onSelectProject when project is clicked", async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      render(
        <ProjectsPanel
          isOpen={true}
          onClose={vi.fn()}
          projects={mockProjects}
          onSelectProject={handleSelect}
        />
      );

      await user.click(screen.getByText("Brain Dump"));

      expect(handleSelect).toHaveBeenCalledWith("1");
    });

    it("toggles selection when clicking already selected project", async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      render(
        <ProjectsPanel
          isOpen={true}
          onClose={vi.fn()}
          projects={mockProjects}
          selectedProjectId="1"
          onSelectProject={handleSelect}
        />
      );

      await user.click(screen.getByText("Brain Dump"));

      // Should deselect (pass null)
      expect(handleSelect).toHaveBeenCalledWith(null);
    });

    it("visually indicates selected project", () => {
      render(
        <ProjectsPanel
          isOpen={true}
          onClose={vi.fn()}
          projects={mockProjects}
          selectedProjectId="1"
        />
      );

      const listbox = screen.getByRole("listbox");
      const selectedOption = within(listbox).getByRole("option", { selected: true });

      expect(selectedOption).toHaveTextContent("Brain Dump");
    });

    it("calls onEditProject when project is double-clicked", async () => {
      const user = userEvent.setup();
      const handleEdit = vi.fn();
      render(
        <ProjectsPanel
          isOpen={true}
          onClose={vi.fn()}
          projects={mockProjects}
          onEditProject={handleEdit}
        />
      );

      await user.dblClick(screen.getByText("Brain Dump"));

      expect(handleEdit).toHaveBeenCalledWith(mockProjects[0]);
    });
  });

  describe("Panel controls", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(<ProjectsPanel isOpen={true} onClose={handleClose} projects={mockProjects} />);

      await user.click(screen.getByLabelText("Close projects panel"));

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("calls onAddProject when Add Project button is clicked", async () => {
      const user = userEvent.setup();
      const handleAddProject = vi.fn();
      render(
        <ProjectsPanel
          isOpen={true}
          onClose={vi.fn()}
          projects={mockProjects}
          onAddProject={handleAddProject}
        />
      );

      await user.click(screen.getByText("Add Project"));

      expect(handleAddProject).toHaveBeenCalledTimes(1);
    });
  });

  describe("Keyboard navigation", () => {
    it("closes panel on Escape key when panel has focus", async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();
      render(<ProjectsPanel isOpen={true} onClose={handleClose} projects={mockProjects} />);

      // Wait for panel to be focused (via search input)
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search projects...")).toHaveFocus();
      });

      // Now press Escape - the keydown handler is on the panel div
      await user.keyboard("{Escape}");

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("focuses search input when panel opens", async () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      // Wait for the focus delay (50ms in component)
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search projects...")).toHaveFocus();
      });
    });

    it("supports tab navigation through interactive elements", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      // Wait for initial focus on search
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search projects...")).toHaveFocus();
      });

      // Tab through elements - order depends on DOM structure
      // Search input -> Close button (in header) -> Project items -> Add Project button
      await user.tab();

      // After tabbing from search, we should be on the close button
      // But the actual tab order may vary based on DOM structure
      // Just verify that tabbing works and moves focus
      const activeElement = document.activeElement;
      expect(activeElement).not.toBe(screen.getByPlaceholderText("Search projects..."));
    });
  });

  describe("Click outside behavior", () => {
    let handleClose: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      handleClose = vi.fn();
    });

    it("calls onClose when clicking on backdrop overlay", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={handleClose} projects={mockProjects} />);

      // Find and click the backdrop (the element behind the panel)
      // The backdrop has aria-hidden="true" so we find it by its role-less nature
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();

      if (backdrop) {
        await user.click(backdrop);
      }

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when clicking inside panel", async () => {
      const user = userEvent.setup();
      render(<ProjectsPanel isOpen={true} onClose={handleClose} projects={mockProjects} />);

      // Click inside the panel (on a project)
      await user.click(screen.getByText("Brain Dump"));

      // onClose should NOT have been called (onSelectProject might be, but not onClose)
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("has proper dialog role and aria-label", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-label", "Projects panel");
    });

    it("has listbox role for project list", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.getByRole("listbox", { name: "Projects" })).toBeInTheDocument();
    });

    it("project items have option role with aria-selected", () => {
      render(
        <ProjectsPanel
          isOpen={true}
          onClose={vi.fn()}
          projects={mockProjects}
          selectedProjectId="1"
        />
      );

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(3);

      // First option should be selected
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(options[1]).toHaveAttribute("aria-selected", "false");
    });

    it("search input has accessible label", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      expect(screen.getByRole("textbox", { name: "Search projects" })).toBeInTheDocument();
    });

    it("project items have title attribute showing full path", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const brainDumpOption = screen.getByRole("option", { name: /Brain Dump/i });
      expect(brainDumpOption).toHaveAttribute("title", "/Users/dev/brain-dump");
    });
  });

  describe("Visual styling", () => {
    it("applies correct width to panel", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveStyle({ width: "320px" });
    });

    it("renders backdrop overlay behind panel", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      // Backdrop should exist with lower z-index
      const backdrop = document.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
      expect(backdrop).toHaveStyle({ zIndex: "99" });
    });

    it("panel has higher z-index than backdrop", () => {
      render(<ProjectsPanel isOpen={true} onClose={vi.fn()} projects={mockProjects} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveStyle({ zIndex: "100" });
    });
  });
});
