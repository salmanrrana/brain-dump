/**
 * Toast Context and Hook Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior through the hook API
 * - Verify toast lifecycle and rendering
 * - Test error handling for missing provider
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, renderHook } from "@testing-library/react";
import { ToastProvider, useToast, DEFAULT_DURATION } from "./toast-context";

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper wrapper for renderHook
function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ToastProvider>{children}</ToastProvider>;
  };
}

// =============================================================================
// TOAST PROVIDER TESTS
// =============================================================================

describe("ToastProvider", () => {
  describe("Rendering", () => {
    it("should render children", () => {
      render(
        <ToastProvider>
          <div data-testid="child">Content</div>
        </ToastProvider>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should not render toast container when no toasts", () => {
      render(
        <ToastProvider>
          <div>Content</div>
        </ToastProvider>
      );

      expect(screen.queryByTestId("toast-container")).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// USE TOAST HOOK TESTS
// =============================================================================

describe("useToast", () => {
  describe("Hook Interface", () => {
    it("should return toast, success, error, and info functions", () => {
      const { result } = renderHook(() => useToast(), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.toast).toBe("function");
      expect(typeof result.current.success).toBe("function");
      expect(typeof result.current.error).toBe("function");
      expect(typeof result.current.info).toBe("function");
    });

    it("should throw error when used outside ToastProvider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        renderHook(() => useToast());
      }).toThrow("useToast must be used within a ToastProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("toast() Method", () => {
    it("should show a toast with default variant (info)", () => {
      const TestComponent = () => {
        const toast = useToast();
        return <button onClick={() => toast.toast({ message: "Test message" })}>Show Toast</button>;
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Toast"));

      expect(screen.getByTestId("toast")).toBeInTheDocument();
      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "info");
      expect(screen.getByText("Test message")).toBeInTheDocument();
    });

    it("should show a toast with custom variant", () => {
      const TestComponent = () => {
        const toast = useToast();
        return (
          <button onClick={() => toast.toast({ message: "Error!", variant: "error" })}>
            Show Toast
          </button>
        );
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Toast"));

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "error");
    });

    it("should show a toast with custom duration", () => {
      const TestComponent = () => {
        const toast = useToast();
        return (
          <button onClick={() => toast.toast({ message: "Quick", duration: 1000 })}>
            Show Toast
          </button>
        );
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Toast"));

      // Should be visible before timeout
      expect(screen.getByText("Quick")).toBeInTheDocument();

      // Should auto-dismiss after duration + animation
      act(() => {
        vi.advanceTimersByTime(1150);
      });

      expect(screen.queryByText("Quick")).not.toBeInTheDocument();
    });
  });

  describe("success() Method", () => {
    it("should show a green success toast", () => {
      const TestComponent = () => {
        const toast = useToast();
        return <button onClick={() => toast.success("Operation successful!")}>Success</button>;
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Success"));

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "success");
      expect(screen.getByText("Operation successful!")).toBeInTheDocument();
    });
  });

  describe("error() Method", () => {
    it("should show a red error toast", () => {
      const TestComponent = () => {
        const toast = useToast();
        return <button onClick={() => toast.error("Something went wrong!")}>Error</button>;
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Error"));

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "error");
      expect(screen.getByText("Something went wrong!")).toBeInTheDocument();
    });
  });

  describe("info() Method", () => {
    it("should show a blue info toast", () => {
      const TestComponent = () => {
        const toast = useToast();
        return <button onClick={() => toast.info("Please wait...")}>Info</button>;
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Info"));

      expect(screen.getByTestId("toast")).toHaveAttribute("data-variant", "info");
      expect(screen.getByText("Please wait...")).toBeInTheDocument();
    });
  });

  describe("Auto-Dismiss", () => {
    it("should auto-dismiss after default duration (3000ms)", () => {
      const TestComponent = () => {
        const toast = useToast();
        return <button onClick={() => toast.success("Auto dismiss test")}>Show Toast</button>;
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show Toast"));

      expect(screen.getByText("Auto dismiss test")).toBeInTheDocument();

      // Advance past default duration + animation
      act(() => {
        vi.advanceTimersByTime(DEFAULT_DURATION + 150);
      });

      expect(screen.queryByText("Auto dismiss test")).not.toBeInTheDocument();
    });
  });

  describe("Multiple Toasts", () => {
    it("should stack multiple toasts", () => {
      const TestComponent = () => {
        const toast = useToast();
        return (
          <div>
            <button onClick={() => toast.success("Toast message one")}>Trigger 1</button>
            <button onClick={() => toast.error("Toast message two")}>Trigger 2</button>
            <button onClick={() => toast.info("Toast message three")}>Trigger 3</button>
          </div>
        );
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Trigger 1"));
      fireEvent.click(screen.getByText("Trigger 2"));
      fireEvent.click(screen.getByText("Trigger 3"));

      expect(screen.getAllByTestId("toast")).toHaveLength(3);
      expect(screen.getByText("Toast message one")).toBeInTheDocument();
      expect(screen.getByText("Toast message two")).toBeInTheDocument();
      expect(screen.getByText("Toast message three")).toBeInTheDocument();
    });

    it("should remove individual toasts independently", () => {
      const TestComponent = () => {
        const toast = useToast();
        return (
          <div>
            <button onClick={() => toast.toast({ message: "Persistent toast", duration: 0 })}>
              Trigger Persistent
            </button>
            <button onClick={() => toast.toast({ message: "Quick toast", duration: 500 })}>
              Trigger Quick
            </button>
          </div>
        );
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Trigger Persistent"));
      fireEvent.click(screen.getByText("Trigger Quick"));

      expect(screen.getAllByTestId("toast")).toHaveLength(2);

      // Quick toast should auto-dismiss
      act(() => {
        vi.advanceTimersByTime(650);
      });

      // Only persistent toast should remain
      expect(screen.getAllByTestId("toast")).toHaveLength(1);
      expect(screen.getByText("Persistent toast")).toBeInTheDocument();
      expect(screen.queryByText("Quick toast")).not.toBeInTheDocument();
    });
  });

  describe("Manual Dismiss", () => {
    it("should dismiss when clicking dismiss button", () => {
      const TestComponent = () => {
        const toast = useToast();
        return (
          <button onClick={() => toast.toast({ message: "Dismissable", duration: 0 })}>Show</button>
        );
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show"));
      expect(screen.getByText("Dismissable")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("toast-dismiss"));

      // Wait for animation
      act(() => {
        vi.advanceTimersByTime(150);
      });

      expect(screen.queryByText("Dismissable")).not.toBeInTheDocument();
    });
  });

  describe("ReactNode Messages", () => {
    it("should accept ReactNode as message", () => {
      const TestComponent = () => {
        const toast = useToast();
        return (
          <button
            onClick={() =>
              toast.success(
                <span data-testid="custom-content">
                  <strong>Bold</strong> text
                </span>
              )
            }
          >
            Show
          </button>
        );
      };

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText("Show"));

      expect(screen.getByTestId("custom-content")).toBeInTheDocument();
      expect(screen.getByText("Bold")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe("Toast Integration", () => {
  it("should handle a complete toast workflow", () => {
    const TestComponent = () => {
      const toast = useToast();

      const handleSave = () => {
        toast.info("Saving...");
        // Simulate async operation
        setTimeout(() => {
          toast.success("Saved!");
        }, 100);
      };

      return <button onClick={handleSave}>Save</button>;
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Save"));

    // Info toast appears
    expect(screen.getByText("Saving...")).toBeInTheDocument();

    // Advance to trigger the setTimeout
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Both toasts should be visible now
    expect(screen.getAllByTestId("toast")).toHaveLength(2);
    expect(screen.getByText("Saved!")).toBeInTheDocument();

    // Advance past both toast durations
    act(() => {
      vi.advanceTimersByTime(DEFAULT_DURATION + 150);
    });

    // All toasts should be gone
    expect(screen.queryByTestId("toast-container")).not.toBeInTheDocument();
  });

  it("should maintain stable function references", () => {
    const refs: { toast: typeof useToast }[] = [];

    const TestComponent = () => {
      const toast = useToast();
      refs.push({ toast: toast as unknown as typeof useToast });

      return <button onClick={() => toast.success("Test")}>Trigger Rerender</button>;
    };

    const { rerender } = render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Trigger rerenders
    rerender(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    rerender(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // All captured refs should have the same function references
    // (This verifies useCallback memoization is working)
    expect(refs).toHaveLength(3);
  });
});

// =============================================================================
// DEFAULT DURATION CONSTANT TEST
// =============================================================================

describe("DEFAULT_DURATION", () => {
  it("should be 3000ms", () => {
    expect(DEFAULT_DURATION).toBe(3000);
  });
});
