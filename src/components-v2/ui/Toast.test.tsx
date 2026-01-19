/**
 * Toast Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (what users see and interact with)
 * - Verify accessibility features work correctly
 * - Test component lifecycle (mount, dismiss, auto-dismiss)
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Toast, ToastContainer, type ToastData } from "./Toast";

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// TOAST COMPONENT TESTS
// =============================================================================

describe("Toast", () => {
  // ===========================================================================
  // RENDERING TESTS
  // ===========================================================================

  describe("Rendering", () => {
    it("should render with message", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test message" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toBeInTheDocument();
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Test message");
    });

    it("should render with correct role and aria attributes", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Accessible toast" onDismiss={onDismiss} />);

      const toast = screen.getByRole("alert");
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveAttribute("aria-live", "polite");
    });

    it("should render dismiss button with aria-label", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test" onDismiss={onDismiss} />);

      const dismissButton = screen.getByTestId("toast-dismiss");
      expect(dismissButton).toHaveAttribute("aria-label", "Dismiss notification");
    });

    it("should render icon for the variant", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test" variant="success" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast-icon")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // VARIANT TESTS
  // ===========================================================================

  describe("Variants", () => {
    it("should render success variant", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Success!" variant="success" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "success");
    });

    it("should render error variant", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Error!" variant="error" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "error");
    });

    it("should render info variant", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Info!" variant="info" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "info");
    });

    it("should default to info variant when not specified", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Default variant" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "info");
    });
  });

  // ===========================================================================
  // DISMISS TESTS
  // ===========================================================================

  describe("Manual Dismiss", () => {
    it("should call onDismiss when dismiss button is clicked", async () => {
      const onDismiss = vi.fn();
      render(<Toast message="Dismissable" onDismiss={onDismiss} duration={0} />);

      const dismissButton = screen.getByTestId("toast-dismiss");
      fireEvent.click(dismissButton);

      // Wait for the exit animation timeout
      act(() => {
        vi.advanceTimersByTime(150);
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // AUTO-DISMISS TESTS
  // ===========================================================================

  describe("Auto-Dismiss", () => {
    it("should auto-dismiss after default duration (3000ms)", async () => {
      const onDismiss = vi.fn();
      render(<Toast message="Auto dismiss" onDismiss={onDismiss} />);

      expect(onDismiss).not.toHaveBeenCalled();

      // Advance past the 3000ms duration + 150ms animation
      act(() => {
        vi.advanceTimersByTime(3150);
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("should auto-dismiss after custom duration", async () => {
      const onDismiss = vi.fn();
      render(<Toast message="Custom duration" duration={1000} onDismiss={onDismiss} />);

      // Should not dismiss before duration
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      // Should dismiss after duration + animation
      act(() => {
        vi.advanceTimersByTime(650);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("should not auto-dismiss when duration is 0", async () => {
      const onDismiss = vi.fn();
      render(<Toast message="No auto dismiss" duration={0} onDismiss={onDismiss} />);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // ANIMATION TESTS
  // ===========================================================================

  describe("Animation", () => {
    it("should start with hidden state and animate in", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Animated" onDismiss={onDismiss} duration={0} />);

      // Initial render should have transition styles
      const toast = screen.getByTestId("toast");
      expect(toast.style.transition).toContain("opacity");
      expect(toast.style.transition).toContain("transform");
    });
  });

  // ===========================================================================
  // CUSTOM PROPS TESTS
  // ===========================================================================

  describe("Custom Props", () => {
    it("should accept custom className", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test" className="custom-class" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toHaveClass("custom-class");
    });

    it("should accept custom id", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test" id="custom-id" onDismiss={onDismiss} />);

      expect(screen.getByTestId("toast")).toHaveAttribute("id", "custom-id");
    });

    it("should accept ReactNode as message", () => {
      const onDismiss = vi.fn();
      render(
        <Toast
          message={
            <span data-testid="custom-message">
              Custom <strong>message</strong>
            </span>
          }
          onDismiss={onDismiss}
        />
      );

      expect(screen.getByTestId("custom-message")).toBeInTheDocument();
      expect(screen.getByText("message")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // HOVER INTERACTION TESTS
  // ===========================================================================

  describe("Hover Interactions", () => {
    it("should change dismiss button style on hover", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test" onDismiss={onDismiss} duration={0} />);

      const dismissButton = screen.getByTestId("toast-dismiss");

      // Trigger mouseOver
      fireEvent.mouseOver(dismissButton);
      expect(dismissButton.style.backgroundColor).toBe("var(--bg-hover)");

      // Trigger mouseOut
      fireEvent.mouseOut(dismissButton);
      expect(dismissButton.style.backgroundColor).toBe("transparent");
    });

    it("should change dismiss button style on focus", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Test" onDismiss={onDismiss} duration={0} />);

      const dismissButton = screen.getByTestId("toast-dismiss");

      // Trigger focus
      fireEvent.focus(dismissButton);
      expect(dismissButton.style.backgroundColor).toBe("var(--bg-hover)");

      // Trigger blur
      fireEvent.blur(dismissButton);
      expect(dismissButton.style.backgroundColor).toBe("transparent");
    });
  });
});

// =============================================================================
// TOAST CONTAINER TESTS
// =============================================================================

describe("ToastContainer", () => {
  // ===========================================================================
  // RENDERING TESTS
  // ===========================================================================

  describe("Rendering", () => {
    it("should not render when toasts array is empty", () => {
      render(<ToastContainer toasts={[]} onRemove={vi.fn()} />);

      expect(screen.queryByTestId("toast-container")).not.toBeInTheDocument();
    });

    it("should render container with toasts", () => {
      const toasts: ToastData[] = [
        { id: "1", message: "Toast 1", variant: "success", duration: 0 },
      ];
      render(<ToastContainer toasts={toasts} onRemove={vi.fn()} />);

      expect(screen.getByTestId("toast-container")).toBeInTheDocument();
      expect(screen.getByText("Toast 1")).toBeInTheDocument();
    });

    it("should render multiple toasts stacked", () => {
      const toasts: ToastData[] = [
        { id: "1", message: "First toast", variant: "success", duration: 0 },
        { id: "2", message: "Second toast", variant: "error", duration: 0 },
        { id: "3", message: "Third toast", variant: "info", duration: 0 },
      ];
      render(<ToastContainer toasts={toasts} onRemove={vi.fn()} />);

      expect(screen.getByText("First toast")).toBeInTheDocument();
      expect(screen.getByText("Second toast")).toBeInTheDocument();
      expect(screen.getByText("Third toast")).toBeInTheDocument();
    });

    it("should render to body via portal", () => {
      const toasts: ToastData[] = [
        { id: "1", message: "Portal toast", variant: "info", duration: 0 },
      ];
      render(
        <div data-testid="app-root">
          <ToastContainer toasts={toasts} onRemove={vi.fn()} />
        </div>
      );

      // Container should be a direct child of body, not inside app-root
      const container = screen.getByTestId("toast-container");
      expect(container.parentElement).toBe(document.body);
    });
  });

  // ===========================================================================
  // REMOVAL TESTS
  // ===========================================================================

  describe("Toast Removal", () => {
    it("should call onRemove with toast id when dismissed", () => {
      const onRemove = vi.fn();
      const toasts: ToastData[] = [
        { id: "toast-123", message: "Dismissable", variant: "success", duration: 0 },
      ];
      render(<ToastContainer toasts={toasts} onRemove={onRemove} />);

      const dismissButton = screen.getByTestId("toast-dismiss");
      fireEvent.click(dismissButton);

      // Wait for animation
      act(() => {
        vi.advanceTimersByTime(150);
      });

      expect(onRemove).toHaveBeenCalledWith("toast-123");
    });

    it("should call onRemove when toast auto-dismisses", () => {
      const onRemove = vi.fn();
      const toasts: ToastData[] = [
        { id: "auto-toast", message: "Auto dismiss", variant: "info", duration: 2000 },
      ];
      render(<ToastContainer toasts={toasts} onRemove={onRemove} />);

      // Advance past duration + animation
      act(() => {
        vi.advanceTimersByTime(2150);
      });

      expect(onRemove).toHaveBeenCalledWith("auto-toast");
    });
  });

  // ===========================================================================
  // STYLING TESTS
  // ===========================================================================

  describe("Styling", () => {
    it("should position container in top-right corner", () => {
      const toasts: ToastData[] = [
        { id: "1", message: "Positioned", variant: "info", duration: 0 },
      ];
      render(<ToastContainer toasts={toasts} onRemove={vi.fn()} />);

      const container = screen.getByTestId("toast-container");
      expect(container.style.position).toBe("fixed");
      expect(container.style.top).toBe("var(--spacing-4)");
      expect(container.style.right).toBe("var(--spacing-4)");
    });

    it("should stack toasts vertically with gap", () => {
      const toasts: ToastData[] = [
        { id: "1", message: "First", variant: "success", duration: 0 },
        { id: "2", message: "Second", variant: "error", duration: 0 },
      ];
      render(<ToastContainer toasts={toasts} onRemove={vi.fn()} />);

      const container = screen.getByTestId("toast-container");
      expect(container.style.flexDirection).toBe("column");
      expect(container.style.gap).toBe("var(--spacing-3)");
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe("Toast Integration", () => {
  it("should handle a complete toast lifecycle", async () => {
    const onRemove = vi.fn();
    const toasts: ToastData[] = [
      { id: "lifecycle-test", message: "Full lifecycle", variant: "success", duration: 1000 },
    ];

    const { rerender } = render(<ToastContainer toasts={toasts} onRemove={onRemove} />);

    // Toast should be visible
    expect(screen.getByText("Full lifecycle")).toBeInTheDocument();

    // Wait for auto-dismiss
    act(() => {
      vi.advanceTimersByTime(1150);
    });

    expect(onRemove).toHaveBeenCalledWith("lifecycle-test");

    // Simulate removing from parent state
    rerender(<ToastContainer toasts={[]} onRemove={onRemove} />);

    // Container should not render
    expect(screen.queryByTestId("toast-container")).not.toBeInTheDocument();
  });

  it("should handle adding and removing multiple toasts", async () => {
    const onRemove = vi.fn();
    const initialToasts: ToastData[] = [
      { id: "1", message: "First", variant: "success", duration: 0 },
    ];

    const { rerender } = render(<ToastContainer toasts={initialToasts} onRemove={onRemove} />);

    expect(screen.getAllByTestId("toast")).toHaveLength(1);

    // Add more toasts
    const moreToasts: ToastData[] = [
      { id: "1", message: "First", variant: "success", duration: 0 },
      { id: "2", message: "Second", variant: "error", duration: 0 },
      { id: "3", message: "Third", variant: "info", duration: 0 },
    ];

    rerender(<ToastContainer toasts={moreToasts} onRemove={onRemove} />);

    expect(screen.getAllByTestId("toast")).toHaveLength(3);

    // Remove middle toast
    const lessToasts: ToastData[] = [
      { id: "1", message: "First", variant: "success", duration: 0 },
      { id: "3", message: "Third", variant: "info", duration: 0 },
    ];

    rerender(<ToastContainer toasts={lessToasts} onRemove={onRemove} />);

    expect(screen.getAllByTestId("toast")).toHaveLength(2);
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
  });
});
