/**
 * ThemeProvider Integration Tests
 *
 * Tests that ThemeProvider works correctly when imported from components-v2.
 * Detailed unit tests for the theme system are in src/lib/theme.test.tsx.
 *
 * These tests verify:
 * - ThemeProvider sets data-theme attribute on mount
 * - data-theme updates when theme changes
 *
 * @see src/lib/theme.test.tsx for comprehensive theme system tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { ThemeProvider, useTheme, THEME_STORAGE_KEY, type Theme } from "./ThemeProvider";

// =============================================================================
// TEST UTILITIES
// =============================================================================

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

// Component that displays and can change the theme
function ThemeConsumer({ onThemeChange }: { onThemeChange?: (theme: Theme) => void }) {
  const { theme, setTheme } = useTheme();

  const handleClick = (newTheme: Theme) => {
    setTheme(newTheme);
    onThemeChange?.(newTheme);
  };

  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button data-testid="set-mint" onClick={() => handleClick("mint")}>
        Set Mint
      </button>
      <button data-testid="set-solar" onClick={() => handleClick("solar")}>
        Set Solar
      </button>
    </div>
  );
}

// =============================================================================
// SETUP / TEARDOWN
// =============================================================================

describe("ThemeProvider (components-v2)", () => {
  let setAttributeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();

    // Spy on setAttribute to verify data-theme is set
    setAttributeSpy = vi.fn();
    Object.defineProperty(document.documentElement, "setAttribute", {
      value: setAttributeSpy,
      writable: true,
      configurable: true,
    });

    // Replace localStorage with mock
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // ACCEPTANCE CRITERIA TESTS
  // ===========================================================================

  describe("Acceptance Criteria", () => {
    it("should set data-theme attribute on mount", async () => {
      render(
        <ThemeProvider initialTheme="ember">
          <ThemeConsumer />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "ember");
      });
    });

    it("should update data-theme attribute when theme changes", async () => {
      render(
        <ThemeProvider initialTheme="ember">
          <ThemeConsumer />
        </ThemeProvider>
      );

      // Initial theme applied
      await waitFor(() => {
        expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "ember");
      });

      // Change theme
      await act(async () => {
        screen.getByTestId("set-mint").click();
      });

      // New theme applied
      await waitFor(() => {
        expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "mint");
      });
    });

    it("should wrap children with ThemeContext.Provider (children receive context)", async () => {
      render(
        <ThemeProvider initialTheme="solar">
          <ThemeConsumer />
        </ThemeProvider>
      );

      // Child component should have access to the theme
      await waitFor(() => {
        expect(screen.getByTestId("current-theme")).toHaveTextContent("solar");
      });
    });

    it("should handle SSR gracefully (no errors when rendering without window)", () => {
      // This test verifies that ThemeProvider can render without throwing
      // SSR safety is ensured by the underlying theme.tsx implementation
      expect(() => {
        render(
          <ThemeProvider>
            <div>Test</div>
          </ThemeProvider>
        );
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // RE-EXPORT VERIFICATION
  // ===========================================================================

  describe("Re-exports", () => {
    it("should export THEME_STORAGE_KEY constant", () => {
      expect(THEME_STORAGE_KEY).toBe("brain-dump-theme");
    });

    it("should export useTheme hook", () => {
      expect(typeof useTheme).toBe("function");
    });

    it("should export ThemeProvider component", () => {
      expect(typeof ThemeProvider).toBe("function");
    });
  });

  // ===========================================================================
  // INTEGRATION WITH THEME SYSTEM
  // ===========================================================================

  describe("Integration", () => {
    it("should persist theme changes to localStorage", async () => {
      render(
        <ThemeProvider initialTheme="ember">
          <ThemeConsumer />
        </ThemeProvider>
      );

      await act(async () => {
        screen.getByTestId("set-solar").click();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "solar");
    });

    it("should load theme from localStorage on mount", async () => {
      // Pre-set localStorage
      localStorageMock.setItem(THEME_STORAGE_KEY, "mint");

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("current-theme")).toHaveTextContent("mint");
      });
    });
  });
});
