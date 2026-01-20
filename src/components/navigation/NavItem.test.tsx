import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavItem } from "./NavItem";

// Simple mock icon for testing
function HomeIcon({ size }: { size?: number }) {
  return (
    <svg data-testid="home-icon" width={size} height={size}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );
}

describe("NavItem", () => {
  describe("Rendering", () => {
    it("renders icon centered in button", () => {
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button", { name: "Home" });
      expect(button).toBeInTheDocument();
      expect(screen.getByTestId("home-icon")).toBeInTheDocument();
    });

    it("has correct default size (44px square)", () => {
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ width: "44px", height: "44px" });
    });

    it("accepts custom size", () => {
      render(<NavItem icon={HomeIcon} label="Home" size={56} />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ width: "56px", height: "56px" });
    });
  });

  describe("Tooltip", () => {
    it("shows tooltip on hover", async () => {
      const user = userEvent.setup();
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button");
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      await user.hover(button);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent("Home");
      });
    });

    it("hides tooltip on mouse leave", async () => {
      const user = userEvent.setup();
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button");
      await user.hover(button);
      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
      });

      await user.unhover(button);
      await waitFor(() => {
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });
    });

    it("shows tooltip on focus for keyboard navigation", async () => {
      const user = userEvent.setup();
      render(<NavItem icon={HomeIcon} label="Dashboard" />);

      await user.tab();
      expect(screen.getByRole("button")).toHaveFocus();

      await waitFor(() => {
        expect(screen.getByRole("tooltip")).toHaveTextContent("Dashboard");
      });
    });
  });

  describe("Active state", () => {
    it("applies gradient background and glow when active", () => {
      render(<NavItem icon={HomeIcon} label="Home" active />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ background: "var(--gradient-accent)" });
      expect(button).toHaveStyle({ boxShadow: "var(--shadow-glow)" });
    });

    it("has white icon color when active", () => {
      render(<NavItem icon={HomeIcon} label="Home" active />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ color: "#ffffff" });
    });

    it("has gray icon color when inactive", () => {
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ color: "var(--text-secondary)" });
    });

    it("sets data-active attribute when active", () => {
      render(<NavItem icon={HomeIcon} label="Home" active />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("data-active", "true");
    });

    it("does not have data-active when inactive", () => {
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button");
      expect(button).not.toHaveAttribute("data-active");
    });
  });

  describe("Accessibility", () => {
    it('has aria-current="page" when active', () => {
      render(<NavItem icon={HomeIcon} label="Home" active />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-current", "page");
    });

    it("does not have aria-current when inactive", () => {
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button");
      expect(button).not.toHaveAttribute("aria-current");
    });

    it("uses label as aria-label", () => {
      render(<NavItem icon={HomeIcon} label="Dashboard" />);

      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    });

    it("passes aria-hidden to icon component", () => {
      // The NavItem component passes aria-hidden="true" to the Icon component
      // We verify by checking the button only has the label as accessible name
      render(<NavItem icon={HomeIcon} label="Home" />);

      const button = screen.getByRole("button", { name: "Home" });
      // The icon content is not included in the accessible name
      expect(button).toHaveAccessibleName("Home");
    });
  });

  describe("Keyboard navigation", () => {
    it("is focusable with Tab", async () => {
      const user = userEvent.setup();
      render(<NavItem icon={HomeIcon} label="Home" />);

      await user.tab();
      expect(screen.getByRole("button")).toHaveFocus();
    });

    it("triggers onClick with Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<NavItem icon={HomeIcon} label="Home" onClick={handleClick} />);

      await user.tab();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("triggers onClick with Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<NavItem icon={HomeIcon} label="Home" onClick={handleClick} />);

      await user.tab();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("User interactions", () => {
    it("fires onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<NavItem icon={HomeIcon} label="Home" onClick={handleClick} />);

      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not fire onClick when disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<NavItem icon={HomeIcon} label="Home" onClick={handleClick} disabled />);

      await user.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("applies disabled styling", () => {
      render(<NavItem icon={HomeIcon} label="Home" disabled />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveStyle({ opacity: "0.5", cursor: "not-allowed" });
    });
  });

  describe("Props forwarding", () => {
    it("forwards ref to button element", () => {
      const ref = vi.fn();
      render(<NavItem icon={HomeIcon} label="Home" ref={ref} />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLButtonElement);
    });

    it("merges custom className", () => {
      render(<NavItem icon={HomeIcon} label="Home" className="custom-class" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("custom-class");
    });
  });
});
