/**
 * Modal Hooks Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (the hook's public API)
 * - Verify state changes in response to actions
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModal } from "./modal-hooks";

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("useModal", () => {
  describe("Acceptance Criteria", () => {
    it("should return {isOpen, open, close, toggle}", () => {
      const { result } = renderHook(() => useModal());

      expect(result.current).toHaveProperty("isOpen");
      expect(result.current).toHaveProperty("open");
      expect(result.current).toHaveProperty("close");
      expect(result.current).toHaveProperty("toggle");
      expect(typeof result.current.isOpen).toBe("boolean");
      expect(typeof result.current.open).toBe("function");
      expect(typeof result.current.close).toBe("function");
      expect(typeof result.current.toggle).toBe("function");
    });

    it("should set isOpen to true when open() is called", () => {
      const { result } = renderHook(() => useModal());

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should set isOpen to false when close() is called", () => {
      const { result } = renderHook(() => useModal(true));

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should flip isOpen when toggle() is called", () => {
      const { result } = renderHook(() => useModal());

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should have memoized functions with stable references", () => {
      const { result, rerender } = renderHook(() => useModal());

      const initialOpen = result.current.open;
      const initialClose = result.current.close;
      const initialToggle = result.current.toggle;

      // Trigger a re-render
      rerender();

      // Functions should maintain stable references
      expect(result.current.open).toBe(initialOpen);
      expect(result.current.close).toBe(initialClose);
      expect(result.current.toggle).toBe(initialToggle);
    });
  });

  // ===========================================================================
  // INITIAL STATE TESTS
  // ===========================================================================

  describe("Initial state", () => {
    it("should default to closed (isOpen: false)", () => {
      const { result } = renderHook(() => useModal());

      expect(result.current.isOpen).toBe(false);
    });

    it("should accept initial state of true", () => {
      const { result } = renderHook(() => useModal(true));

      expect(result.current.isOpen).toBe(true);
    });

    it("should accept initial state of false explicitly", () => {
      const { result } = renderHook(() => useModal(false));

      expect(result.current.isOpen).toBe(false);
    });
  });

  // ===========================================================================
  // OPEN() TESTS
  // ===========================================================================

  describe("open()", () => {
    it("should open a closed modal", () => {
      const { result } = renderHook(() => useModal(false));

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should keep an open modal open", () => {
      const { result } = renderHook(() => useModal(true));

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should work when called multiple times", () => {
      const { result } = renderHook(() => useModal());

      act(() => {
        result.current.open();
        result.current.open();
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });
  });

  // ===========================================================================
  // CLOSE() TESTS
  // ===========================================================================

  describe("close()", () => {
    it("should close an open modal", () => {
      const { result } = renderHook(() => useModal(true));

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should keep a closed modal closed", () => {
      const { result } = renderHook(() => useModal(false));

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should work when called multiple times", () => {
      const { result } = renderHook(() => useModal(true));

      act(() => {
        result.current.close();
        result.current.close();
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  // ===========================================================================
  // TOGGLE() TESTS
  // ===========================================================================

  describe("toggle()", () => {
    it("should open a closed modal", () => {
      const { result } = renderHook(() => useModal(false));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it("should close an open modal", () => {
      const { result } = renderHook(() => useModal(true));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it("should alternate on multiple calls", () => {
      const { result } = renderHook(() => useModal(false));

      // Toggle 1: false -> true
      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(true);

      // Toggle 2: true -> false
      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(false);

      // Toggle 3: false -> true
      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(true);
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe("Integration", () => {
    it("should handle mixed operations correctly", () => {
      const { result } = renderHook(() => useModal());

      // Start closed
      expect(result.current.isOpen).toBe(false);

      // Open
      act(() => {
        result.current.open();
      });
      expect(result.current.isOpen).toBe(true);

      // Toggle (should close)
      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(false);

      // Close (already closed, should stay closed)
      act(() => {
        result.current.close();
      });
      expect(result.current.isOpen).toBe(false);

      // Toggle (should open)
      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(true);

      // Close
      act(() => {
        result.current.close();
      });
      expect(result.current.isOpen).toBe(false);
    });
  });
});
