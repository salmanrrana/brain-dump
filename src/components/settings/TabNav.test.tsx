import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabNav, type Tab } from "./TabNav";

// Mock icons for testing
function SettingsIcon({ size }: { size?: number }) {
  return (
    <svg data-testid="settings-icon" width={size} height={size}>
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BotIcon({ size }: { size?: number }) {
  return (
    <svg data-testid="bot-icon" width={size} height={size}>
      <rect x="4" y="4" width="16" height="16" />
    </svg>
  );
}

function GitIcon({ size }: { size?: number }) {
  return (
    <svg data-testid="git-icon" width={size} height={size}>
      <path d="M12 3v18" />
    </svg>
  );
}

function BuildingIcon({ size }: { size?: number }) {
  return (
    <svg data-testid="building-icon" width={size} height={size}>
      <rect x="3" y="3" width="18" height="18" />
    </svg>
  );
}

const mockTabs: Tab[] = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "ralph", label: "Ralph", icon: BotIcon },
  { id: "git", label: "Git", icon: GitIcon },
  { id: "enterprise", label: "Enterprise", icon: BuildingIcon },
];

describe("TabNav", () => {
  describe("Rendering", () => {
    it("renders all tabs with icons and labels", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Ralph" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Git" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Enterprise" })).toBeInTheDocument();

      expect(screen.getByTestId("settings-icon")).toBeInTheDocument();
      expect(screen.getByTestId("bot-icon")).toBeInTheDocument();
      expect(screen.getByTestId("git-icon")).toBeInTheDocument();
      expect(screen.getByTestId("building-icon")).toBeInTheDocument();
    });

    it("renders tablist container with correct role", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      expect(screen.getByRole("tablist")).toBeInTheDocument();
    });
  });

  describe("Active state styling", () => {
    it("applies gradient background to active tab", () => {
      render(<TabNav tabs={mockTabs} activeTab="ralph" onTabChange={() => {}} />);

      const activeTab = screen.getByRole("tab", { name: "Ralph" });
      expect(activeTab).toHaveStyle({ background: "var(--gradient-accent)" });
    });

    it("applies glow shadow to active tab", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      const activeTab = screen.getByRole("tab", { name: "General" });
      expect(activeTab).toHaveStyle({ boxShadow: "var(--shadow-glow-sm)" });
    });

    it("applies transparent background to inactive tabs", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      const inactiveTab = screen.getByRole("tab", { name: "Ralph" });
      expect(inactiveTab).toHaveStyle({ background: "transparent" });
    });

    it("applies secondary text color class to inactive tabs", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      const inactiveTab = screen.getByRole("tab", { name: "Git" });
      // Color is applied via CSS class, not inline style
      expect(inactiveTab.className).toContain("text-[var(--text-secondary)]");
    });
  });

  describe("User click interactions", () => {
    it("calls onTabChange when user clicks a tab", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={handleTabChange} />);

      await user.click(screen.getByRole("tab", { name: "Ralph" }));
      expect(handleTabChange).toHaveBeenCalledWith("ralph");
    });

    it("calls onTabChange with correct tab id for each tab", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={handleTabChange} />);

      await user.click(screen.getByRole("tab", { name: "Git" }));
      expect(handleTabChange).toHaveBeenCalledWith("git");

      await user.click(screen.getByRole("tab", { name: "Enterprise" }));
      expect(handleTabChange).toHaveBeenCalledWith("enterprise");
    });
  });

  describe("Keyboard navigation", () => {
    it("moves focus to next tab with ArrowRight", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={handleTabChange} />);

      // Focus the active tab
      screen.getByRole("tab", { name: "General" }).focus();

      await user.keyboard("{ArrowRight}");
      expect(handleTabChange).toHaveBeenCalledWith("ralph");
      expect(screen.getByRole("tab", { name: "Ralph" })).toHaveFocus();
    });

    it("moves focus to previous tab with ArrowLeft", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="ralph" onTabChange={handleTabChange} />);

      screen.getByRole("tab", { name: "Ralph" }).focus();

      await user.keyboard("{ArrowLeft}");
      expect(handleTabChange).toHaveBeenCalledWith("general");
      expect(screen.getByRole("tab", { name: "General" })).toHaveFocus();
    });

    it("wraps from last tab to first with ArrowRight", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="enterprise" onTabChange={handleTabChange} />);

      screen.getByRole("tab", { name: "Enterprise" }).focus();

      await user.keyboard("{ArrowRight}");
      expect(handleTabChange).toHaveBeenCalledWith("general");
      expect(screen.getByRole("tab", { name: "General" })).toHaveFocus();
    });

    it("wraps from first tab to last with ArrowLeft", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={handleTabChange} />);

      screen.getByRole("tab", { name: "General" }).focus();

      await user.keyboard("{ArrowLeft}");
      expect(handleTabChange).toHaveBeenCalledWith("enterprise");
      expect(screen.getByRole("tab", { name: "Enterprise" })).toHaveFocus();
    });

    it("moves to first tab with Home key", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="git" onTabChange={handleTabChange} />);

      screen.getByRole("tab", { name: "Git" }).focus();

      await user.keyboard("{Home}");
      expect(handleTabChange).toHaveBeenCalledWith("general");
      expect(screen.getByRole("tab", { name: "General" })).toHaveFocus();
    });

    it("moves to last tab with End key", async () => {
      const user = userEvent.setup();
      const handleTabChange = vi.fn();

      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={handleTabChange} />);

      screen.getByRole("tab", { name: "General" }).focus();

      await user.keyboard("{End}");
      expect(handleTabChange).toHaveBeenCalledWith("enterprise");
      expect(screen.getByRole("tab", { name: "Enterprise" })).toHaveFocus();
    });
  });

  describe("Accessibility", () => {
    it("sets aria-selected=true on active tab", () => {
      render(<TabNav tabs={mockTabs} activeTab="ralph" onTabChange={() => {}} />);

      expect(screen.getByRole("tab", { name: "Ralph" })).toHaveAttribute("aria-selected", "true");
    });

    it("sets aria-selected=false on inactive tabs", () => {
      render(<TabNav tabs={mockTabs} activeTab="ralph" onTabChange={() => {}} />);

      expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
        "aria-selected",
        "false"
      );
      expect(screen.getByRole("tab", { name: "Git" })).toHaveAttribute("aria-selected", "false");
    });

    it("sets tabindex=0 only on active tab for roving tabindex", () => {
      render(<TabNav tabs={mockTabs} activeTab="git" onTabChange={() => {}} />);

      expect(screen.getByRole("tab", { name: "Git" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tab", { name: "Ralph" })).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tab", { name: "Enterprise" })).toHaveAttribute("tabindex", "-1");
    });

    it("sets aria-controls linking tab to panel", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute(
        "aria-controls",
        "tabpanel-general"
      );
      expect(screen.getByRole("tab", { name: "Ralph" })).toHaveAttribute(
        "aria-controls",
        "tabpanel-ralph"
      );
    });

    it("sets unique id on each tab for panel linking", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("id", "tab-general");
      expect(screen.getByRole("tab", { name: "Ralph" })).toHaveAttribute("id", "tab-ralph");
    });

    it("has horizontal orientation on tablist", () => {
      render(<TabNav tabs={mockTabs} activeTab="general" onTabChange={() => {}} />);

      expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
    });
  });
});
