import { useState, useRef, useEffect, useCallback, useId, type KeyboardEvent } from "react";

export interface SelectOption<T = string> {
  /** The value stored when this option is selected */
  value: T;
  /** The display text for this option */
  label: string;
}

export interface SelectProps<T = string> {
  /** Array of options to display in the dropdown */
  options: SelectOption<T>[];
  /** Currently selected value */
  value: T | null;
  /** Callback when selection changes */
  onChange: (value: T) => void;
  /** Placeholder text when no value is selected */
  placeholder?: string;
  /** Label text above the select */
  label?: string;
  /** Error message to display (also triggers error styling) */
  error?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Enable search/filter within options */
  searchable?: boolean;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** ID for the select element */
  id?: string;
}

/**
 * Simple chevron icon using SVG.
 * Rotates based on dropdown open state.
 */
function ChevronIcon({ isOpen, style }: { isOpen: boolean; style?: React.CSSProperties }) {
  return (
    <svg
      style={{
        width: "18px",
        height: "18px",
        transition: "transform var(--transition-normal)",
        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        flexShrink: 0,
        ...style,
      }}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Simple check icon for selected option indication.
 */
function CheckIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      style={{
        width: "16px",
        height: "16px",
        flexShrink: 0,
        ...style,
      }}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Styles for the wrapper container.
 */
const getWrapperStyles = (): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
  width: "100%",
  position: "relative",
});

/**
 * Styles for the label element.
 */
const getLabelStyles = (): React.CSSProperties => ({
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  lineHeight: "var(--line-height-tight)",
});

/**
 * Styles for the trigger button.
 */
const getTriggerStyles = (
  hasError: boolean,
  disabled: boolean,
  isOpen: boolean
): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  backgroundColor: "var(--bg-secondary)",
  border: hasError
    ? "1px solid var(--error)"
    : isOpen
      ? "1px solid var(--accent-primary)"
      : "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  transition: "all var(--transition-normal)",
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
  outline: "none",
  width: "100%",
  textAlign: "left",
  fontSize: "var(--font-size-base)",
  fontFamily: "inherit",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-normal)",
  ...(isOpen && {
    boxShadow: "0 0 0 1px var(--accent-primary)",
  }),
});

/**
 * Styles for the dropdown menu.
 */
const getDropdownStyles = (isOpen: boolean): React.CSSProperties => ({
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "var(--spacing-1)",
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 50,
  maxHeight: "240px",
  overflowY: "auto",
  display: isOpen ? "block" : "none",
  padding: "var(--spacing-1)",
});

/**
 * Styles for individual option items.
 */
const getOptionStyles = (isSelected: boolean, isHighlighted: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  backgroundColor: isHighlighted || isSelected ? "var(--bg-hover)" : "transparent",
  color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
  fontSize: "var(--font-size-base)",
  lineHeight: "var(--line-height-normal)",
});

/**
 * Styles for the search input inside the dropdown.
 */
const getSearchInputStyles = (): React.CSSProperties => ({
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-3)",
  backgroundColor: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  fontSize: "var(--font-size-sm)",
  fontFamily: "inherit",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-normal)",
  marginBottom: "var(--spacing-1)",
});

/**
 * Styles for error message text.
 */
const getErrorStyles = (): React.CSSProperties => ({
  fontSize: "var(--font-size-sm)",
  color: "var(--error)",
  marginTop: "var(--spacing-1)",
  lineHeight: "var(--line-height-tight)",
});

/**
 * Styles for placeholder text.
 */
const getPlaceholderStyles = (): React.CSSProperties => ({
  color: "var(--text-muted)",
});

/**
 * Styles for "no results" message.
 */
const getNoResultsStyles = (): React.CSSProperties => ({
  padding: "var(--spacing-2) var(--spacing-3)",
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
  textAlign: "center",
});

/**
 * Select component with theme-aware styling.
 *
 * Features:
 * - Custom styled dropdown (not native select)
 * - Chevron icon on right with rotation animation
 * - Full keyboard navigation (arrow keys, Enter, Escape, Home, End)
 * - Optional search/filter within options
 * - Click outside closes dropdown
 * - Accessible with proper ARIA attributes
 */
