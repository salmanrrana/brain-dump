import { type FC, useState, useRef, useCallback, type KeyboardEvent } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

// =============================================================================
// Constants
// =============================================================================

/**
 * Preset color palette for projects and epics.
 * Carefully selected for visual distinction and accessibility.
 */
export const PRESET_COLORS = [
  "#8b5cf6", // Purple
  "#3b82f6", // Blue
  "#10b981", // Green
  "#eab308", // Yellow
  "#f97316", // Orange
  "#ef4444", // Red
  "#ec4899", // Pink
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#6b7280", // Gray
] as const;

export type PresetColor = (typeof PRESET_COLORS)[number];

// =============================================================================
// Component Types
// =============================================================================

export interface ColorPickerProps {
  /** Currently selected color (hex value) */
  value: string | null;
  /** Handler called when color selection changes */
  onChange: (color: string) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** ID for the button element (for label association) */
  id?: string;
  /** Test ID prefix for testing */
  testId?: string;
  /** Accessible label for the picker */
  "aria-label"?: string;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get a readable color name for accessibility.
 */
function getColorName(hex: string): string {
  const colorNames: Record<string, string> = {
    "#8b5cf6": "Purple",
    "#3b82f6": "Blue",
    "#10b981": "Green",
    "#eab308": "Yellow",
    "#f97316": "Orange",
    "#ef4444": "Red",
    "#ec4899": "Pink",
    "#6366f1": "Indigo",
    "#14b8a6": "Teal",
    "#6b7280": "Gray",
  };
  return colorNames[hex.toLowerCase()] ?? "Custom";
}

// =============================================================================
// Main ColorPicker Component
// =============================================================================

/**
 * ColorPicker - Dropdown for selecting a color from preset swatches.
 *
 * Features:
 * - **Preset swatches**: 10 carefully selected colors
 * - **Selected indicator**: Checkmark on selected color
 * - **Keyboard accessible**: Arrow keys, Enter, Escape support
 * - **ARIA compliant**: Proper roles and states for screen readers
 *
 * Layout:
 * ```
 * ┌────────────┐
 * │ [●] Purple │ ▾
 * └────────────┘
 *     ↓ click
 * ┌──────────────────┐
 * │ ● ● ● ● ●       │
 * │ ● ● ● ● ●       │
 * └──────────────────┘
 * ```
 */
export const ColorPicker: FC<ColorPickerProps> = ({
  value,
  onChange,
  disabled = false,
  id,
  testId = "color-picker",
  "aria-label": ariaLabel = "Select a color",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  // Find current color index for keyboard navigation start position
  const currentColorIndex = value
    ? PRESET_COLORS.findIndex((c) => c.toLowerCase() === value.toLowerCase())
    : -1;

  /**
   * Toggle dropdown open/closed
   */
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => {
      if (!prev) {
        // When opening, focus the currently selected color or first
        setFocusedIndex(currentColorIndex >= 0 ? currentColorIndex : 0);
      }
      return !prev;
    });
  }, [disabled, currentColorIndex]);

  /**
   * Handle selecting a color
   */
  const handleSelect = useCallback(
    (color: string) => {
      onChange(color);
      setIsOpen(false);
      setFocusedIndex(-1);
      buttonRef.current?.focus();
    },
    [onChange]
  );

  /**
   * Handle keyboard navigation
   * Grid layout: 5 columns x 2 rows
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      const COLUMNS = 5;
      const totalColors = PRESET_COLORS.length;

      if (!isOpen) {
        // When closed, Enter/Space/ArrowDown opens the dropdown
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setIsOpen(true);
          setFocusedIndex(currentColorIndex >= 0 ? currentColorIndex : 0);
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < totalColors) {
            const color = PRESET_COLORS[focusedIndex];
            if (color) handleSelect(color);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) => (prev < totalColors - 1 ? prev + 1 : 0));
          break;

        case "ArrowLeft":
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : totalColors - 1));
          break;

        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev + COLUMNS;
            return next < totalColors ? next : prev % COLUMNS;
          });
          break;

        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev - COLUMNS;
            return next >= 0 ? next : totalColors - COLUMNS + (prev % COLUMNS);
          });
          break;

        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;

        case "End":
          e.preventDefault();
          setFocusedIndex(totalColors - 1);
          break;

        case "Tab":
          // Allow normal tab behavior but close dropdown
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
      }
    },
    [isOpen, disabled, focusedIndex, currentColorIndex, handleSelect]
  );

  // Determine displayed color
  const displayColor = value ?? PRESET_COLORS[0];
  const displayColorName = getColorName(displayColor);

  return (
    <div ref={containerRef} style={containerStyles} data-testid={testId}>
      {/* Select Button */}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{
          ...selectButtonStyles,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          borderColor: isOpen ? "var(--accent-primary)" : "var(--border-primary)",
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        aria-label={ariaLabel}
        data-testid={`${testId}-button`}
      >
        <span style={selectedValueStyles}>
          <span
            style={{
              ...colorSwatchStyles,
              backgroundColor: displayColor,
            }}
            aria-hidden="true"
          />
          <span style={selectedTextStyles}>{displayColorName}</span>
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

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Color options"
          aria-activedescendant={focusedIndex >= 0 ? `${testId}-option-${focusedIndex}` : undefined}
          style={dropdownStyles}
          data-testid={`${testId}-dropdown`}
        >
          <div style={swatchGridStyles}>
            {PRESET_COLORS.map((color, index) => {
              const isSelected = value?.toLowerCase() === color.toLowerCase();
              const isFocused = index === focusedIndex;
              const colorName = getColorName(color);

              return (
                <button
                  key={color}
                  id={`${testId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${colorName}${isSelected ? " (selected)" : ""}`}
                  onClick={() => handleSelect(color)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  style={{
                    ...swatchButtonStyles,
                    backgroundColor: color,
                    outline: isFocused ? "2px solid var(--accent-primary)" : "none",
                    outlineOffset: "2px",
                  }}
                  tabIndex={-1}
                  data-testid={`${testId}-swatch-${index}`}
                >
                  {isSelected && <Check size={14} style={checkIconStyles} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
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

const colorSwatchStyles: React.CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "var(--radius-sm)",
  flexShrink: 0,
  border: "1px solid rgba(0, 0, 0, 0.1)",
};

const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "4px",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 100,
  padding: "var(--spacing-3)",
};

const swatchGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: "var(--spacing-2)",
};

const swatchButtonStyles: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "var(--radius-md)",
  border: "2px solid transparent",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "transform var(--transition-fast), box-shadow var(--transition-fast)",
};

const checkIconStyles: React.CSSProperties = {
  color: "#ffffff",
  filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))",
};

export default ColorPicker;
