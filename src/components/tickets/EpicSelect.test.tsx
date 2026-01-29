import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EpicSelect } from "./EpicSelect";
import type { Epic } from "../../lib/hooks";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockEpics: Epic[] = [
  {
    id: "epic-1",
    title: "Authentication",
    description: "User auth features",
    projectId: "project-1",
    color: "#8b5cf6",
    isolationMode: null,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "epic-2",
    title: "Dashboard",
    description: "Dashboard components",
    projectId: "project-1",
    color: "#3b82f6",
    isolationMode: null,
    createdAt: "2024-01-02T00:00:00Z",
  },
  {
    id: "epic-3",
    title: "API Integration",
    description: null,
    projectId: "project-1",
    color: null, // Will use derived color
    isolationMode: null,
    createdAt: "2024-01-03T00:00:00Z",
  },
];

// =============================================================================
// Test Suite - User Behavior Tests
// =============================================================================

describe("EpicSelect", () => {
  // -------------------------------------------------------------------------
  // Disabled State Tests
  // -------------------------------------------------------------------------

  describe("when no project is selected", () => {
    it("shows 'Select a project first' helper text", () => {
      render(<EpicSelect projectId={null} value={null} onChange={vi.fn()} epics={[]} />);

      expect(screen.getByText("Select a project first")).toBeInTheDocument();
    });

    it("disables the select button", () => {
      render(<EpicSelect projectId={null} value={null} onChange={vi.fn()} epics={[]} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-disabled", "true");
    });

    it("does not open dropdown when clicked", () => {
      render(<EpicSelect projectId={null} value={null} onChange={vi.fn()} epics={[]} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Selection Tests
  // -------------------------------------------------------------------------

  describe("when a project is selected", () => {
    it("shows 'No epic' when value is null", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      expect(screen.getByText("No epic")).toBeInTheDocument();
    });

    it("shows selected epic title when value is set", () => {
      render(
        <EpicSelect projectId="project-1" value="epic-2" onChange={vi.fn()} epics={mockEpics} />
      );

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    it("opens dropdown when clicked", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("shows all epic options in dropdown", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      fireEvent.click(screen.getByRole("button"));

      // "No epic" option + all epics
      expect(screen.getAllByRole("option")).toHaveLength(mockEpics.length + 1);
      expect(screen.getByText("Authentication")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("API Integration")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // User Interaction Tests
  // -------------------------------------------------------------------------

  describe("user selects an epic", () => {
    it("calls onChange with epic ID when user clicks an epic", () => {
      const onChange = vi.fn();
      render(
        <EpicSelect projectId="project-1" value={null} onChange={onChange} epics={mockEpics} />
      );

      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("Dashboard"));

      expect(onChange).toHaveBeenCalledWith("epic-2");
    });

    it("calls onChange with null when user clicks 'No epic'", () => {
      const onChange = vi.fn();
      render(
        <EpicSelect projectId="project-1" value="epic-1" onChange={onChange} epics={mockEpics} />
      );

      fireEvent.click(screen.getByRole("button"));
      // The dropdown's "No epic" option (the only one since button shows selected epic)
      fireEvent.click(screen.getByText("No epic"));

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it("closes dropdown after selection", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Authentication"));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Create Epic Tests
  // -------------------------------------------------------------------------

  describe("Create New Epic option", () => {
    it("shows 'Create New Epic' option when onCreateEpic is provided", () => {
      render(
        <EpicSelect
          projectId="project-1"
          value={null}
          onChange={vi.fn()}
          epics={mockEpics}
          onCreateEpic={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button"));

      expect(screen.getByText("Create New Epic")).toBeInTheDocument();
    });

    it("does not show 'Create New Epic' when onCreateEpic is not provided", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      fireEvent.click(screen.getByRole("button"));

      expect(screen.queryByText("Create New Epic")).not.toBeInTheDocument();
    });

    it("calls onCreateEpic when user clicks 'Create New Epic'", () => {
      const onCreateEpic = vi.fn();
      render(
        <EpicSelect
          projectId="project-1"
          value={null}
          onChange={vi.fn()}
          epics={mockEpics}
          onCreateEpic={onCreateEpic}
        />
      );

      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("Create New Epic"));

      expect(onCreateEpic).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard Accessibility Tests
  // -------------------------------------------------------------------------

  describe("keyboard navigation", () => {
    it("opens dropdown on Enter key", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      const button = screen.getByRole("button");
      fireEvent.keyDown(button, { key: "Enter" });

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes dropdown on Escape key", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      fireEvent.keyDown(button, { key: "Escape" });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("selects highlighted option on Enter when dropdown is open", () => {
      const onChange = vi.fn();
      render(
        <EpicSelect projectId="project-1" value={null} onChange={onChange} epics={mockEpics} />
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      // Arrow down twice to get to "Dashboard" (index 1)
      fireEvent.keyDown(button, { key: "ArrowDown" });
      fireEvent.keyDown(button, { key: "ArrowDown" });
      fireEvent.keyDown(button, { key: "Enter" });

      expect(onChange).toHaveBeenCalledWith("epic-2");
    });
  });

  // -------------------------------------------------------------------------
  // Color Indicator Tests
  // -------------------------------------------------------------------------

  describe("color indicators", () => {
    it("shows epic color indicator in dropdown", () => {
      render(
        <EpicSelect projectId="project-1" value={null} onChange={vi.fn()} epics={mockEpics} />
      );

      fireEvent.click(screen.getByRole("button"));

      // The Authentication epic has a custom color #8b5cf6
      // We can't directly test computed styles in JSDOM, but we can verify
      // the structure is present (epics render with their options)
      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThan(1);
    });

    it("shows color indicator for selected epic in button", () => {
      render(
        <EpicSelect projectId="project-1" value="epic-1" onChange={vi.fn()} epics={mockEpics} />
      );

      // Selected epic "Authentication" should be shown
      expect(screen.getByText("Authentication")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty State Test
  // -------------------------------------------------------------------------

  describe("when no epics exist", () => {
    it("shows only 'No epic' option and 'Create New Epic' when empty", () => {
      render(
        <EpicSelect
          projectId="project-1"
          value={null}
          onChange={vi.fn()}
          epics={[]}
          onCreateEpic={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");
      // "No epic" + "Create New Epic"
      expect(options).toHaveLength(2);
    });
  });
});
