import {
  type FC,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

// =============================================================================
// Tag Color Palette (shared with TicketTags for consistency)
// =============================================================================

/**
 * Predefined color palette for tags.
 * Each color has a background and text color for good contrast.
 */
const TAG_COLORS = [
  { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" }, // blue
  { bg: "rgba(168, 85, 247, 0.15)", text: "#a855f7" }, // purple
  { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" }, // green
  { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316" }, // orange
  { bg: "rgba(236, 72, 153, 0.15)", text: "#ec4899" }, // pink
  { bg: "rgba(14, 165, 233, 0.15)", text: "#0ea5e9" }, // sky
  { bg: "rgba(234, 179, 8, 0.15)", text: "#ca8a04" }, // yellow (darkened for contrast)
  { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" }, // red
  { bg: "rgba(99, 102, 241, 0.15)", text: "#6366f1" }, // indigo
  { bg: "rgba(20, 184, 166, 0.15)", text: "#14b8a6" }, // teal
] as const;

/**
 * Simple hash function to consistently map tag names to colors.
 * Same tag will always get the same color.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get color for a tag based on its name.
 */
function getTagColor(tag: string): { bg: string; text: string } {
  const index = hashString(tag) % TAG_COLORS.length;
  return TAG_COLORS[index]!;
}

// =============================================================================
// Component Types
// =============================================================================

export interface TagInputProps {
  /** Currently selected tags */
  value: string[];
  /** Handler called when tags change */
  onChange: (tags: string[]) => void;
  /** Available tags for autocomplete (from useTags hook) */
  availableTags?: string[];
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Maximum number of tags allowed (0 = unlimited) */
  maxTags?: number;
  /** ID for the input element (for label association) */
  id?: string;
}

// =============================================================================
// TagPill Sub-component
// =============================================================================

interface TagPillProps {
  tag: string;
  onRemove: () => void;
  disabled?: boolean;
}

const TagPill: FC<TagPillProps> = ({ tag, onRemove, disabled }) => {
  const color = getTagColor(tag);

  return (
    <span
      style={{
        ...tagPillStyles,
        backgroundColor: color.bg,
        color: color.text,
      }}
    >
      <span style={{ marginRight: "4px" }}>{tag}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        style={{
          ...removeButtonStyles,
          color: color.text,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
        aria-label={`Remove tag ${tag}`}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
};

// =============================================================================
// Main TagInput Component
// =============================================================================

/**
 * TagInput - Multi-tag input with pills and autocomplete.
 *
 * Features:
 * - **Pill display**: Shows selected tags as colored pills
 * - **Remove tags**: X button on each pill to remove
 * - **Add tags**: Type and press Enter or comma to add
 * - **Autocomplete**: Shows matching suggestions from availableTags
 * - **Duplicate prevention**: Case-insensitive check for existing tags
 * - **Keyboard navigation**: Arrow keys to navigate suggestions, Escape to close
 */
export const TagInput: FC<TagInputProps> = ({
  value,
  onChange,
  availableTags = [],
  placeholder = "Add tag...",
  disabled = false,
  maxTags = 0,
  id,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsDropdownOpen(false), isDropdownOpen);

  // Filter suggestions based on input (memoized to avoid re-creating on every render)
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];

    const normalizedInput = inputValue.toLowerCase().trim();
    return availableTags.filter((tag) => {
      const normalizedTag = tag.toLowerCase();
      // Must match input and not already be selected
      return (
        normalizedTag.includes(normalizedInput) &&
        !value.some((v) => v.toLowerCase() === normalizedTag)
      );
    });
  }, [inputValue, availableTags, value]);

  // Check if we've reached max tags
  const isAtMaxTags = maxTags > 0 && value.length >= maxTags;

  /**
   * Add a tag (case-insensitive duplicate check)
   */
  const addTag = useCallback(
    (tag: string) => {
      const trimmedTag = tag.trim();
      if (!trimmedTag) return;

      // Case-insensitive duplicate check
      const isDuplicate = value.some((v) => v.toLowerCase() === trimmedTag.toLowerCase());
      if (isDuplicate) return;

      // Check max tags
      if (maxTags > 0 && value.length >= maxTags) return;

      onChange([...value, trimmedTag]);
      setInputValue("");
      setIsDropdownOpen(false);
      setHighlightedIndex(0);
    },
    [value, onChange, maxTags]
  );

  /**
   * Remove a tag by index
   */
  const removeTag = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  /**
   * Handle input changes
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      // Check for comma to add multiple tags
      if (newValue.includes(",")) {
        const parts = newValue.split(",");
        // Add all complete tags (not the last one if still typing)
        parts.slice(0, -1).forEach((part) => {
          const tag = part.trim();
          if (tag) addTag(tag);
        });
        // Keep the last part as the current input
        setInputValue(parts[parts.length - 1] ?? "");
      } else {
        setInputValue(newValue);
        setIsDropdownOpen(newValue.trim().length > 0);
        setHighlightedIndex(0);
      }
    },
    [addTag]
  );

  /**
   * Handle keyboard navigation and submission
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          if (suggestions.length > 0 && isDropdownOpen) {
            // Add highlighted suggestion
            const selectedSuggestion = suggestions[highlightedIndex];
            if (selectedSuggestion) {
              addTag(selectedSuggestion);
            }
          } else if (inputValue.trim()) {
            // Add typed value
            addTag(inputValue);
          }
          break;

        case "Escape":
          e.preventDefault();
          setIsDropdownOpen(false);
          setHighlightedIndex(0);
          break;

        case "ArrowDown":
          e.preventDefault();
          if (isDropdownOpen && suggestions.length > 0) {
            setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (isDropdownOpen && suggestions.length > 0) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          }
          break;

        case "Backspace":
          // Remove last tag if input is empty
          if (inputValue === "" && value.length > 0) {
            removeTag(value.length - 1);
          }
          break;
      }
    },
    [inputValue, suggestions, isDropdownOpen, highlightedIndex, addTag, removeTag, value]
  );

  /**
   * Handle suggestion click
   */
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      addTag(suggestion);
      inputRef.current?.focus();
    },
    [addTag]
  );

  // Scroll highlighted suggestion into view
  useEffect(() => {
    if (!isDropdownOpen || suggestions.length === 0) return;

    const dropdown = dropdownRef.current;
    const highlighted = dropdown?.querySelector(
      `[data-index="${highlightedIndex}"]`
    ) as HTMLElement | null;
    // Guard for JSDOM which doesn't implement scrollIntoView
    if (highlighted && dropdown && typeof highlighted.scrollIntoView === "function") {
      highlighted.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isDropdownOpen, suggestions.length]);

  return (
    <div ref={containerRef} style={containerStyles}>
      {/* Tags container with input */}
      <div
        style={{
          ...inputContainerStyles,
          borderColor: isDropdownOpen ? "var(--accent-primary)" : "var(--border-primary)",
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={() => !disabled && inputRef.current?.focus()}
        role="group"
        aria-label="Tag input"
      >
        {/* Existing tag pills */}
        {value.map((tag, index) => (
          <TagPill
            key={`${tag}-${index}`}
            tag={tag}
            onRemove={() => removeTag(index)}
            disabled={disabled}
          />
        ))}

        {/* Text input (hidden if at max tags) */}
        {!isAtMaxTags && (
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue.trim() && setIsDropdownOpen(true)}
            placeholder={value.length === 0 ? placeholder : ""}
            disabled={disabled}
            style={textInputStyles}
            aria-label="Add tag"
            aria-expanded={isDropdownOpen}
            aria-autocomplete="list"
            aria-controls={isDropdownOpen ? "tag-suggestions" : undefined}
            autoComplete="off"
          />
        )}
      </div>

      {/* Autocomplete dropdown */}
      {isDropdownOpen && suggestions.length > 0 && (
        <div ref={dropdownRef} id="tag-suggestions" role="listbox" style={dropdownStyles}>
          {suggestions.map((suggestion, index) => {
            const isHighlighted = index === highlightedIndex;
            const color = getTagColor(suggestion);

            return (
              <div
                key={suggestion}
                data-index={index}
                role="option"
                aria-selected={isHighlighted}
                onClick={() => handleSuggestionClick(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  ...suggestionItemStyles,
                  backgroundColor: isHighlighted ? "var(--bg-hover)" : "transparent",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: color.text,
                    marginRight: "8px",
                    flexShrink: 0,
                  }}
                />
                {suggestion}
              </div>
            );
          })}
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

const inputContainerStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "4px",
  padding: "6px 8px",
  minHeight: "38px",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  cursor: "text",
  transition: "border-color var(--transition-fast)",
};

const tagPillStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "9999px", // fully rounded (pill shape)
  padding: "2px 6px 2px 8px",
  fontSize: "12px",
  fontWeight: 500,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

const removeButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2px",
  background: "transparent",
  border: "none",
  borderRadius: "50%",
  transition: "opacity var(--transition-fast)",
};

const textInputStyles: React.CSSProperties = {
  flex: 1,
  minWidth: "60px",
  padding: "2px 4px",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
};

const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "4px",
  maxHeight: "200px",
  overflowY: "auto",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 100,
};

const suggestionItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  cursor: "pointer",
  transition: "background-color var(--transition-fast)",
};

export default TagInput;
