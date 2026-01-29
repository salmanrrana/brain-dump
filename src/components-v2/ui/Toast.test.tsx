import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Toast, ToastContainer, type ToastData } from "./Toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  describe("Rendering", () => {
    it("renders with message", () => {
      render(<Toast message="Test message" onDismiss={vi.fn()} />);
      expect(screen.getByTestId("toast-message")).toHaveTextContent("Test message");
    });

    it("renders with correct role and aria attributes", () => {
      render(<Toast message="Accessible toast" onDismiss={vi.fn()} />);
      const toast = screen.getByRole("alert");
      expect(toast).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Variants", () => {
    it("renders all variants", () => {
      const { rerender } = render(<Toast message="Test" variant="success" onDismiss={vi.fn()} />);
      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "success");

      rerender(<Toast message="Test" variant="error" onDismiss={vi.fn()} />);
      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "error");

      rerender(<Toast message="Test" variant="info" onDismiss={vi.fn()} />);
      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "info");
    });

    it("defaults to info variant", () => {
      render(<Toast message="Default" onDismiss={vi.fn()} />);
      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "info");
    });
  });

  describe("Dismiss behavior", () => {
    it("calls onDismiss when dismiss button is clicked", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Dismissable" onDismiss={onDismiss} duration={0} />);

      fireEvent.click(screen.getByTestId("toast-dismiss"));

      act(() => {
        vi.advanceTimersByTime(150);
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("auto-dismisses after default duration", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Auto dismiss" onDismiss={onDismiss} />);

      act(() => {
        vi.advanceTimersByTime(3150);
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("auto-dismisses after custom duration", () => {
      const onDismiss = vi.fn();
      render(<Toast message="Custom duration" duration={1000} onDismiss={onDismiss} />);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(650);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("does not auto-dismiss when duration is 0", () => {
      const onDismiss = vi.fn();
      render(<Toast message="No auto dismiss" duration={0} onDismiss={onDismiss} />);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});

describe("ToastContainer", () => {
  it("does not render when toasts array is empty", () => {
    render(<ToastContainer toasts={[]} onRemove={vi.fn()} />);
    expect(screen.queryByTestId("toast-container")).not.toBeInTheDocument();
  });

  it("renders multiple toasts", () => {
    const toasts: ToastData[] = [
      { id: "1", message: "First toast", variant: "success", duration: 0 },
      { id: "2", message: "Second toast", variant: "error", duration: 0 },
    ];
    render(<ToastContainer toasts={toasts} onRemove={vi.fn()} />);

    expect(screen.getByText("First toast")).toBeInTheDocument();
    expect(screen.getByText("Second toast")).toBeInTheDocument();
  });

  it("renders to body via portal", () => {
    const toasts: ToastData[] = [
      { id: "1", message: "Portal toast", variant: "info", duration: 0 },
    ];
    render(
      <div data-testid="app-root">
        <ToastContainer toasts={toasts} onRemove={vi.fn()} />
      </div>
    );

    const container = screen.getByTestId("toast-container");
    expect(container.parentElement).toBe(document.body);
  });

  it("calls onRemove with toast id when dismissed", () => {
    const onRemove = vi.fn();
    const toasts: ToastData[] = [
      { id: "toast-123", message: "Dismissable", variant: "success", duration: 0 },
    ];
    render(<ToastContainer toasts={toasts} onRemove={onRemove} />);

    fireEvent.click(screen.getByTestId("toast-dismiss"));

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onRemove).toHaveBeenCalledWith("toast-123");
  });
});
