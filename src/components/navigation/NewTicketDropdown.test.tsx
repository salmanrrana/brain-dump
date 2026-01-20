import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewTicketDropdown } from "./NewTicketDropdown";

describe("NewTicketDropdown", () => {
  describe("User interactions", () => {
    it("opens dropdown when button is clicked", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown />);

      // Dropdown should not be visible initially
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      // Click the button
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));

      // Dropdown should be visible
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getByText("New Ticket")).toBeInTheDocument();
      expect(screen.getByText("Start from Scratch")).toBeInTheDocument();
    });

    it("closes dropdown when clicking outside", async () => {
      const user = userEvent.setup();
      render(
        <div>
          <NewTicketDropdown />
          <div data-testid="outside">Outside element</div>
        </div>
      );

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Click outside
      await user.click(screen.getByTestId("outside"));

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it('calls onNewTicket when "New Ticket" is clicked', async () => {
      const user = userEvent.setup();
      const handleNewTicket = vi.fn();
      render(<NewTicketDropdown onNewTicket={handleNewTicket} />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));

      // Click "New Ticket" option
      await user.click(screen.getByText("New Ticket"));

      expect(handleNewTicket).toHaveBeenCalledTimes(1);
    });

    it('calls onStartFromScratch when "Start from Scratch" is clicked', async () => {
      const user = userEvent.setup();
      const handleStartFromScratch = vi.fn();
      render(<NewTicketDropdown onStartFromScratch={handleStartFromScratch} />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));

      // Click "Start from Scratch" option
      await user.click(screen.getByText("Start from Scratch"));

      expect(handleStartFromScratch).toHaveBeenCalledTimes(1);
    });

    it("closes dropdown after selecting an option", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown onNewTicket={vi.fn()} />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Click an option
      await user.click(screen.getByText("New Ticket"));

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  describe("Keyboard navigation", () => {
    it("opens dropdown with Enter key", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown />);

      // Focus the button
      await user.tab();
      expect(screen.getByRole("button")).toHaveFocus();

      // Press Enter
      await user.keyboard("{Enter}");

      // Dropdown should open
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("opens dropdown with Space key", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown />);

      // Focus the button
      await user.tab();

      // Press Space
      await user.keyboard(" ");

      // Dropdown should open
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes dropdown with Escape key", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Press Escape
      await user.keyboard("{Escape}");

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("navigates options with arrow keys", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));

      // Press ArrowDown to focus first item
      await user.keyboard("{ArrowDown}");

      // First option should be focused (aria-selected)
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "true");

      // Press ArrowDown again to focus second item
      await user.keyboard("{ArrowDown}");
      expect(options[1]).toHaveAttribute("aria-selected", "true");

      // Press ArrowUp to go back to first item
      await user.keyboard("{ArrowUp}");
      expect(options[0]).toHaveAttribute("aria-selected", "true");
    });

    it("selects focused option with Enter key", async () => {
      const user = userEvent.setup();
      const handleNewTicket = vi.fn();
      render(<NewTicketDropdown onNewTicket={handleNewTicket} />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: /create new ticket/i }));

      // Navigate to first option
      await user.keyboard("{ArrowDown}");

      // Press Enter to select
      await user.keyboard("{Enter}");

      expect(handleNewTicket).toHaveBeenCalledTimes(1);
    });
  });

  describe("Disabled state", () => {
    it("does not open dropdown when disabled", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown disabled />);

      // Click the button
      await user.click(screen.getByRole("button"));

      // Dropdown should not open
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("button is disabled", () => {
      render(<NewTicketDropdown disabled />);
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("Accessibility", () => {
    it("has proper aria attributes", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown />);

      const button = screen.getByRole("button", { name: /create new ticket/i });

      // Check initial aria attributes
      expect(button).toHaveAttribute("aria-haspopup", "listbox");
      expect(button).toHaveAttribute("aria-expanded", "false");

      // Open dropdown
      await user.click(button);

      // Check expanded state
      expect(button).toHaveAttribute("aria-expanded", "true");

      // Check listbox has label
      expect(screen.getByRole("listbox")).toHaveAttribute("aria-label", "New ticket options");
    });

    it("returns focus to button after selection", async () => {
      const user = userEvent.setup();
      render(<NewTicketDropdown onNewTicket={vi.fn()} />);

      const button = screen.getByRole("button", { name: /create new ticket/i });

      // Open dropdown
      await user.click(button);

      // Select an option
      await user.click(screen.getByText("New Ticket"));

      // Focus should return to button
      expect(button).toHaveFocus();
    });
  });
});
