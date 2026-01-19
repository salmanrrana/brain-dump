/**
 * Tests for Theme Context and Hook
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (what users see and interact with)
 * - Test the hook interface consumers actually use
 * - Only mock at boundaries (localStorage)
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ThemeProvider,
  useTheme,
  isValidTheme,
  getStoredTheme,
  saveTheme,
  applyTheme,
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
  THEMES,
  type Theme,
} from "./theme";

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
    _getStore: () => store,
  };
})();

// Create a wrapper component for renderHook
function createWrapper(initialTheme?: Theme) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // Only pass initialTheme when defined (exactOptionalPropertyTypes compliance)
    if (initialTheme !== undefined) {
      return <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>;
    }
    return <ThemeProvider>{children}</ThemeProvider>;
  };
}

// =============================================================================
// SETUP / TEARDOWN
// =============================================================================

describe("Theme System", () => {
  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();

    // Mock document.documentElement
    Object.defineProperty(document.documentElement, "setAttribute", {
      value: vi.fn(),
      writable: true,
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
  // CONSTANTS
  // ===========================================================================

  describe("Constants", () => {
    it("should export THEME_STORAGE_KEY as 'brain-dump-theme'", () => {
      expect(THEME_STORAGE_KEY).toBe("brain-dump-theme");
    });

    it("should export DEFAULT_THEME as 'ember'", () => {
      expect(DEFAULT_THEME).toBe("ember");
    });

    it("should export THEMES array with all valid themes", () => {
      expect(THEMES).toEqual(["ember", "mint", "solar"]);
    });
  });

  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================

  describe("isValidTheme", () => {
    it("should return true for 'ember'", () => {
      expect(isValidTheme("ember")).toBe(true);
    });

    it("should return true for 'mint'", () => {
      expect(isValidTheme("mint")).toBe(true);
    });

    it("should return true for 'solar'", () => {
      expect(isValidTheme("solar")).toBe(true);
    });

    it("should return false for invalid string", () => {
      expect(isValidTheme("dark")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidTheme("")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidTheme(null)).toBe(false);
      expect(isValidTheme(undefined)).toBe(false);
      expect(isValidTheme(42)).toBe(false);
      expect(isValidTheme({})).toBe(false);
    });
  });

  describe("getStoredTheme", () => {
    it("should return null when no theme is stored", () => {
      expect(getStoredTheme()).toBeNull();
    });

    it("should return stored theme when valid", () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, "mint");
      expect(getStoredTheme()).toBe("mint");
    });

    it("should return null when stored value is invalid", () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, "invalid-theme");
      expect(getStoredTheme()).toBeNull();
    });
  });

  describe("saveTheme", () => {
    it("should save valid theme to localStorage", () => {
      saveTheme("solar");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "solar");
    });

    it("should save each theme type correctly", () => {
      saveTheme("ember");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "ember");

      saveTheme("mint");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "mint");

      saveTheme("solar");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "solar");
    });
  });

  describe("applyTheme", () => {
    it("should set data-theme attribute on document element", () => {
      applyTheme("mint");
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "mint");
    });

    it("should apply each theme correctly", () => {
      applyTheme("ember");
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "ember");

      applyTheme("mint");
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "mint");

      applyTheme("solar");
      expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "solar");
    });
  });

  // ===========================================================================
  // useTheme HOOK
  // ===========================================================================

  describe("useTheme hook", () => {
    describe("Initial state", () => {
      it("should return correct initial theme from initialTheme prop", () => {
        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper("mint"),
        });

        expect(result.current.theme).toBe("mint");
      });

      it("should default to ember when no initialTheme provided", async () => {
        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper(),
        });

        // Wait for hydration effect
        await waitFor(() => {
          expect(result.current.theme).toBe("ember");
        });
      });

      it("should use stored theme from localStorage when available", async () => {
        // Pre-set localStorage before rendering
        localStorageMock.setItem(THEME_STORAGE_KEY, "solar");

        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper(),
        });

        // Wait for hydration to sync with localStorage
        await waitFor(() => {
          expect(result.current.theme).toBe("solar");
        });
      });
    });

    describe("setTheme", () => {
      it("should update theme when setTheme is called", async () => {
        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper("ember"),
        });

        expect(result.current.theme).toBe("ember");

        await act(async () => {
          result.current.setTheme("mint");
        });

        expect(result.current.theme).toBe("mint");
      });

      it("should persist theme to localStorage when setTheme is called", async () => {
        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper("ember"),
        });

        await act(async () => {
          result.current.setTheme("solar");
        });

        expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "solar");
      });

      it("should apply theme to document when setTheme is called", async () => {
        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper("ember"),
        });

        await act(async () => {
          result.current.setTheme("mint");
        });

        expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "mint");
      });

      it("should allow cycling through all themes", async () => {
        const { result } = renderHook(() => useTheme(), {
          wrapper: createWrapper("ember"),
        });

        expect(result.current.theme).toBe("ember");

        await act(async () => {
          result.current.setTheme("mint");
        });
        expect(result.current.theme).toBe("mint");

        await act(async () => {
          result.current.setTheme("solar");
        });
        expect(result.current.theme).toBe("solar");

        await act(async () => {
          result.current.setTheme("ember");
        });
        expect(result.current.theme).toBe("ember");
      });
    });

    describe("Error handling", () => {
      it("should throw error when useTheme is used outside ThemeProvider", () => {
        // Suppress console.error for this test since React will log the error
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        expect(() => {
          renderHook(() => useTheme());
        }).toThrow("useTheme must be used within a ThemeProvider");

        consoleSpy.mockRestore();
      });
    });
  });

  // ===========================================================================
  // ThemeProvider COMPONENT
  // ===========================================================================

  describe("ThemeProvider", () => {
    it("should render children", () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Child content</div>
        </ThemeProvider>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should apply initial theme to document on mount", async () => {
      render(
        <ThemeProvider initialTheme="mint">
          <div>Test</div>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "mint");
      });
    });

    it("should use localStorage theme over default when available", async () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, "solar");

      render(
        <ThemeProvider>
          <div>Test</div>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "solar");
      });
    });

    it("should prefer initialTheme prop over localStorage", async () => {
      localStorageMock.setItem(THEME_STORAGE_KEY, "solar");

      render(
        <ThemeProvider initialTheme="mint">
          <div>Test</div>
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(document.documentElement.setAttribute).toHaveBeenCalledWith("data-theme", "mint");
      });
    });
  });

  // ===========================================================================
  // INTEGRATION: Theme persistence across "sessions"
  // ===========================================================================

  describe("Theme persistence", () => {
    it("should persist theme selection across provider unmount/remount", async () => {
      // First render - select a theme
      const { result: result1, unmount } = renderHook(() => useTheme(), {
        wrapper: createWrapper(),
      });

      // Wait for initial hydration
      await waitFor(() => {
        expect(result1.current.theme).toBe("ember");
      });

      // Change theme
      await act(async () => {
        result1.current.setTheme("mint");
      });

      expect(result1.current.theme).toBe("mint");

      // Unmount (simulating page close)
      unmount();

      // Second render (simulating page reopen)
      // Theme should be loaded from localStorage
      const { result: result2 } = renderHook(() => useTheme(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result2.current.theme).toBe("mint");
      });
    });
  });

  // ===========================================================================
  // USER EXPERIENCE: Theme changes are immediately visible
  // ===========================================================================

  describe("User experience", () => {
    it("should update UI immediately when theme changes", async () => {
      // This test verifies that both the React state and DOM are updated
      // immediately when setTheme is called

      const { result } = renderHook(() => useTheme(), {
        wrapper: createWrapper("ember"),
      });

      const setAttributeMock = vi.fn();
      Object.defineProperty(document.documentElement, "setAttribute", {
        value: setAttributeMock,
        writable: true,
      });

      await act(async () => {
        result.current.setTheme("solar");
      });

      // React state updated
      expect(result.current.theme).toBe("solar");

      // DOM updated
      expect(setAttributeMock).toHaveBeenCalledWith("data-theme", "solar");

      // localStorage updated
      expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "solar");
    });
  });
});
