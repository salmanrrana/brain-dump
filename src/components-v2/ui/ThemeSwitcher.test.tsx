import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, type Theme } from "../../lib/theme";
import { ThemeSwitcher } from "./ThemeSwitcher";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn(),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn(),
  };
})();

function renderWithTheme(initialTheme: Theme = "ember") {
  return render(
    <ThemeProvider initialTheme={initialTheme}>
      <ThemeSwitcher />
    </ThemeProvider>
  );
}

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    Object.defineProperty(document.documentElement, "setAttribute", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rendering", () => {
    it("renders all dark theme buttons", () => {
      renderWithTheme();

      expect(screen.getByRole("radio", { name: /ember theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /mint theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /solar theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /arctic theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /neon theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /blush theme/i })).toBeInTheDocument();
    });

    it("renders all light theme buttons", () => {
      renderWithTheme();

      expect(screen.getByRole("radio", { name: /daylight theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /frost theme/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /paper theme/i })).toBeInTheDocument();
    });

    it("indicates current theme with aria-checked", async () => {
      renderWithTheme("solar");

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /solar theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });

      expect(screen.getByRole("radio", { name: /ember theme/i })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });
  });

  describe("User interactions", () => {
    it("changes theme when a button is clicked", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      await user.click(screen.getByRole("radio", { name: /mint theme/i }));

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /mint theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });
    });

    it("updates localStorage when theme changes", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      await user.click(screen.getByRole("radio", { name: /solar theme/i }));

      expect(localStorageMock.setItem).toHaveBeenCalledWith("brain-dump-theme", "solar");
    });
  });

  describe("Keyboard navigation", () => {
    it("is focusable with Tab", async () => {
      const user = userEvent.setup();
      renderWithTheme();

      await user.tab();

      expect(screen.getByRole("radio", { name: /ember theme/i })).toHaveFocus();
    });

    it("selects theme with Enter key", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      await user.tab();
      await user.tab();
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /mint theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });
    });

    it("selects theme with Space key", async () => {
      const user = userEvent.setup();
      renderWithTheme("ember");

      await user.tab();
      await user.tab();
      await user.tab();
      await user.keyboard(" ");

      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /solar theme.*active/i })).toHaveAttribute(
          "aria-checked",
          "true"
        );
      });
    });
  });

  describe("Accessibility", () => {
    it("has separate radiogroup roles for dark and light themes", () => {
      renderWithTheme();
      expect(screen.getByRole("radiogroup", { name: /dark themes/i })).toBeInTheDocument();
      expect(screen.getByRole("radiogroup", { name: /light themes/i })).toBeInTheDocument();
    });

    it("shows all theme names as visible text", () => {
      renderWithTheme();

      // Dark themes
      expect(screen.getByText("Ember")).toBeInTheDocument();
      expect(screen.getByText("Mint")).toBeInTheDocument();
      expect(screen.getByText("Solar")).toBeInTheDocument();
      expect(screen.getByText("Arctic")).toBeInTheDocument();
      expect(screen.getByText("Neon")).toBeInTheDocument();
      expect(screen.getByText("Blush")).toBeInTheDocument();

      // Light themes
      expect(screen.getByText("Daylight")).toBeInTheDocument();
      expect(screen.getByText("Frost")).toBeInTheDocument();
      expect(screen.getByText("Paper")).toBeInTheDocument();
    });
  });
});
