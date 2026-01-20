import { type FC, useState, useRef, useCallback, type KeyboardEvent } from "react";
import { ChevronDown, Plus, Circle } from "lucide-react";
import { useClickOutside, type Epic } from "../../lib/hooks";

// =============================================================================
// Component Types
// =============================================================================

export interface EpicSelectProps {
  /** The currently selected project ID. When null, the select is disabled. */
  projectId: string | null;
  /** Currently selected epic ID (null = no epic) */
  value: string | null;
  /** Handler called when epic selection changes */
  onChange: (epicId: string | null) => void;
  /** List of epics for the selected project */
  epics: Epic[];
  /** Handler called when "Create New Epic" is clicked */
  onCreateEpic?: () => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** ID for the select element (for label association) */
  id?: string;
}

// =============================================================================
// Color Utilities
// =============================================================================

/**
 * Default epic colors for when no color is set.
 * Uses the project's accent colors palette.
 */
const DEFAULT_EPIC_COLORS = [
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#ec4899", // pink
  "#0ea5e9", // sky
  "#eab308", // yellow
  "#ef4444", // red
  "#6366f1", // indigo
  "#14b8a6", // teal
] as const;

/**
 * Get a color for an epic. Uses the epic's color if set,
 * otherwise derives a consistent color from the epic title.
 */
