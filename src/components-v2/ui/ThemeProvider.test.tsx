import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { ThemeProvider, useTheme, THEME_STORAGE_KEY, type Theme } from "./ThemeProvider";

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
    </div>
  );
}

describe("ThemeProvider", () => {
  let setAttributeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    setAttributeSpy = vi.fn();
    Object.defineProperty(document.documentElement, "setAttribute", {
      value: setAttributeSpy,
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

  it("sets data-theme attribute on mount", async () => {
    render(
      <ThemeProvider initialTheme="ember">
        <ThemeConsumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "ember");
    });
  });

  it("updates data-theme attribute when theme changes", async () => {
    render(
      <ThemeProvider initialTheme="ember">
        <ThemeConsumer />
      </ThemeProvider>
    );

    await act(async () => {
      screen.getByTestId("set-mint").click();
    });

    await waitFor(() => {
      expect(setAttributeSpy).toHaveBeenCalledWith("data-theme", "mint");
    });
  });

  it("provides theme context to children", async () => {
    render(
      <ThemeProvider initialTheme="solar">
        <ThemeConsumer />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("current-theme")).toHaveTextContent("solar");
    });
  });

  it("persists theme changes to localStorage", async () => {
    render(
      <ThemeProvider initialTheme="ember">
        <ThemeConsumer />
      </ThemeProvider>
    );

    await act(async () => {
      screen.getByTestId("set-mint").click();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "mint");
  });

  it("loads theme from localStorage on mount", async () => {
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
