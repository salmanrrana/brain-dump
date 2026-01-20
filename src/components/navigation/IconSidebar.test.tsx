import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconSidebar } from "./IconSidebar";
import { Home } from "lucide-react";

describe("IconSidebar", () => {
  // Helper to get the sidebar by its specific aria-label
  const getSidebar = () => screen.getByRole("navigation", { name: "Main navigation" });

  describe("Rendering", () => {
    it("renders all 4 default nav items", () => {
      render(<IconSidebar />);

      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Board" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });

    it("renders in a nav element with proper role", () => {
      render(<IconSidebar />);

      expect(getSidebar()).toBeInTheDocument();
    });

    it("has 64px fixed width", () => {
      render(<IconSidebar />);

      const sidebar = getSidebar();
      expect(sidebar).toHaveStyle({ width: "64px", minWidth: "64px" });
    });

    it("has full viewport height", () => {
      render(<IconSidebar />);

      const sidebar = getSidebar();
      expect(sidebar).toHaveStyle({ height: "100vh" });
    });

    it("uses --bg-secondary background", () => {
      render(<IconSidebar />);

      const sidebar = getSidebar();
      expect(sidebar).toHaveStyle({ background: "var(--bg-secondary)" });
    });

    it("renders custom nav items when provided", () => {
      const customItems = [
        { icon: Home, label: "Home", path: "/home" },
        { icon: Home, label: "Profile", path: "/profile" },
      ];

      render(<IconSidebar navItems={customItems} />);

      expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    });

    it("renders footer content when provided", () => {
      render(<IconSidebar footer={<span data-testid="footer-content">Footer</span>} />);

      expect(screen.getByTestId("footer-content")).toBeInTheDocument();
    });
  });

  describe("Active item highlighting", () => {
    it("highlights Dashboard when activePath is /dashboard", () => {
      render(<IconSidebar activePath="/dashboard" />);

      const dashboardButton = screen.getByRole("button", { name: "Dashboard" });
      expect(dashboardButton).toHaveAttribute("aria-current", "page");
    });

    it("highlights Board when activePath is /", () => {
      render(<IconSidebar activePath="/" />);

      const boardButton = screen.getByRole("button", { name: "Board" });
      expect(boardButton).toHaveAttribute("aria-current", "page");
    });

    it("does not highlight action items (Projects, Settings)", () => {
      render(<IconSidebar activePath="/" />);

      const projectsButton = screen.getByRole("button", { name: "Projects" });
      const settingsButton = screen.getByRole("button", { name: "Settings" });

      expect(projectsButton).not.toHaveAttribute("aria-current");
      expect(settingsButton).not.toHaveAttribute("aria-current");
    });

    it("defaults to / when no activePath provided", () => {
      render(<IconSidebar />);

      const boardButton = screen.getByRole("button", { name: "Board" });
      expect(boardButton).toHaveAttribute("aria-current", "page");
    });
  });

  describe("Navigation", () => {
    it("calls onNavigate with path when route item is clicked", async () => {
      const user = userEvent.setup();
      const handleNavigate = vi.fn();

      render(<IconSidebar onNavigate={handleNavigate} />);

      await user.click(screen.getByRole("button", { name: "Dashboard" }));
      expect(handleNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("calls onNavigate for Board item", async () => {
      const user = userEvent.setup();
      const handleNavigate = vi.fn();

      render(<IconSidebar onNavigate={handleNavigate} />);

      await user.click(screen.getByRole("button", { name: "Board" }));
      expect(handleNavigate).toHaveBeenCalledWith("/");
    });

    it("calls onAction with action name when action item is clicked", async () => {
      const user = userEvent.setup();
      const handleAction = vi.fn();

      render(<IconSidebar onAction={handleAction} />);

      await user.click(screen.getByRole("button", { name: "Projects" }));
      expect(handleAction).toHaveBeenCalledWith("openProjectsPanel");
    });

    it("calls onAction for Settings item", async () => {
      const user = userEvent.setup();
      const handleAction = vi.fn();

      render(<IconSidebar onAction={handleAction} />);

      await user.click(screen.getByRole("button", { name: "Settings" }));
      expect(handleAction).toHaveBeenCalledWith("openSettings");
    });

    it("does not throw when clicking without handlers", async () => {
      const user = userEvent.setup();

      render(<IconSidebar />);

      // Should not throw
      await user.click(screen.getByRole("button", { name: "Dashboard" }));
      await user.click(screen.getByRole("button", { name: "Projects" }));
    });
  });

  describe("Keyboard navigation", () => {
    it("all nav items are focusable with Tab", async () => {
      const user = userEvent.setup();

      render(<IconSidebar />);

      await user.tab();
      expect(screen.getByRole("button", { name: "Dashboard" })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole("button", { name: "Board" })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole("button", { name: "Projects" })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
    });

    it("triggers navigation with Enter key", async () => {
      const user = userEvent.setup();
      const handleNavigate = vi.fn();

      render(<IconSidebar onNavigate={handleNavigate} />);

      await user.tab();
      await user.keyboard("{Enter}");

      expect(handleNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("triggers action with Space key", async () => {
      const user = userEvent.setup();
      const handleAction = vi.fn();

      render(<IconSidebar onAction={handleAction} />);

      // Tab to Projects (3rd item)
      await user.tab();
      await user.tab();
      await user.tab();
      await user.keyboard(" ");

      expect(handleAction).toHaveBeenCalledWith("openProjectsPanel");
    });
  });

  describe("Accessibility", () => {
    it("sidebar has role navigation with aria-label", () => {
      render(<IconSidebar />);

      expect(getSidebar()).toBeInTheDocument();
    });

    it("active item has aria-current=page", () => {
      render(<IconSidebar activePath="/dashboard" />);

      const dashboardButton = screen.getByRole("button", { name: "Dashboard" });
      expect(dashboardButton).toHaveAttribute("aria-current", "page");
    });

    it("inactive items do not have aria-current", () => {
      render(<IconSidebar activePath="/dashboard" />);

      const boardButton = screen.getByRole("button", { name: "Board" });
      expect(boardButton).not.toHaveAttribute("aria-current");
    });
  });
});
