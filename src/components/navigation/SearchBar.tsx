import { type FC, useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useSearch, useClickOutside, type SearchResult } from "../../lib/hooks";

export interface SearchBarProps {
  /** Optional project ID to scope search results */
  projectId?: string | null;
  /** Callback when a search result is selected */
  onResultSelect?: (result: SearchResult) => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Whether the search bar is disabled */
  disabled?: boolean;
}

/**
 * CSS keyframes for dropdown fade-in animation.
 */
const DROPDOWN_KEYFRAMES = `
@keyframes searchbar-dropdown-fade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

let keyframesInjected = false;

function injectKeyframes(): void {
  if (typeof document === "undefined" || keyframesInjected) return;

  try {
    const style = document.createElement("style");
    style.textContent = DROPDOWN_KEYFRAMES;
    document.head.appendChild(style);
    keyframesInjected = true;
  } catch {
    // Dropdown animation will not be available, but component remains functional
  }
}

/**
 * Sanitizes FTS5 snippet HTML to only allow <mark> tags.
 * This prevents XSS while preserving the search highlighting.
 *
 * @param html - The raw HTML snippet from FTS5
 * @returns Sanitized HTML with only <mark> tags allowed
 */
function sanitizeSnippet(html: string): string {
  // First, escape all HTML entities
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Then, unescape only the <mark> and </mark> tags that FTS5 generates
  return escaped.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
}

/**
 * Maps ticket status to display-friendly text and color.
 */
function getStatusDisplay(status: string): { label: string; color: string } {
  const statusMap: Record<string, { label: string; color: string }> = {
    backlog: { label: "Backlog", color: "var(--text-muted)" },
    ready: { label: "Ready", color: "var(--accent-primary)" },
    in_progress: { label: "In Progress", color: "var(--status-warning)" },
    review: { label: "Review", color: "var(--status-info)" },
    ai_review: { label: "AI Review", color: "var(--status-info)" },
    human_review: { label: "Human Review", color: "var(--status-info)" },
    done: { label: "Done", color: "var(--status-success)" },
  };
  return statusMap[status] ?? { label: status, color: "var(--text-muted)" };
}

/**
 * SearchBar component with dropdown results using FTS5 search.
 *
 * Features:
 * - **Search input with icon**: Clean, accessible search input
 * - **Debounced search (300ms)**: Leverages useSearch hook
 * - **Dropdown results**: Shows results as user types
 * - **Result display**: Shows ticket title, status badge, and snippet
 * - **Keyboard navigation**: Arrow keys to navigate, Enter to select, Escape to close
 * - **Click result navigates**: Clicking a result triggers onResultSelect callback
 * - **Empty state**: Shows "No results" message when search returns empty
 * - **Clear button**: X button to clear search when query is present
 */
export const SearchBar: FC<SearchBarProps> = ({
  projectId,
  onResultSelect,
  placeholder = "Search tickets...",
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use the existing useSearch hook which handles debouncing
  const { query, results, loading, error, search, clearSearch } = useSearch(projectId);

  // Track if user explicitly closed the dropdown (Escape, click outside, selection, clear)
  // Dropdown is open when there's a query AND not explicitly closed
  const [isClosed, setIsClosed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Derive isOpen: show dropdown when there's a query, unless user explicitly closed it
  const isOpen = query.trim().length > 0 && !isClosed;

  // Inject keyframes for animation
  injectKeyframes();

  // Close dropdown when clicking outside
  useClickOutside(
    containerRef,
    useCallback(() => {
      setIsClosed(true);
    }, []),
    isOpen
  );

  // Handle search input changes - opens dropdown when typing
  const handleInputChange = useCallback(
    (value: string) => {
      search(value);
      // Re-open dropdown when user types (clears the "explicitly closed" state)
      setIsClosed(false);
      setSelectedIndex(-1);
    },
    [search]
  );

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      onResultSelect?.(result);
      clearSearch();
      setIsClosed(true);
      inputRef.current?.blur();
    },
    [onResultSelect, clearSearch]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const maxIndex = results.length - 1;
            return prev < maxIndex ? prev + 1 : 0;
          });
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const maxIndex = results.length - 1;
            return prev > 0 ? prev - 1 : maxIndex;
          });
          break;

        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            const result = results[selectedIndex];
            if (result) {
              handleSelect(result);
            }
          }
          break;

        case "Escape":
          e.preventDefault();
          setIsClosed(true);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex, handleSelect]
  );

  // Handle clear button click
  const handleClear = useCallback(() => {
    clearSearch();
    setIsClosed(true);
    inputRef.current?.focus();
  }, [clearSearch]);

  // Styles
  const containerStyles: React.CSSProperties = {
    position: "relative",
    width: "100%",
  };

  const inputWrapperStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    height: "40px",
    padding: "0 var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    transition: "all var(--transition-normal)",
  };

  const inputStyles: React.CSSProperties = {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
  };

  const iconStyles: React.CSSProperties = {
    color: "var(--text-muted)",
    flexShrink: 0,
  };

  const clearButtonStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--spacing-1)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const dropdownStyles: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + var(--spacing-2))",
    left: 0,
    right: 0,
    maxHeight: "320px",
    overflowY: "auto",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    zIndex: "var(--z-dropdown)",
    animation: "searchbar-dropdown-fade 150ms ease-out",
  };

  const resultItemStyles = (isSelected: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
    padding: "var(--spacing-3)",
    cursor: "pointer",
    borderBottom: "1px solid var(--border-primary)",
    background: isSelected ? "var(--bg-hover)" : "transparent",
    transition: "background var(--transition-fast)",
  });

  const resultTitleRowStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--spacing-2)",
  };

  const resultTitleStyles: React.CSSProperties = {
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  };

  const statusBadgeStyles = (color: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "var(--spacing-px) var(--spacing-2)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    color: color,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    borderRadius: "var(--radius-sm)",
    flexShrink: 0,
  });

  const snippetStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const emptyStateStyles: React.CSSProperties = {
    padding: "var(--spacing-6)",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
  };

  const errorStateStyles: React.CSSProperties = {
    padding: "var(--spacing-4)",
    textAlign: "center",
    color: "var(--status-error)",
    fontSize: "var(--font-size-sm)",
  };

  const loadingStateStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-6)",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
  };

  return (
    <div ref={containerRef} style={containerStyles}>
      {/* Search Input */}
      <div
        style={inputWrapperStyles}
        onFocus={() => {
          // Re-open dropdown when focusing if there's a query
          if (query.trim().length > 0) {
            setIsClosed(false);
          }
        }}
      >
        {loading ? (
          <Loader2
            size={16}
            style={{ ...iconStyles, animation: "spin 1s linear infinite" }}
            aria-hidden="true"
          />
        ) : (
          <Search size={16} style={iconStyles} aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyles}
          aria-label="Search tickets"
          aria-expanded={isOpen}
          aria-controls="search-results"
          aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
          role="combobox"
          autoComplete="off"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            style={clearButtonStyles}
            aria-label="Clear search"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (
        <div id="search-results" role="listbox" style={dropdownStyles} aria-label="Search results">
          {error ? (
            <div style={errorStateStyles} role="alert">
              Search failed: {error}
            </div>
          ) : loading ? (
            <div style={loadingStateStyles}>
              <Loader2
                size={16}
                style={{ animation: "spin 1s linear infinite" }}
                aria-hidden="true"
              />
              <span>Searching...</span>
            </div>
          ) : results.length === 0 ? (
            <div style={emptyStateStyles}>No results found</div>
          ) : (
            results.map((result, index) => {
              const status = getStatusDisplay(result.status);
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={result.id}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  style={resultItemStyles(isSelected)}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseLeave={() => setSelectedIndex(-1)}
                >
                  <div style={resultTitleRowStyles}>
                    <span style={resultTitleStyles}>{result.title}</span>
                    <span style={statusBadgeStyles(status.color)}>{status.label}</span>
                  </div>
                  {result.snippet && (
                    <span
                      style={snippetStyles}
                      // Sanitized to only allow <mark> tags from FTS5 highlighting
                      dangerouslySetInnerHTML={{
                        __html: sanitizeSnippet(result.snippet),
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Inline styles for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SearchBar;
