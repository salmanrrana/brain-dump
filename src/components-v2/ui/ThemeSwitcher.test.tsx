/**
 * ThemeSwitcher Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (clicking buttons, visual indicators)
 * - Test what users actually see and interact with
 * - Verify keyboard accessibility
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, type Theme } from "./ThemeProvider";
import { ThemeSwitcher } from "./ThemeSwitcher";

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

// Wrapper that provides ThemeProvider with specified initial theme
function renderWithTheme(initialTheme: Theme = "ember") {
  return render(
    <ThemeProvider initialTheme={initialTheme}>
      <ThemeSwitcher />
    </ThemeProvider>
  );
}

// =============================================================================
// SETUP / TEARDOWN
// =============================================================================

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock.clear();
    vi.clearAllMocks();

    // Mock document.documentElement.setAttribute
    Object.defineProperty(document.documentElement, "setAttribute", {
      value: vi.fn(),
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
    it("should render 3 color dot buttons (Ember, Mint, Solar)", () => {
      renderWithTheme();

      // All three theme buttons should be present
      expect(screen.getByRole("radio", { name: /ember theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /mint theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /solar theme/i })).toBeInTheDocument();
    });

    it("should change theme when a dot is clicked", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      // Verify initial state - ember should be active
      const emberButton = screen.getByRole("radio", { name: /ember theme.*active/i });
      expect(emberButton).toHaveAttribute("aria-checked", "true");

      // Click mint button
      const mintButton = screen.getByRole("radio", { name: /mint theme/i });
      await user.click(mintButton);

      // Mint should now be active
      await waitFor(() => {
        expect(mintButton).toHaveAttribute("aria-checked", "true");
      });

      // Ember should no longer be active
      expect(screen.getByRole("radio", { name: /ember theme/i })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    it("should visually indicate the current theme with aria-checked", async () => {
      renderWithTheme("solar");

      // Solar should be checked
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /solar theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });

      // Others should not be checked
      expect(screen.getByRole("radio", { name: /ember theme/i })).toHaveAttribute(
        "aria-checked",
        "false"
      );
      expect(screen.getByRole("radio", { name: /mint theme/i })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    it("should show theme name in tooltip (title attribute)", () => {
      renderWithTheme();

      expect(screen.getByRole("radio", { name: /ember theme/i })).toHaveAttribute("title", "Ember");
      expect(screen.getByRole("radio", { name: /mint theme/i })).toHaveAttribute("title", "Mint");
      expect(screen.getByRole("radio", { name: /solar theme/i })).toHaveAttribute("title", "Solar");
    });

    it("should be accessible with proper aria-labels", () => {
      renderWithTheme("mint");

      // Radiogroup container
      expect(screen.getByRole("radiogroup", { name: /theme selector/i })).toBeInTheDocument();

      // Each button has appropriate aria-label
      expect(screen.getByRole("radio", { name: /ember theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /mint theme.*active/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /solar theme/i })).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // KEYBOARD NAVIGATION TESTS
  // ===========================================================================

  describe("Keyboard navigation", () => {
    it("should be focusable with Tab key", async () => {
      const user = userEvent.setup();
      renderWithTheme();

      // Tab into the component
      await user.tab();

      // First button (ember) should be focused
      expect(screen.getByRole("radio", { name: /ember theme/i })).toHaveFocus();
    });

    it("should allow selecting theme with Enter key", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      // Tab to mint button (second button)
      await user.tab();
      await user.tab();

      // Mint button should be focused
      expect(screen.getByRole("radio", { name: /mint theme/i })).toHaveFocus();

      // Press Enter to select mint theme
      await user.keyboard("{Enter}");

      // Mint should now be active
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /mint theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });
    });

    it("should allow selecting theme with Space key", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      // Tab to solar button (third button)
      await user.tab();
      await user.tab();
      await user.tab();

      // Solar button should be focused
      expect(screen.getByRole("radio", { name: /solar theme/i })).toHaveFocus();

      // Press Space to select solar theme
      await user.keyboard(" ");

      // Solar should now be active
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /solar theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe("Integration with theme system", () => {
    it("should update localStorage when theme is changed", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      // Click solar button
      await user.click(screen.getByRole("radio", { name: /solar theme/i }));

      // localStorage should be updated
      expect(localStorageMock.setItem).toHaveBeenCalledWith("brain-dump-theme", "solar");
    });

    it("should allow cycling through all themes", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      // Start with ember
      expect(screen.getByRole("radio", { name: /ember theme.*active/i })).toHaveAttribute(
        "aria-checked",
        "true"
      );

      // Click mint
      await user.click(screen.getByRole("radio", { name: /mint theme/i }));
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /mint theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });

      // Click solar
      await user.click(screen.getByRole("radio", { name: /solar theme/i }));
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /solar theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });

      // Click back to ember
      await user.click(screen.getByRole("radio", { name: /ember theme/i }));
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /ember theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });
    });
  });

  // ===========================================================================
  // VISUAL STYLING TESTS
  // ===========================================================================

  describe("Visual styling", () => {
    it("should apply correct background colors to theme dots", () => {
      renderWithTheme();

      // Check inline styles for background colors
      const emberButton = screen.getByRole("radio", { name: /ember theme/i });
      const mintButton = screen.getByRole("radio", { name: /mint theme/i });
      const solarButton = screen.getByRole("radio", { name: /solar theme/i });

      expect(emberButton).toHaveStyle({ backgroundColor: "#f97316" });
      expect(mintButton).toHaveStyle({ backgroundColor: "#10b981" });
      expect(solarButton).toHaveStyle({ backgroundColor: "#eab308" });
    });

    it("should apply glow effect to active theme", () => {
      renderWithTheme("mint");

      const mintButton = screen.getByRole("radio", { name: /mint theme.*active/i });

      // Active button should have box-shadow for glow effect
      const style = mintButton.style;
      expect(style.boxShadow).toContain("#10b981");
    });

    it("should not apply glow effect to inactive themes", () => {
      renderWithTheme("mint");

      const emberButton = screen.getByRole("radio", { name: /ember theme/i });

      // Inactive button should not have box-shadow
      expect(emberButton.style.boxShadow).toBe("none");
    });
  });

  // ===========================================================================
  // PROPS TESTS
  // ===========================================================================

  describe("Props", () => {
    it("should accept className prop for custom styling", () => {
      render(
        <ThemeProvider initialTheme="ember">
          <ThemeSwitcher className="custom-class" />
        </ThemeProvider>
      );

      const container = screen.getByRole("radiogroup");
      expect(container).toHaveClass("custom-class");
    });
  });
});