function getEpicColor(epic: Epic): string {
  if (epic.color) return epic.color;

  // Derive from title hash for consistency
  let hash = 0;
  for (let i = 0; i < epic.title.length; i++) {
    const char = epic.title.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % DEFAULT_EPIC_COLORS.length;
  return DEFAULT_EPIC_COLORS[index]!;
}

// =============================================================================
// Main EpicSelect Component
// =============================================================================

/**
 * EpicSelect - Dropdown for selecting an epic, filtered by project.
 *
 * Features:
 * - **Disabled when no project**: Shows helpful message
 * - **"No epic" option**: Allows clearing the selection
 * - **"Create New Epic"**: Button at bottom to open epic creation modal
 * - **Color indicators**: Shows epic color dot next to each option
 * - **Keyboard accessible**: Arrow keys, Enter, Escape support
 */
export const EpicSelect: FC<EpicSelectProps> = ({
  projectId,
  value,
  onChange,
  epics,
  onCreateEpic,
  disabled = false,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Determine if select should be disabled
  const isDisabled = disabled || !projectId;

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  // Find the selected epic
  const selectedEpic = value ? epics.find((e) => e.id === value) : null;

  /**
   * Toggle dropdown open/closed
   */
  const handleToggle = useCallback(() => {
    if (isDisabled) return;
    setIsOpen((prev) => !prev);
    setHighlightedIndex(-1);
  }, [isDisabled]);

  /**
   * Handle selecting an epic (or clearing selection)
   */
  const handleSelect = useCallback(
    (epicId: string | null) => {
      onChange(epicId);
      setIsOpen(false);
      setHighlightedIndex(-1);
      buttonRef.current?.focus();
    },
    [onChange]
  );

  /**
   * Handle "Create New Epic" click
   */
  const handleCreateEpic = useCallback(() => {
    setIsOpen(false);
    onCreateEpic?.();
  }, [onCreateEpic]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (isDisabled) return;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen) {
            if (highlightedIndex === -1) {
              // "No epic" option
              handleSelect(null);
            } else if (highlightedIndex < epics.length) {
              const epic = epics[highlightedIndex];
              if (epic) handleSelect(epic.id);
            } else if (highlightedIndex === epics.length && onCreateEpic) {
              // "Create New Epic" option
              handleCreateEpic();
            }
          } else {
            setIsOpen(true);
          }
          break;

        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;

        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            // Max index includes "Create New Epic" if onCreateEpic is provided
            const maxIndex = onCreateEpic ? epics.length : epics.length - 1;
            setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : prev));
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => (prev > -1 ? prev - 1 : -1));
          }
          break;

        case "Home":
          e.preventDefault();
          setHighlightedIndex(-1);
          break;

        case "End": {
          e.preventDefault();
          const endIndex = onCreateEpic ? epics.length : epics.length - 1;
          setHighlightedIndex(endIndex);
          break;
        }
      }
    },
    [isOpen, isDisabled, highlightedIndex, epics, handleSelect, handleCreateEpic, onCreateEpic]
  );

  return (
    <div ref={containerRef} style={containerStyles}>
      {/* Select Button */}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        style={{
          ...selectButtonStyles,
          opacity: isDisabled ? 0.6 : 1,
          cursor: isDisabled ? "not-allowed" : "pointer",
          borderColor: isOpen ? "var(--accent-primary)" : "var(--border-primary)",
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={isDisabled}
      >
        <span style={selectedValueStyles}>
          {selectedEpic ? (
            <>
              <span
                style={{
                  ...colorDotStyles,
                  backgroundColor: getEpicColor(selectedEpic),
                }}
                aria-hidden="true"
              />
              <span style={selectedTextStyles}>{selectedEpic.title}</span>
            </>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>No epic</span>
          )}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: "var(--text-secondary)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
          aria-hidden="true"
        />
      </button>

      {/* Helper text when disabled */}
      {!projectId && !disabled && <p style={helperTextStyles}>Select a project first</p>}

      {/* Dropdown Menu */}
      {isOpen && (
        <ul ref={listRef} role="listbox" aria-label="Select an epic" style={dropdownStyles}>
          {/* "No epic" option */}
          <li
            role="option"
            aria-selected={value === null}
            onClick={() => handleSelect(null)}
            onMouseEnter={() => setHighlightedIndex(-1)}
            style={{
              ...optionStyles,
              backgroundColor: highlightedIndex === -1 ? "var(--bg-hover)" : "transparent",
            }}
          >
            <Circle
              size={12}
              style={{ color: "var(--text-tertiary)", marginRight: "8px" }}
              aria-hidden="true"
            />
            <span style={{ color: "var(--text-secondary)" }}>No epic</span>
          </li>

          {/* Epic options */}
          {epics.map((epic, index) => {
            const isSelected = epic.id === value;
            const isHighlighted = index === highlightedIndex;
            const color = getEpicColor(epic);

            return (
              <li
                key={epic.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(epic.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  ...optionStyles,
                  backgroundColor: isHighlighted ? "var(--bg-hover)" : "transparent",
                }}
              >
                <span
                  style={{
                    ...colorDotStyles,
                    backgroundColor: color,
                  }}
                  aria-hidden="true"
                />
                <span style={optionTextStyles}>{epic.title}</span>
              </li>
            );
          })}

          {/* "Create New Epic" option */}
          {onCreateEpic && (
            <>
              <li style={dividerStyles} role="separator" aria-hidden="true" />
              <li
                role="option"
                aria-selected={false}
                onClick={handleCreateEpic}
                onMouseEnter={() => setHighlightedIndex(epics.length)}
                style={{
                  ...optionStyles,
                  backgroundColor:
                    highlightedIndex === epics.length ? "var(--bg-hover)" : "transparent",
                  color: "var(--accent-primary)",
                }}
              >
                <Plus size={14} style={{ marginRight: "8px" }} aria-hidden="true" />
                <span style={{ fontWeight: 500 }}>Create New Epic</span>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
};

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  position: "relative",
  width: "100%",
};

const selectButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-base)",
  textAlign: "left",
  transition: "border-color var(--transition-fast)",
};

const selectedValueStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flex: 1,
  overflow: "hidden",
};

const selectedTextStyles: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const colorDotStyles: React.CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  flexShrink: 0,
};

const helperTextStyles: React.CSSProperties = {
  marginTop: "var(--spacing-1)",
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-xs)",
};

const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "4px",
  maxHeight: "240px",
  overflowY: "auto",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 100,
  padding: "4px 0",
  listStyle: "none",
};

const optionStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  cursor: "pointer",
  transition: "background-color var(--transition-fast)",
};

const optionTextStyles: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const dividerStyles: React.CSSProperties = {
  height: "1px",
  margin: "4px 0",
  background: "var(--border-primary)",
};

export default EpicSelect;