export function Select<T = string>({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  label,
  error,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
  className = "",
  style,
  id,
}: SelectProps<T>) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const errorId = error ? `${selectId}-error` : undefined;

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");

  // Refs
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Find the currently selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search query
  const filteredOptions =
    searchable && searchQuery
      ? options.filter((opt) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
      : options;

  // Open dropdown
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setHighlightedIndex(
      value !== null ? filteredOptions.findIndex((opt) => opt.value === value) : 0
    );
    setSearchQuery("");
  }, [disabled, value, filteredOptions]);

  // Close dropdown
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    setSearchQuery("");
    triggerRef.current?.focus();
  }, []);

  // Toggle dropdown
  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isOpen, openDropdown, closeDropdown]);

  // Select an option
  const selectOption = useCallback(
    (option: SelectOption<T>) => {
      onChange(option.value);
      closeDropdown();
    },
    [onChange, closeDropdown]
  );

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, closeDropdown]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      // Small delay to ensure dropdown is rendered
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen, searchable]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      // Guard against scrollIntoView not being available (e.g., in jsdom)
      optionRefs.current[highlightedIndex]?.scrollIntoView?.({
        block: "nearest",
      });
    }
  }, [isOpen, highlightedIndex]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
      if (disabled) return;

      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
            selectOption(filteredOptions[highlightedIndex]);
          }
          break;

        case "Escape":
          event.preventDefault();
          if (isOpen) {
            closeDropdown();
          }
          break;

        case "ArrowDown":
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }
          break;

        case "Home":
          event.preventDefault();
          if (isOpen && filteredOptions.length > 0) {
            setHighlightedIndex(0);
          }
          break;

        case "End":
          event.preventDefault();
          if (isOpen && filteredOptions.length > 0) {
            setHighlightedIndex(filteredOptions.length - 1);
          }
          break;

        case "Tab":
          if (isOpen) {
            closeDropdown();
          }
          break;
      }
    },
    [disabled, isOpen, highlightedIndex, filteredOptions, openDropdown, closeDropdown, selectOption]
  );

  // Handle search input key events
  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // Prevent space from triggering dropdown toggle in search
      if (event.key === " ") {
        event.stopPropagation();
        return;
      }
      handleKeyDown(event);
    },
    [handleKeyDown]
  );

  // Handle search input change - also resets highlighted index
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = event.target.value;
      setSearchQuery(newQuery);
      // Reset to first option when search changes
      // We need to compute the new filtered options here
      const newFiltered = newQuery
        ? options.filter((opt) => opt.label.toLowerCase().includes(newQuery.toLowerCase()))
        : options;
      setHighlightedIndex(newFiltered.length > 0 ? 0 : -1);
    },
    [options]
  );

  const hasError = Boolean(error);

  return (
    <div
      style={{ ...getWrapperStyles(), ...style }}
      className={className}
      data-testid="select-container"
    >
      {/* Label */}
      {label && (
        <label id={`${selectId}-label`} htmlFor={selectId} style={getLabelStyles()}>
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={label ? `${selectId}-label` : undefined}
        aria-invalid={hasError}
        aria-describedby={errorId}
        disabled={disabled}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        style={getTriggerStyles(hasError, disabled, isOpen)}
        className="focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
        data-open={isOpen ? "true" : undefined}
        data-error={hasError ? "true" : undefined}
      >
        <span style={selectedOption ? undefined : getPlaceholderStyles()}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronIcon isOpen={isOpen} style={{ color: "var(--text-tertiary)" }} />
      </button>

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        id={listboxId}
        role="listbox"
        aria-labelledby={selectId}
        style={getDropdownStyles(isOpen)}
        data-testid="select-dropdown"
      >
        {/* Search Input */}
        {searchable && (
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            style={getSearchInputStyles()}
            className="placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
            aria-label="Search options"
            data-testid="select-search"
          />
        )}

        {/* Options */}
        {filteredOptions.length === 0 ? (
          <div style={getNoResultsStyles()}>No options found</div>
        ) : (
          filteredOptions.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;

            return (
              <div
                key={String(option.value)}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={getOptionStyles(isSelected, isHighlighted)}
                data-testid={`select-option-${index}`}
                data-selected={isSelected ? "true" : undefined}
                data-highlighted={isHighlighted ? "true" : undefined}
              >
                <span>{option.label}</span>
                {isSelected && <CheckIcon style={{ color: "var(--accent-primary)" }} />}
              </div>
            );
          })
        )}
      </div>

      {/* Error Message */}
      {error && (
        <span id={errorId} style={getErrorStyles()} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export default Select;
