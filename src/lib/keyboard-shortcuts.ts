import { useEffect, useCallback, useMemo } from "react";

/**
 * Definition of a keyboard shortcut for display in help modal
 */
export interface ShortcutDefinition {
  /** The key to press (e.g., "n", "/", "?", "Escape") */
  key: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping in help display */
  category: "global" | "navigation" | "board" | "modals";
}

/**
 * Configuration for the useKeyboardShortcuts hook
 */
export interface KeyboardShortcutConfig {
  /** Called when 'n' is pressed - opens new ticket modal */
  onNewTicket?: () => void;
  /** Called when 'r' is pressed - refreshes data */
  onRefresh?: () => void;
  /** Called when '/' is pressed - focuses search input */
  onFocusSearch?: () => void;
  /** Called when '?' is pressed - opens shortcuts help */
  onShowShortcuts?: () => void;
  /** Called when Escape is pressed - closes any open modal */
  onCloseModal?: () => void;
  /** Whether shortcuts should be disabled (e.g., when a modal is open for most shortcuts) */
  disabled?: boolean;
  /** Whether the refresh action is currently in progress */
  isRefreshing?: boolean;
}

/**
 * Return value from useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsReturn {
  /** All registered shortcuts for display in help modal */
  shortcuts: ShortcutDefinition[];
  /** Shortcuts grouped by category */
  shortcutsByCategory: Record<string, ShortcutDefinition[]>;
}

/**
 * Default shortcut definitions - these are the keyboard shortcuts available in the app
 */
export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  // Global shortcuts
  { key: "n", description: "New ticket", category: "global" },
  { key: "r", description: "Refresh data", category: "global" },
  { key: "/", description: "Focus search", category: "global" },
  { key: "?", description: "Show shortcuts", category: "global" },

  // Modal shortcuts
  { key: "Escape", description: "Close modal", category: "modals" },
];

/**
 * Check if the current focus is in an input-like element
 * where we should not trigger shortcuts
 */
function isInputFocused(): boolean {
  const target = document.activeElement;
  if (!target) return false;

  const tagName = (target as HTMLElement).tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    return true;
  }

  // Also check for contenteditable elements
  if ((target as HTMLElement).isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Hook for global keyboard shortcuts.
 *
 * This hook registers global keydown listeners for application-wide shortcuts.
 * Shortcuts are automatically disabled when focus is in an input field, textarea,
 * or contenteditable element.
 *
 * @example
 * ```tsx
 * const { shortcuts, shortcutsByCategory } = useKeyboardShortcuts({
 *   onNewTicket: () => openNewTicketModal(),
 *   onRefresh: () => refreshData(),
 *   onFocusSearch: () => searchInput.current?.focus(),
 *   onShowShortcuts: () => openShortcutsModal(),
 *   onCloseModal: () => closeModal(),
 *   disabled: isModalOpen,
 * });
 *
 * // Use shortcuts/shortcutsByCategory to render help modal
 * ```
 */
export function useKeyboardShortcuts(
  config: KeyboardShortcutConfig = {}
): UseKeyboardShortcutsReturn {
  const {
    onNewTicket,
    onRefresh,
    onFocusSearch,
    onShowShortcuts,
    onCloseModal,
    disabled = false,
    isRefreshing = false,
  } = config;

  // Memoize the keyboard handler to avoid recreating on every render
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (isInputFocused()) {
        // Exception: Escape should always work to close modals
        if (e.key === "Escape" && onCloseModal) {
          onCloseModal();
        }
        return;
      }

      switch (e.key) {
        case "n":
          if (!disabled && onNewTicket) {
            e.preventDefault();
            onNewTicket();
          }
          break;

        case "r":
          if (!disabled && !isRefreshing && onRefresh) {
            e.preventDefault();
            onRefresh();
          }
          break;

        case "/":
          if (!disabled && onFocusSearch) {
            e.preventDefault();
            onFocusSearch();
          }
          break;

        case "?":
          if (!disabled && onShowShortcuts) {
            e.preventDefault();
            onShowShortcuts();
          }
          break;

        case "Escape":
          // Escape works even when "disabled" because it's used to close modals
          if (onCloseModal) {
            onCloseModal();
          }
          break;
      }
    },
    [disabled, isRefreshing, onNewTicket, onRefresh, onFocusSearch, onShowShortcuts, onCloseModal]
  );

  // Register the global keydown listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Group shortcuts by category for help display
  const shortcutsByCategory = useMemo(() => {
    const grouped: Record<string, ShortcutDefinition[]> = {};
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      const category = shortcut.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category]!.push(shortcut);
    }
    return grouped;
  }, []);

  return {
    shortcuts: KEYBOARD_SHORTCUTS,
    shortcutsByCategory,
  };
}

/**
 * Category labels for display in help modal
 */
export const SHORTCUT_CATEGORY_LABELS: Record<string, string> = {
  global: "Global",
  navigation: "Navigation",
  board: "Board",
  modals: "Modals",
};
