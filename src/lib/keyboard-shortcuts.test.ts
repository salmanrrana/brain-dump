/**
 * Keyboard Shortcuts Hook Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (shortcuts trigger callbacks)
 * - Verify shortcuts are disabled when typing in input fields
 * - Test that the hook returns shortcuts for help display
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useKeyboardShortcuts,
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
} from "./keyboard-shortcuts";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function fireKeyDown(key: string, options: { target?: HTMLElement } = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });

  // If target is specified, set activeElement before dispatching
  if (options.target) {
    Object.defineProperty(document, "activeElement", {
      value: options.target,
      writable: true,
      configurable: true,
    });
  }

  document.dispatchEvent(event);
}

function createInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  return input;
}

function createTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  return textarea;
}

function createContentEditable(): HTMLElement {
  const div = document.createElement("div");
  div.contentEditable = "true";
  // In JSDOM, isContentEditable is a readonly property computed from contentEditable
  // We need to ensure it returns true for our test
  Object.defineProperty(div, "isContentEditable", {
    value: true,
    writable: false,
    configurable: true,
  });
  return div;
}

function createButton(): HTMLButtonElement {
  const button = document.createElement("button");
  return button;
}

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    // Reset activeElement to body before each test
    Object.defineProperty(document, "activeElement", {
      value: document.body,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Acceptance Criteria", () => {
    it("should call onNewTicket when 'n' is pressed", () => {
      const onNewTicket = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      fireKeyDown("n");

      expect(onNewTicket).toHaveBeenCalledTimes(1);
    });

    it("should call onFocusSearch when '/' is pressed", () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

      fireKeyDown("/");

      expect(onFocusSearch).toHaveBeenCalledTimes(1);
    });

    it("should call onShowShortcuts when '?' is pressed", () => {
      const onShowShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onShowShortcuts }));

      fireKeyDown("?");

      expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    });

    it("should call onCloseModal when 'Escape' is pressed", () => {
      const onCloseModal = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onCloseModal }));

      fireKeyDown("Escape");

      expect(onCloseModal).toHaveBeenCalledTimes(1);
    });

    it("should call onRefresh when 'r' is pressed", () => {
      const onRefresh = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onRefresh }));

      fireKeyDown("r");

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("should call onNavigateDashboard when '1' is pressed", () => {
      const onNavigateDashboard = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onNavigateDashboard }));

      fireKeyDown("1");

      expect(onNavigateDashboard).toHaveBeenCalledTimes(1);
    });

    it("should call onNavigateBoard when '2' is pressed", () => {
      const onNavigateBoard = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onNavigateBoard }));

      fireKeyDown("2");

      expect(onNavigateBoard).toHaveBeenCalledTimes(1);
    });

    it("should call onToggleProjects when '3' is pressed", () => {
      const onToggleProjects = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleProjects }));

      fireKeyDown("3");

      expect(onToggleProjects).toHaveBeenCalledTimes(1);
    });

    it("should call onOpenSettings when '4' is pressed", () => {
      const onOpenSettings = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onOpenSettings }));

      fireKeyDown("4");

      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it("should NOT trigger navigation shortcuts when typing in input", () => {
      const onNavigateDashboard = vi.fn();
      const input = createInput();
      renderHook(() => useKeyboardShortcuts({ onNavigateDashboard }));

      fireKeyDown("1", { target: input });

      expect(onNavigateDashboard).not.toHaveBeenCalled();
    });

    it("should NOT trigger navigation shortcuts when disabled", () => {
      const onNavigateDashboard = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onNavigateDashboard, disabled: true }));

      fireKeyDown("1");

      expect(onNavigateDashboard).not.toHaveBeenCalled();
    });

    it("should NOT trigger shortcuts when typing in input", () => {
      const onNewTicket = vi.fn();
      const input = createInput();
      renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      fireKeyDown("n", { target: input });

      expect(onNewTicket).not.toHaveBeenCalled();
    });

    it("should return shortcuts list for help display", () => {
      const { result } = renderHook(() => useKeyboardShortcuts());

      expect(result.current.shortcuts).toEqual(KEYBOARD_SHORTCUTS);
      expect(result.current.shortcuts.length).toBeGreaterThan(0);
      expect(result.current.shortcuts[0]).toHaveProperty("key");
      expect(result.current.shortcuts[0]).toHaveProperty("description");
      expect(result.current.shortcuts[0]).toHaveProperty("category");
    });
  });

  // ===========================================================================
  // INPUT FIELD DETECTION TESTS
  // ===========================================================================

  describe("Input field detection", () => {
    it("should disable shortcuts when focus is in INPUT element", () => {
      const onNewTicket = vi.fn();
      const input = createInput();
      renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      fireKeyDown("n", { target: input });

      expect(onNewTicket).not.toHaveBeenCalled();
    });

    it("should disable shortcuts when focus is in TEXTAREA element", () => {
      const onNewTicket = vi.fn();
      const textarea = createTextarea();
      renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      fireKeyDown("n", { target: textarea });

      expect(onNewTicket).not.toHaveBeenCalled();
    });

    it("should disable shortcuts when focus is in contenteditable element", () => {
      const onNewTicket = vi.fn();
      const contentEditable = createContentEditable();
      renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      fireKeyDown("n", { target: contentEditable });

      expect(onNewTicket).not.toHaveBeenCalled();
    });

    it("should enable shortcuts when focus is on a button", () => {
      const onNewTicket = vi.fn();
      const button = createButton();
      renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      fireKeyDown("n", { target: button });

      expect(onNewTicket).toHaveBeenCalledTimes(1);
    });

    it("should still allow Escape when in input field", () => {
      const onCloseModal = vi.fn();
      const input = createInput();
      renderHook(() => useKeyboardShortcuts({ onCloseModal }));

      fireKeyDown("Escape", { target: input });

      expect(onCloseModal).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // DISABLED STATE TESTS
  // ===========================================================================

  describe("Disabled state", () => {
    it("should not call callbacks when disabled=true", () => {
      const onNewTicket = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onNewTicket, disabled: true }));

      fireKeyDown("n");

      expect(onNewTicket).not.toHaveBeenCalled();
    });

    it("should still allow Escape when disabled (for closing modals)", () => {
      const onCloseModal = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onCloseModal, disabled: true }));

      fireKeyDown("Escape");

      expect(onCloseModal).toHaveBeenCalledTimes(1);
    });

    it("should not call onRefresh when isRefreshing=true", () => {
      const onRefresh = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onRefresh, isRefreshing: true }));

      fireKeyDown("r");

      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SHORTCUTS BY CATEGORY TESTS
  // ===========================================================================

  describe("Shortcuts by category", () => {
    it("should return shortcuts grouped by category", () => {
      const { result } = renderHook(() => useKeyboardShortcuts());

      expect(result.current.shortcutsByCategory).toBeDefined();
      expect(typeof result.current.shortcutsByCategory).toBe("object");
    });

    it("should include global category with shortcuts", () => {
      const { result } = renderHook(() => useKeyboardShortcuts());
      const globalShortcuts = result.current.shortcutsByCategory["global"];

      expect(globalShortcuts).toBeDefined();
      expect(globalShortcuts!.length).toBeGreaterThan(0);
    });

    it("should include modals category with Escape shortcut", () => {
      const { result } = renderHook(() => useKeyboardShortcuts());
      const modalsShortcuts = result.current.shortcutsByCategory["modals"];

      expect(modalsShortcuts).toBeDefined();
      const escapeShortcut = modalsShortcuts!.find((s) => s.key === "Escape");
      expect(escapeShortcut).toBeDefined();
    });
  });

  // ===========================================================================
  // CLEANUP TESTS
  // ===========================================================================

  describe("Cleanup", () => {
    it("should remove event listener on unmount", () => {
      const onNewTicket = vi.fn();
      const { unmount } = renderHook(() => useKeyboardShortcuts({ onNewTicket }));

      unmount();

      fireKeyDown("n");

      expect(onNewTicket).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// EXPORTED CONSTANTS TESTS
// =============================================================================

describe("KEYBOARD_SHORTCUTS constant", () => {
  it("should include 'n' shortcut for new ticket", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "n");
    expect(shortcut).toBeDefined();
    expect(shortcut?.description).toContain("ticket");
  });

  it("should include '/' shortcut for search", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "/");
    expect(shortcut).toBeDefined();
    expect(shortcut?.description.toLowerCase()).toContain("search");
  });

  it("should include '?' shortcut for help", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "?");
    expect(shortcut).toBeDefined();
    expect(shortcut?.description.toLowerCase()).toContain("shortcut");
  });

  it("should include 'Escape' shortcut for closing modals", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "Escape");
    expect(shortcut).toBeDefined();
    expect(shortcut?.description.toLowerCase()).toContain("close");
  });

  it("should include '1' shortcut for Dashboard navigation", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "1");
    expect(shortcut).toBeDefined();
    expect(shortcut?.category).toBe("navigation");
    expect(shortcut?.description.toLowerCase()).toContain("dashboard");
  });

  it("should include '2' shortcut for Board navigation", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "2");
    expect(shortcut).toBeDefined();
    expect(shortcut?.category).toBe("navigation");
    expect(shortcut?.description.toLowerCase()).toContain("board");
  });

  it("should include '3' shortcut for Projects toggle", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "3");
    expect(shortcut).toBeDefined();
    expect(shortcut?.category).toBe("navigation");
    expect(shortcut?.description.toLowerCase()).toContain("project");
  });

  it("should include '4' shortcut for Settings", () => {
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.key === "4");
    expect(shortcut).toBeDefined();
    expect(shortcut?.category).toBe("navigation");
    expect(shortcut?.description.toLowerCase()).toContain("setting");
  });

  it("should have valid categories for all shortcuts", () => {
    const validCategories = ["global", "navigation", "board", "modals"];
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(validCategories).toContain(shortcut.category);
    }
  });
});

describe("SHORTCUT_CATEGORY_LABELS constant", () => {
  it("should have labels for all categories used in shortcuts", () => {
    const usedCategories = new Set(KEYBOARD_SHORTCUTS.map((s) => s.category));
    for (const category of usedCategories) {
      expect(SHORTCUT_CATEGORY_LABELS[category]).toBeDefined();
    }
  });

  it("should have human-readable labels", () => {
    expect(SHORTCUT_CATEGORY_LABELS.global).toBe("Global");
    expect(SHORTCUT_CATEGORY_LABELS.navigation).toBe("Navigation");
    expect(SHORTCUT_CATEGORY_LABELS.modals).toBe("Modals");
  });
});
