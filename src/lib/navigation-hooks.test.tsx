import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectsPanel, NavigationProvider } from "./navigation-hooks";
import type { ReactNode } from "react";

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <NavigationProvider>{children}</NavigationProvider>;
  };
}

describe("useProjectsPanel", () => {
  it("opens, closes, and toggles the panel", () => {
    const { result } = renderHook(() => useProjectsPanel(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isOpen).toBe(false);

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it("closes when user presses Escape", () => {
    const { result } = renderHook(() => useProjectsPanel(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(result.current.isOpen).toBe(false);
  });

  describe("click outside behavior", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("closes when user clicks outside the panel", () => {
      const { result } = renderHook(() => useProjectsPanel(), {
        wrapper: createWrapper(),
      });

      const panelElement = document.createElement("div");
      document.body.appendChild(panelElement);
      (result.current.panelRef as { current: HTMLElement | null }).current = panelElement;

      act(() => result.current.open());
      act(() => vi.runAllTimers());

      act(() => {
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(result.current.isOpen).toBe(false);
      document.body.removeChild(panelElement);
    });

    it("stays open when user clicks inside the panel", () => {
      const { result } = renderHook(() => useProjectsPanel(), {
        wrapper: createWrapper(),
      });

      const panelElement = document.createElement("div");
      document.body.appendChild(panelElement);
      (result.current.panelRef as { current: HTMLElement | null }).current = panelElement;

      act(() => result.current.open());
      act(() => vi.runAllTimers());

      act(() => {
        panelElement.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(result.current.isOpen).toBe(true);
      document.body.removeChild(panelElement);
    });
  });

  it("shares state across multiple hook consumers", () => {
    function useTwoConsumers() {
      return { a: useProjectsPanel(), b: useProjectsPanel() };
    }

    const { result } = renderHook(() => useTwoConsumers(), {
      wrapper: createWrapper(),
    });

    act(() => result.current.a.open());
    expect(result.current.b.isOpen).toBe(true);

    act(() => result.current.b.close());
    expect(result.current.a.isOpen).toBe(false);
  });

  it("throws when used without NavigationProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useProjectsPanel());
    }).toThrow("useProjectsPanel must be used within a NavigationProvider");

    vi.restoreAllMocks();
  });
});
