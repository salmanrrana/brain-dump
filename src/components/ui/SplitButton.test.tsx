/**
 * Integration tests for SplitButton
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Verify what users SEE and DO
 *
 * Real user behaviors tested:
 * 1. User clicks main button → primary action fires
 * 2. User clicks dropdown → menu opens
 * 3. User selects an option → option handler fires
 * 4. User navigates with keyboard → proper focus management
 * 5. User sees disabled state → interactions are blocked
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SplitButton, type SplitButtonOption } from "./SplitButton";
import { Zap, Container, Code } from "lucide-react";

const defaultOptions: SplitButtonOption[] = [
  { id: "ralph-native", label: "Ralph Native", icon: Zap },
  { id: "ralph-docker", label: "Ralph Docker", icon: Container },
  { id: "opencode", label: "OpenCode", icon: Code },
];

describe("SplitButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders main button with label", () => {
      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
        />
      );

      expect(screen.getByText("Start with Claude")).toBeInTheDocument();
    });

    it("renders dropdown toggle button", () => {
      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      const dropdownBtn = screen.getByTestId("launch-dropdown");
      expect(dropdownBtn).toBeInTheDocument();
      expect(dropdownBtn).toHaveAttribute("aria-haspopup", "menu");
      expect(dropdownBtn).toHaveAttribute("aria-expanded", "false");
    });

    it("does not render dropdown menu initially", () => {
      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      expect(screen.queryByTestId("launch-menu")).not.toBeInTheDocument();
    });
  });

  describe("User clicks main button", () => {
    it("fires primary action when main button is clicked", async () => {
      const user = userEvent.setup();
      const onPrimaryClick = vi.fn();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={onPrimaryClick}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-main"));

      expect(onPrimaryClick).toHaveBeenCalledTimes(1);
    });

    it("does not open dropdown when main button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-main"));

      expect(screen.queryByTestId("launch-menu")).not.toBeInTheDocument();
    });
  });

  describe("User clicks dropdown", () => {
    it("opens dropdown menu when chevron is clicked", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-dropdown"));

      const menu = screen.getByTestId("launch-menu");
      expect(menu).toBeInTheDocument();

      // All options should be visible
      expect(screen.getByText("Ralph Native")).toBeInTheDocument();
      expect(screen.getByText("Ralph Docker")).toBeInTheDocument();
      expect(screen.getByText("OpenCode")).toBeInTheDocument();
    });

    it("closes dropdown when clicking outside", async () => {
      const user = userEvent.setup();

      render(
        <div>
          <SplitButton
            primaryLabel="Start with Claude"
            onPrimaryClick={vi.fn()}
            options={defaultOptions}
            onOptionSelect={vi.fn()}
            testId="launch"
          />
          <button>Outside</button>
        </div>
      );

      // Open dropdown
      await user.click(screen.getByTestId("launch-dropdown"));
      expect(screen.getByTestId("launch-menu")).toBeInTheDocument();

      // Click outside
      await user.click(screen.getByText("Outside"));

      expect(screen.queryByTestId("launch-menu")).not.toBeInTheDocument();
    });

    it("updates aria-expanded when dropdown opens/closes", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      const dropdownBtn = screen.getByTestId("launch-dropdown");

      expect(dropdownBtn).toHaveAttribute("aria-expanded", "false");

      await user.click(dropdownBtn);
      expect(dropdownBtn).toHaveAttribute("aria-expanded", "true");

      await user.click(dropdownBtn);
      expect(dropdownBtn).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("User selects an option", () => {
    it("fires option handler when option is clicked", async () => {
      const user = userEvent.setup();
      const onOptionSelect = vi.fn();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={onOptionSelect}
          testId="launch"
        />
      );

      // Open dropdown
      await user.click(screen.getByTestId("launch-dropdown"));

      // Click an option
      await user.click(screen.getByText("Ralph Docker"));

      expect(onOptionSelect).toHaveBeenCalledWith("ralph-docker");
      expect(onOptionSelect).toHaveBeenCalledTimes(1);
    });

    it("closes dropdown after selecting an option", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-dropdown"));
      await user.click(screen.getByText("OpenCode"));

      expect(screen.queryByTestId("launch-menu")).not.toBeInTheDocument();
    });

    it("does not fire handler for disabled options", async () => {
      const user = userEvent.setup();
      const onOptionSelect = vi.fn();

      const optionsWithDisabled: SplitButtonOption[] = [
        { id: "option1", label: "Enabled" },
        { id: "option2", label: "Disabled", disabled: true },
      ];

      render(
        <SplitButton
          primaryLabel="Start"
          onPrimaryClick={vi.fn()}
          options={optionsWithDisabled}
          onOptionSelect={onOptionSelect}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-dropdown"));
      await user.click(screen.getByText("Disabled"));

      expect(onOptionSelect).not.toHaveBeenCalled();
    });
  });

  describe("Keyboard navigation", () => {
    it("opens dropdown with Enter key on dropdown button", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      screen.getByTestId("launch-dropdown").focus();
      await user.keyboard("{Enter}");

      expect(screen.getByTestId("launch-menu")).toBeInTheDocument();
    });

    it("opens dropdown with ArrowDown key", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      screen.getByTestId("launch-dropdown").focus();
      await user.keyboard("{ArrowDown}");

      expect(screen.getByTestId("launch-menu")).toBeInTheDocument();
    });

    it("navigates options with Arrow keys", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      // Open dropdown and focus first item
      screen.getByTestId("launch-dropdown").focus();
      await user.keyboard("{Enter}");

      const menu = screen.getByTestId("launch-menu");

      // First item should be focused (aria-activedescendant)
      expect(menu).toHaveAttribute("aria-activedescendant", "launch-option-0");

      // Navigate down
      await user.keyboard("{ArrowDown}");
      expect(menu).toHaveAttribute("aria-activedescendant", "launch-option-1");

      // Navigate up
      await user.keyboard("{ArrowUp}");
      expect(menu).toHaveAttribute("aria-activedescendant", "launch-option-0");
    });

    it("wraps around when navigating past first/last", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      screen.getByTestId("launch-dropdown").focus();
      await user.keyboard("{Enter}");

      // Navigate up from first item (should wrap to last)
      await user.keyboard("{ArrowUp}");
      const menu = screen.getByTestId("launch-menu");
      expect(menu).toHaveAttribute("aria-activedescendant", "launch-option-2");
    });

    it("selects option with Enter key", async () => {
      const user = userEvent.setup();
      const onOptionSelect = vi.fn();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={onOptionSelect}
          testId="launch"
        />
      );

      screen.getByTestId("launch-dropdown").focus();
      await user.keyboard("{Enter}"); // Open
      await user.keyboard("{ArrowDown}"); // Move to second
      await user.keyboard("{Enter}"); // Select

      expect(onOptionSelect).toHaveBeenCalledWith("ralph-docker");
    });

    it("closes dropdown with Escape key", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      screen.getByTestId("launch-dropdown").focus();
      await user.keyboard("{Enter}"); // Open
      expect(screen.getByTestId("launch-menu")).toBeInTheDocument();

      await user.keyboard("{Escape}"); // Close
      expect(screen.queryByTestId("launch-menu")).not.toBeInTheDocument();
    });

    it("fires primary action with Enter on main button", async () => {
      const user = userEvent.setup();
      const onPrimaryClick = vi.fn();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={onPrimaryClick}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      screen.getByTestId("launch-main").focus();
      await user.keyboard("{Enter}");

      expect(onPrimaryClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Disabled state", () => {
    it("disables both buttons when disabled prop is true", () => {
      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          disabled
          testId="launch"
        />
      );

      expect(screen.getByTestId("launch-main")).toBeDisabled();
      expect(screen.getByTestId("launch-dropdown")).toBeDisabled();
    });

    it("does not fire primary action when disabled", async () => {
      const user = userEvent.setup();
      const onPrimaryClick = vi.fn();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={onPrimaryClick}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          disabled
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-main"));

      expect(onPrimaryClick).not.toHaveBeenCalled();
    });

    it("does not open dropdown when disabled", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          disabled
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-dropdown"));

      expect(screen.queryByTestId("launch-menu")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA roles on menu", async () => {
      const user = userEvent.setup();

      render(
        <SplitButton
          primaryLabel="Start with Claude"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-dropdown"));

      const menu = screen.getByTestId("launch-menu");
      expect(menu).toHaveAttribute("role", "menu");

      // Options should have menuitem role
      const menuItems = within(menu).getAllByRole("menuitem");
      expect(menuItems).toHaveLength(3);
    });

    it("marks disabled options with aria-disabled", async () => {
      const user = userEvent.setup();

      const optionsWithDisabled: SplitButtonOption[] = [
        { id: "enabled", label: "Enabled" },
        { id: "disabled", label: "Disabled", disabled: true },
      ];

      render(
        <SplitButton
          primaryLabel="Start"
          onPrimaryClick={vi.fn()}
          options={optionsWithDisabled}
          onOptionSelect={vi.fn()}
          testId="launch"
        />
      );

      await user.click(screen.getByTestId("launch-dropdown"));

      expect(screen.getByTestId("launch-option-disabled")).toHaveAttribute("aria-disabled", "true");
    });

    it("uses custom dropdown aria-label", () => {
      render(
        <SplitButton
          primaryLabel="Start"
          onPrimaryClick={vi.fn()}
          options={defaultOptions}
          onOptionSelect={vi.fn()}
          dropdownAriaLabel="Show alternative launch options"
          testId="launch"
        />
      );

      expect(screen.getByTestId("launch-dropdown")).toHaveAttribute(
        "aria-label",
        "Show alternative launch options"
      );
    });
  });
});
