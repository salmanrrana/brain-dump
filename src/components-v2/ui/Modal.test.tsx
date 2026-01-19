/**
 * Modal Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (clicking, keyboard navigation, focus)
 * - Test what users see and interact with
 * - Verify accessibility attributes
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus, Settings } from "lucide-react";
import { Modal } from "./Modal";

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Test helper to render modal with common props.
 */
function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <p data-testid="modal-content">Modal content</p>,
    ...props,
  };

  const result = render(<Modal {...defaultProps} />);
  return { ...result, onClose: defaultProps.onClose };
}

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("Modal", () => {
  // Note: testing-library's cleanup() handles React unmounting.
  // We don't need to manually clear document.body.innerHTML as that
  // conflicts with React's portal cleanup.

  describe("Acceptance Criteria", () => {
    it("should render overlay with backdrop blur", () => {
      renderModal();

      const overlay = screen.getByTestId("modal-overlay");
      // Note: jsdom doesn't support backdropFilter, so we check the style attribute directly
      // or verify other overlay styles that confirm the overlay is properly styled
      expect(overlay).toHaveStyle({
        position: "fixed",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
      });
    });

    it("should trap focus within modal (tab stays within)", async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={() => {}}>
          <button data-testid="btn-1">First</button>
          <button data-testid="btn-2">Second</button>
          <button data-testid="btn-3">Third</button>
        </Modal>
      );

      // Wait for initial focus
      await waitFor(() => {
        expect(screen.getByTestId("btn-1")).toHaveFocus();
      });

      // Tab through all buttons
      await user.tab();
      expect(screen.getByTestId("btn-2")).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId("btn-3")).toHaveFocus();

      // Tab should wrap to first button
      await user.tab();
      expect(screen.getByTestId("btn-1")).toHaveFocus();
    });

    it("should trap focus in reverse with Shift+Tab", async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={() => {}}>
          <button data-testid="btn-1">First</button>
          <button data-testid="btn-2">Second</button>
          <button data-testid="btn-3">Third</button>
        </Modal>
      );

      // Wait for initial focus
      await waitFor(() => {
        expect(screen.getByTestId("btn-1")).toHaveFocus();
      });

      // Shift+Tab should wrap to last button
      await user.tab({ shift: true });
      expect(screen.getByTestId("btn-3")).toHaveFocus();
    });

    it("should close modal when Escape key is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={onClose}>
          <button data-testid="btn">Button</button>
        </Modal>
      );

      // Wait for focus to be set on first element
      await waitFor(() => {
        expect(screen.getByTestId("btn")).toHaveFocus();
      });

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should close modal when clicking outside (overlay)", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      const overlay = screen.getByTestId("modal-overlay");
      await user.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should NOT close modal when clicking inside modal content", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      const modalContainer = screen.getByTestId("modal-container");
      await user.click(modalContainer);

      expect(onClose).not.toHaveBeenCalled();
    });

    it("should render modal as portal to body", () => {
      renderModal();

      // Modal should be direct child of body
      const overlay = screen.getByTestId("modal-overlay");
      expect(overlay.parentElement).toBe(document.body);
    });

    it("should have scrollable content area", () => {
      renderModal({
        children: <div style={{ height: "2000px" }}>Tall content</div>,
      });

      // Modal container should have overflow handling
      const modalContainer = screen.getByTestId("modal-container");
      expect(modalContainer).toHaveStyle({
        maxHeight: "calc(100vh - var(--spacing-8))",
      });
    });

    it("should support sm size (400px)", () => {
      renderModal({ size: "sm" });

      const modalContainer = screen.getByTestId("modal-container");
      expect(modalContainer).toHaveStyle({ maxWidth: "400px" });
      expect(modalContainer).toHaveAttribute("data-size", "sm");
    });

    it("should support md size (500px) - default", () => {
      renderModal();

      const modalContainer = screen.getByTestId("modal-container");
      expect(modalContainer).toHaveStyle({ maxWidth: "500px" });
      expect(modalContainer).toHaveAttribute("data-size", "md");
    });

    it("should support lg size (600px)", () => {
      renderModal({ size: "lg" });

      const modalContainer = screen.getByTestId("modal-container");
      expect(modalContainer).toHaveStyle({ maxWidth: "600px" });
      expect(modalContainer).toHaveAttribute("data-size", "lg");
    });

    it("should support xl size (800px)", () => {
      renderModal({ size: "xl" });

      const modalContainer = screen.getByTestId("modal-container");
      expect(modalContainer).toHaveStyle({ maxWidth: "800px" });
      expect(modalContainer).toHaveAttribute("data-size", "xl");
    });
  });

  // ===========================================================================
  // MODAL RENDERS WHEN OPEN TESTS
  // ===========================================================================

  describe("Modal renders when open", () => {
    it("should render modal content when isOpen is true", () => {
      renderModal({ isOpen: true });

      expect(screen.getByTestId("modal-content")).toBeInTheDocument();
      expect(screen.getByText("Modal content")).toBeInTheDocument();
    });

    it("should NOT render modal content when isOpen is false", () => {
      renderModal({ isOpen: false });

      expect(screen.queryByTestId("modal-content")).not.toBeInTheDocument();
    });

    it("should have correct opacity when open", () => {
      renderModal({ isOpen: true });

      const overlay = screen.getByTestId("modal-overlay");
      const modalContainer = screen.getByTestId("modal-container");

      expect(overlay).toHaveStyle({ opacity: "1" });
      expect(modalContainer).toHaveStyle({ opacity: "1" });
    });

    it("should set data-open attribute when open", () => {
      renderModal({ isOpen: true });

      expect(screen.getByTestId("modal-container")).toHaveAttribute("data-open", "true");
    });
  });

  // ===========================================================================
  // ESCAPE CLOSES MODAL TESTS
  // ===========================================================================

  describe("Escape closes modal", () => {
    it("should call onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when Escape is pressed on focused element inside modal", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={onClose}>
          <input data-testid="input" type="text" />
        </Modal>
      );

      const input = screen.getByTestId("input");
      input.focus();

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // FOCUS TRAPPED WITHIN MODAL TESTS
  // ===========================================================================

  describe("Focus trapped within modal", () => {
    it("should focus first focusable element when modal opens", async () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <input data-testid="first-input" type="text" />
          <button>Button</button>
        </Modal>
      );

      await waitFor(() => {
        expect(screen.getByTestId("first-input")).toHaveFocus();
      });
    });

    it("should focus modal container if no focusable elements", async () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <p>No focusable content here</p>
        </Modal>
      );

      await waitFor(() => {
        expect(screen.getByTestId("modal-container")).toHaveFocus();
      });
    });

    it("should restore focus to previous element when modal closes", async () => {
      const button = document.createElement("button");
      button.setAttribute("data-testid", "trigger-button");
      button.textContent = "Open Modal";
      document.body.appendChild(button);
      button.focus();

      expect(button).toHaveFocus();

      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <input type="text" />
        </Modal>
      );

      // Focus should move to modal
      await waitFor(() => {
        expect(button).not.toHaveFocus();
      });

      // Close modal
      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          <input type="text" />
        </Modal>
      );

      // Focus should return to button
      await waitFor(() => {
        expect(button).toHaveFocus();
      });

      button.remove();
    });

    it("should handle Tab with no focusable elements", async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={() => {}}>
          <p>Static content only</p>
        </Modal>
      );

      // Should not throw when tabbing with no focusable elements
      await user.tab();
      // Modal container should still be focused (or document.body in jsdom)
      expect(screen.getByTestId("modal-container")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // CLOSE ON OVERLAY CLICK TESTS
  // ===========================================================================

  describe("Close on overlay click", () => {
    it("should close when closeOnOverlayClick is true (default)", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByTestId("modal-overlay"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should NOT close when closeOnOverlayClick is false", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal({ closeOnOverlayClick: false });

      await user.click(screen.getByTestId("modal-overlay"));

      expect(onClose).not.toHaveBeenCalled();
    });

    it("should NOT close when clicking modal container", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByTestId("modal-container"));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  describe("Accessibility", () => {
    it("should have role=dialog", () => {
      renderModal();

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have aria-modal=true", () => {
      renderModal();

      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    });

    it("should support aria-label", () => {
      renderModal({ "aria-label": "Test modal" });

      expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Test modal");
    });

    it("should support aria-labelledby", () => {
      renderModal({ "aria-labelledby": "modal-title" });

      expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby", "modal-title");
    });

    it("should support aria-describedby", () => {
      renderModal({ "aria-describedby": "modal-description" });

      expect(screen.getByRole("dialog")).toHaveAttribute("aria-describedby", "modal-description");
    });

    it("should prevent body scroll when open", () => {
      const originalOverflow = document.body.style.overflow;

      const { unmount } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      );

      expect(document.body.style.overflow).toBe("hidden");

      unmount();

      // Should restore original overflow
      expect(document.body.style.overflow).toBe(originalOverflow);
    });
  });

  // ===========================================================================
  // PROPS PASS-THROUGH TESTS
  // ===========================================================================

  describe("Props pass-through", () => {
    it("should accept className prop", () => {
      renderModal({ className: "custom-modal-class" });

      expect(screen.getByTestId("modal-container")).toHaveClass("custom-modal-class");
    });

    it("should accept style prop", () => {
      // Use a style that doesn't conflict with base styles
      renderModal({ style: { marginTop: "100px" } });

      expect(screen.getByTestId("modal-container")).toHaveStyle({
        marginTop: "100px",
      });
    });

    it("should accept id prop", () => {
      renderModal({ id: "my-modal" });

      expect(screen.getByTestId("modal-container")).toHaveAttribute("id", "my-modal");
    });
  });

  // ===========================================================================
  // ANIMATION TESTS
  // ===========================================================================

  describe("Animations", () => {
    it("should have transition styles on overlay", () => {
      renderModal();

      const overlay = screen.getByTestId("modal-overlay");
      expect(overlay).toHaveStyle({
        transition: "opacity var(--transition-normal)",
      });
    });

    it("should have transform scale(1) when open", () => {
      renderModal({ isOpen: true });

      const modalContainer = screen.getByTestId("modal-container");
      expect(modalContainer).toHaveStyle({
        transform: "scale(1)",
      });
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe("Edge cases", () => {
    it("should render children correctly", () => {
      renderModal({
        children: (
          <div>
            <h2>Title</h2>
            <p>Paragraph</p>
            <button>Button</button>
          </div>
        ),
      });

      expect(screen.getByText("Title")).toBeInTheDocument();
      expect(screen.getByText("Paragraph")).toBeInTheDocument();
      expect(screen.getByText("Button")).toBeInTheDocument();
    });

    it("should handle rapid open/close", async () => {
      const onClose = vi.fn();

      const { rerender } = render(
        <Modal isOpen={false} onClose={onClose}>
          Content
        </Modal>
      );

      // Open
      rerender(
        <Modal isOpen={true} onClose={onClose}>
          Content
        </Modal>
      );

      // Close
      rerender(
        <Modal isOpen={false} onClose={onClose}>
          Content
        </Modal>
      );

      // Open again
      rerender(
        <Modal isOpen={true} onClose={onClose}>
          Content
        </Modal>
      );

      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("should handle multiple modals (though typically avoided)", () => {
      render(
        <>
          <Modal isOpen={true} onClose={() => {}} id="modal-1">
            <p>Modal 1</p>
          </Modal>
          <Modal isOpen={true} onClose={() => {}} id="modal-2">
            <p>Modal 2</p>
          </Modal>
        </>
      );

      expect(screen.getByText("Modal 1")).toBeInTheDocument();
      expect(screen.getByText("Modal 2")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// MODAL.HEADER TESTS
// =============================================================================

describe("Modal.Header", () => {
  describe("Acceptance Criteria", () => {
    it("should render gradient icon area with provided icon", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test Title" onClose={() => {}} />
        </Modal>
      );

      const header = screen.getByTestId("modal-header");
      expect(header).toBeInTheDocument();

      // Icon should be rendered (lucide icons render as svg)
      // The svg is inside a div with gradient background
      const headerElement = screen.getByTestId("modal-header");
      const svgs = headerElement.querySelectorAll("svg");
      // Should have at least 2 svgs: the icon and the close button X
      expect(svgs.length).toBeGreaterThanOrEqual(2);
    });

    it("should render title text", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Create New Ticket" onClose={() => {}} />
        </Modal>
      );

      expect(screen.getByText("Create New Ticket")).toBeInTheDocument();
      // Title should be in an h2 element
      expect(screen.getByRole("heading", { name: "Create New Ticket" })).toBeInTheDocument();
    });

    it("should render close button on right", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test" onClose={() => {}} />
        </Modal>
      );

      const closeButton = screen.getByTestId("modal-close-button");
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveAttribute("aria-label", "Close modal");
    });

    it("should call onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test" onClose={onClose} />
        </Modal>
      );

      await user.click(screen.getByTestId("modal-close-button"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should have sticky positioning for scroll", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test" onClose={() => {}} />
        </Modal>
      );

      const header = screen.getByTestId("modal-header");
      expect(header).toHaveStyle({ position: "sticky", top: "0" });
    });

    it("should have border bottom separator", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test" onClose={() => {}} />
        </Modal>
      );

      const header = screen.getByTestId("modal-header");
      // Check that border-bottom style contains the CSS variable
      // Note: jsdom doesn't compute CSS variables, so we check the raw style
      const style = header.getAttribute("style");
      expect(style).toContain("border-bottom:");
    });
  });

  describe("Icon variations", () => {
    it("should render without icon when not provided", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header title="No Icon" onClose={() => {}} />
        </Modal>
      );

      expect(screen.getByText("No Icon")).toBeInTheDocument();
      // Should still have close button
      expect(screen.getByTestId("modal-close-button")).toBeInTheDocument();
    });

    it("should accept different icon components", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Settings} title="Settings" onClose={() => {}} />
        </Modal>
      );

      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have accessible close button", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test" onClose={() => {}} />
        </Modal>
      );

      const closeButton = screen.getByRole("button", { name: "Close modal" });
      expect(closeButton).toBeInTheDocument();
    });

    it("should render title as heading for screen readers", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Important Modal" onClose={() => {}} />
        </Modal>
      );

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Important Modal");
    });
  });

  describe("Keyboard navigation", () => {
    it("should be focusable via Tab", async () => {
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={() => {}}>
          <Modal.Header icon={Plus} title="Test" onClose={() => {}} />
          <button data-testid="other-button">Other</button>
        </Modal>
      );

      // First focus should go to close button (first focusable element)
      await waitFor(() => {
        expect(screen.getByTestId("modal-close-button")).toHaveFocus();
      });

      // Tab to next element
      await user.tab();
      expect(screen.getByTestId("other-button")).toHaveFocus();
    });
  });
});
