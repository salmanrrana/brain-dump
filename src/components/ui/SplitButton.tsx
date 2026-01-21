import {
  type FC,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

/**
 * Option for the dropdown menu in SplitButton.
 */
export interface SplitButtonOption {
  /** Unique identifier for the option */
  id: string;
  /** Display label for the option */
  label: string;
  /** Optional icon to display before the label */
  icon?: LucideIcon;
  /** Whether this option is disabled */
  disabled?: boolean;
}

export interface SplitButtonProps {
  /** Primary action label (shown on main button) */
  primaryLabel: ReactNode;
  /** Primary action icon (optional) */
  primaryIcon?: LucideIcon;
  /** Handler for primary action click */
  onPrimaryClick: () => void;
  /** Alternative options shown in dropdown */
  options: SplitButtonOption[];
  /** Handler when an option is selected */
  onOptionSelect: (optionId: string) => void;
  /** Whether the entire button is disabled */
  disabled?: boolean;
  /** Accessible label for the dropdown button */
  dropdownAriaLabel?: string;
  /** Test ID prefix for testing */
  testId?: string;
}

const SPLITBUTTON_KEYFRAMES = `
@keyframes splitbutton-dropdown-fade {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

let keyframesInjected = false;
function injectKeyframes(): void {
  if (typeof document === "undefined" || keyframesInjected) return;
  try {
    const style = document.createElement("style");
    style.textContent = SPLITBUTTON_KEYFRAMES;
    document.head.appendChild(style);
    keyframesInjected = true;
  } catch (error) {
    // Animation unavailable but component still functional
    console.warn("[SplitButton] Failed to inject keyframes:", error);
  }
}

/**
 * SplitButton - Button with main action and dropdown for alternatives.
 *
 * This component provides a split button pattern where:
 * - The main (left) button executes the primary action immediately
 * - The chevron (right) button opens a dropdown with alternative options
 *
 * Layout:
 * ```
 * ┌─────────────────────┬───┐
 * │ Start with Claude   │ ▾ │
 * └─────────────────────┴───┘
 * ```
 *
 * Features:
 * - **Separate click zones**: Main button vs dropdown chevron
 * - **Full keyboard support**: Tab, Enter, Space, Arrow keys, Escape
 * - **ARIA compliant**: Proper roles and states for screen readers
 * - **Themed**: Uses CSS custom properties for consistent styling
 */
export const SplitButton: FC<SplitButtonProps> = ({
  primaryLabel,
  primaryIcon: PrimaryIcon,
  onPrimaryClick,
  options,
  onOptionSelect,
  disabled = false,
  dropdownAriaLabel = "Show more options",
  testId = "split-button",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isMainHovered, setIsMainHovered] = useState(false);
  const [isDropdownHovered, setIsDropdownHovered] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mainButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);

  // Inject CSS keyframes once on mount
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Filter to enabled options only for keyboard navigation
  const enabledOptions = useMemo(() => options.filter((opt) => !opt.disabled), [options]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  const handleClickOutside = useCallback(() => {
    closeDropdown();
  }, [closeDropdown]);

  useClickOutside(containerRef, handleClickOutside, isOpen);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    setFocusedIndex(-1);
  }, [disabled]);

  const handlePrimaryClick = useCallback(() => {
    if (disabled) return;
    onPrimaryClick();
  }, [disabled, onPrimaryClick]);

  const handleOptionSelect = useCallback(
    (optionId: string) => {
      onOptionSelect(optionId);
      closeDropdown();
      // Return focus to dropdown button after selection
      dropdownButtonRef.current?.focus();
    },
    [onOptionSelect, closeDropdown]
  );

  // Keyboard navigation for dropdown
  const handleDropdownKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!isOpen) {
        // When closed, Enter/Space/ArrowDown opens the dropdown
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setIsOpen(true);
          setFocusedIndex(0); // Focus first item when opening
        }
        return;
      }

      const itemCount = enabledOptions.length;
      if (itemCount === 0) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeDropdown();
          dropdownButtonRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            const option = enabledOptions[focusedIndex];
            if (option) {
              handleOptionSelect(option.id);
            }
          }
          break;
        case "Tab":
          // Allow normal tab behavior but close dropdown
          closeDropdown();
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(itemCount - 1);
          break;
      }
    },
    [isOpen, focusedIndex, enabledOptions, closeDropdown, handleOptionSelect]
  );

  // Handle keyboard on main button (Enter/Space to execute primary)
  const handleMainKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePrimaryClick();
      }
    },
    [handlePrimaryClick]
  );

  // Generate unique ID for ARIA activedescendant pattern
  const getOptionId = useCallback((index: number) => `${testId}-option-${index}`, [testId]);

  // Styles using CSS variables for theming
  const containerStyles: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    borderRadius: "var(--radius-lg)",
    overflow: "visible", // Allow dropdown to overflow
  };

  const baseButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-2)",
    height: "36px",
    background: disabled ? "var(--bg-tertiary)" : "var(--gradient-accent)",
    color: disabled ? "var(--text-muted)" : "var(--text-on-accent, #ffffff)",
    border: "none",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all var(--transition-normal)",
  };

  const mainButtonStyles: React.CSSProperties = {
    ...baseButtonStyles,
    padding: "0 var(--spacing-3)",
    borderTopLeftRadius: "var(--radius-lg)",
    borderBottomLeftRadius: "var(--radius-lg)",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    filter: isMainHovered && !disabled ? "brightness(1.1)" : "none",
    boxShadow: isMainHovered && !disabled ? "var(--shadow-glow-sm)" : "none",
  };

  const dividerStyles: React.CSSProperties = {
    width: "1px",
    height: "100%",
    background: disabled ? "var(--border-primary)" : "rgba(255, 255, 255, 0.2)",
  };

  const dropdownButtonStyles: React.CSSProperties = {
    ...baseButtonStyles,
    padding: "0 var(--spacing-2)",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: "var(--radius-lg)",
    borderBottomRightRadius: "var(--radius-lg)",
    filter: isDropdownHovered && !disabled ? "brightness(1.1)" : "none",
    boxShadow: isDropdownHovered && !disabled ? "var(--shadow-glow-sm)" : "none",
  };

  const dropdownMenuStyles: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    minWidth: "180px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    zIndex: "var(--z-dropdown)",
    animation: "splitbutton-dropdown-fade 150ms ease-out",
    overflow: "hidden",
    padding: "var(--spacing-1) 0",
  };

  const getMenuItemStyles = (isFocused: boolean, isDisabled: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: isFocused && !isDisabled ? "var(--bg-hover)" : "transparent",
    color: isDisabled ? "var(--text-muted)" : "var(--text-primary)",
    border: "none",
    fontSize: "var(--font-size-sm)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    transition: "background var(--transition-fast)",
    textAlign: "left",
    opacity: isDisabled ? 0.5 : 1,
  });

  const iconStyles: React.CSSProperties = {
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  return (
    <div ref={containerRef} style={containerStyles} data-testid={testId}>
      {/* Main action button */}
      <button
        ref={mainButtonRef}
        type="button"
        style={mainButtonStyles}
        onClick={handlePrimaryClick}
        onKeyDown={handleMainKeyDown}
        onMouseEnter={() => setIsMainHovered(true)}
        onMouseLeave={() => setIsMainHovered(false)}
        disabled={disabled}
        data-testid={`${testId}-main`}
        aria-label={typeof primaryLabel === "string" ? primaryLabel : undefined}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-secondary)]"
      >
        {PrimaryIcon && <PrimaryIcon size={16} aria-hidden="true" />}
        {primaryLabel}
      </button>

      {/* Visual divider */}
      <div style={dividerStyles} aria-hidden="true" />

      {/* Dropdown toggle button */}
      <button
        ref={dropdownButtonRef}
        type="button"
        style={dropdownButtonStyles}
        onClick={toggleDropdown}
        onKeyDown={handleDropdownKeyDown}
        onMouseEnter={() => setIsDropdownHovered(true)}
        onMouseLeave={() => setIsDropdownHovered(false)}
        disabled={disabled}
        data-testid={`${testId}-dropdown`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={dropdownAriaLabel}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-secondary)]"
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--transition-fast)",
          }}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={dropdownMenuStyles}
          role="menu"
          aria-label="Alternative actions"
          aria-activedescendant={focusedIndex >= 0 ? getOptionId(focusedIndex) : undefined}
          data-testid={`${testId}-menu`}
        >
          {options.map((option, index) => {
            const Icon = option.icon;
            const enabledIndex = enabledOptions.findIndex((o) => o.id === option.id);
            const isFocused = enabledIndex === focusedIndex;

            return (
              <button
                key={option.id}
                id={getOptionId(index)}
                type="button"
                style={getMenuItemStyles(isFocused, option.disabled ?? false)}
                onClick={() => {
                  if (!option.disabled) {
                    handleOptionSelect(option.id);
                  }
                }}
                onMouseEnter={() => {
                  if (!option.disabled) {
                    // Map to enabled index for keyboard nav consistency
                    setFocusedIndex(enabledIndex);
                  }
                }}
                onMouseLeave={() => setFocusedIndex(-1)}
                role="menuitem"
                aria-disabled={option.disabled}
                tabIndex={-1} // Managed focus via arrow keys
                data-testid={`${testId}-option-${option.id}`}
              >
                {Icon && <Icon size={16} style={iconStyles} aria-hidden="true" />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SplitButton;
