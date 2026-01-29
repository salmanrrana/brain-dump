import { Keyboard } from "lucide-react";
import { Modal } from "../../components-v2/ui";
import {
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  type ShortcutDefinition,
} from "../../lib/keyboard-shortcuts";

/**
 * Props for the ShortcutsModal component
 */
export interface ShortcutsModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
}

/**
 * Group shortcuts by category for organized display
 */
function groupShortcutsByCategory(): Record<string, ShortcutDefinition[]> {
  const grouped: Record<string, ShortcutDefinition[]> = {};
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    const category = shortcut.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category]!.push(shortcut);
  }
  return grouped;
}

/**
 * Format a key for display in the kbd element
 * Makes certain keys more readable (e.g., "Escape" -> "Esc")
 */
function formatKeyForDisplay(key: string): string {
  const keyMap: Record<string, string> = {
    Escape: "Esc",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  return keyMap[key] ?? key;
}

/**
 * Styled kbd element for displaying keyboard keys
 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "24px",
        padding: "4px 8px",
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-secondary)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-sm)",
        fontWeight: "var(--font-weight-medium)" as unknown as number,
        color: "var(--text-secondary)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
      }}
    >
      {children}
    </kbd>
  );
}

/**
 * Section header for shortcut categories
 */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-semibold)" as unknown as number,
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: "var(--spacing-2)",
      }}
    >
      {children}
    </h3>
  );
}

/**
 * Individual shortcut row with description and key
 */
function ShortcutRow({ shortcut }: { shortcut: ShortcutDefinition }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--spacing-2) 0",
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
        {shortcut.description}
      </span>
      <Kbd>{formatKeyForDisplay(shortcut.key)}</Kbd>
    </div>
  );
}

/**
 * Keyboard Shortcuts Modal
 *
 * Displays all available keyboard shortcuts organized by category.
 * Opens with the `?` key and closes with Escape or click outside.
 *
 * Features:
 * - Opens with `?` key (configured via useKeyboardShortcuts)
 * - Lists shortcuts in organized sections: Global, Navigation, Board, Modals
 * - Keys displayed in styled kbd elements
 * - Description for each shortcut
 * - Closes with Escape or click outside
 *
 * @example
 * ```tsx
 * <ShortcutsModal
 *   isOpen={isShortcutsModalOpen}
 *   onClose={() => setIsShortcutsModalOpen(false)}
 * />
 * ```
 */
export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const shortcutsByCategory = groupShortcutsByCategory();

  // Define the category order for consistent display
  const categoryOrder: Array<keyof typeof SHORTCUT_CATEGORY_LABELS> = [
    "global",
    "navigation",
    "board",
    "modals",
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" aria-labelledby="shortcuts-modal-title">
      <Modal.Header icon={Keyboard} title="Keyboard Shortcuts" onClose={onClose} />
      <Modal.Body>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
          {categoryOrder.map((category) => {
            const shortcuts = shortcutsByCategory[category];
            if (!shortcuts || shortcuts.length === 0) return null;

            return (
              <section key={category}>
                <SectionHeader>{SHORTCUT_CATEGORY_LABELS[category] ?? category}</SectionHeader>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {shortcuts.map((shortcut) => (
                    <ShortcutRow key={shortcut.key} shortcut={shortcut} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Helpful note about shortcuts being disabled in inputs */}
        <p
          style={{
            marginTop: "var(--spacing-4)",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-tertiary)",
          }}
        >
          Shortcuts are disabled when typing in text fields.
        </p>
      </Modal.Body>
    </Modal>
  );
}

export default ShortcutsModal;
