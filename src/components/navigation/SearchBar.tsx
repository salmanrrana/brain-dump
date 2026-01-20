import { type FC, useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useSearch, useClickOutside, type SearchResult } from "../../lib/hooks";

export interface SearchBarProps {
  projectId?: string | null;
  onResultSelect?: (result: SearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
}

const DROPDOWN_KEYFRAMES = `
@keyframes searchbar-dropdown-fade {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
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
  } catch (error) {
    // Animation unavailable but component functional
    if (process.env.NODE_ENV !== "production") {
      console.warn("[SearchBar] Failed to inject dropdown keyframes:", error);
    }
  }
}

function sanitizeSnippet(html: string): string {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "var(--text-muted)" },
  ready: { label: "Ready", color: "var(--accent-primary)" },
  in_progress: { label: "In Progress", color: "var(--status-warning)" },
  review: { label: "Review", color: "var(--status-info)" },
  ai_review: { label: "AI Review", color: "var(--status-info)" },
  human_review: { label: "Human Review", color: "var(--status-info)" },
  done: { label: "Done", color: "var(--status-success)" },
};

export const SearchBar: FC<SearchBarProps> = ({
  projectId,
  onResultSelect,
  placeholder = "Search tickets...",
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, results, loading, error, search, clearSearch } = useSearch(projectId);
  const [isClosed, setIsClosed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const isOpen = query.trim().length > 0 && !isClosed;

  // Inject keyframes for dropdown animation (useEffect to avoid side effects during render)
  useEffect(() => {
    injectKeyframes();
  }, []);

  useClickOutside(
    containerRef,
    useCallback(() => setIsClosed(true), []),
    isOpen
  );

  const handleInputChange = useCallback(
    (value: string) => {
      search(value);
      setIsClosed(false);
      setSelectedIndex(-1);
    },
    [search]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onResultSelect?.(result);
      clearSearch();
      setIsClosed(true);
      inputRef.current?.blur();
    },
    [onResultSelect, clearSearch]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;
      const maxIndex = results.length - 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
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

  const handleClear = useCallback(() => {
    clearSearch();
    setIsClosed(true);
    inputRef.current?.focus();
  }, [clearSearch]);

  return (
    <div ref={containerRef} className="search-bar">
      <div className="search-bar__input-wrapper" onFocus={() => query.trim() && setIsClosed(false)}>
        {loading ? (
          <Loader2
            size={16}
            className="search-bar__icon search-bar__icon--spinning"
            aria-hidden="true"
          />
        ) : (
          <Search size={16} className="search-bar__icon" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="search-bar__input"
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
            className="search-bar__clear"
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          id="search-results"
          role="listbox"
          className="search-bar__dropdown"
          aria-label="Search results"
        >
          {error ? (
            <div className="search-bar__state search-bar__state--error" role="alert">
              Search failed: {error}
            </div>
          ) : loading ? (
            <div className="search-bar__state search-bar__state--loading">
              <Loader2 size={16} className="search-bar__icon--spinning" aria-hidden="true" />
              <span>Searching...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="search-bar__state">No results found</div>
          ) : (
            results.map((result, index) => {
              const status = STATUS_MAP[result.status] ?? {
                label: result.status,
                color: "var(--text-muted)",
              };
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={result.id}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`search-bar__result ${isSelected ? "search-bar__result--selected" : ""}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseLeave={() => setSelectedIndex(-1)}
                >
                  <div className="search-bar__result-row">
                    <span className="search-bar__result-title">{result.title}</span>
                    <span className="search-bar__status" style={{ color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                  {result.snippet && (
                    <span
                      className="search-bar__snippet"
                      dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <style>{`
        .search-bar { position: relative; width: 100%; }
        .search-bar__input-wrapper {
          display: flex; align-items: center; gap: var(--spacing-2);
          width: 100%; height: 40px; padding: 0 var(--spacing-3);
          background: var(--bg-primary); border: 1px solid var(--border-primary);
          border-radius: var(--radius-lg); transition: all var(--transition-normal);
        }
        .search-bar__input {
          flex: 1; background: transparent; border: none; outline: none;
          color: var(--text-primary); font-size: var(--font-size-sm);
        }
        .search-bar__icon { color: var(--text-muted); flex-shrink: 0; }
        .search-bar__icon--spinning { animation: spin 1s linear infinite; }
        .search-bar__clear {
          display: flex; align-items: center; justify-content: center;
          padding: var(--spacing-1); background: transparent; border: none;
          border-radius: var(--radius-sm); color: var(--text-muted); cursor: pointer;
        }
        .search-bar__clear:hover { color: var(--text-primary); background: var(--bg-hover); }
        .search-bar__dropdown {
          position: absolute; top: calc(100% + var(--spacing-2)); left: 0; right: 0;
          max-height: 320px; overflow-y: auto; background: var(--bg-secondary);
          border: 1px solid var(--border-primary); border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg); z-index: var(--z-dropdown);
          animation: searchbar-dropdown-fade 150ms ease-out;
        }
        .search-bar__state {
          padding: var(--spacing-6); text-align: center;
          color: var(--text-muted); font-size: var(--font-size-sm);
        }
        .search-bar__state--error { color: var(--status-error); padding: var(--spacing-4); }
        .search-bar__state--loading { display: flex; align-items: center; justify-content: center; gap: var(--spacing-2); }
        .search-bar__result {
          display: flex; flex-direction: column; gap: var(--spacing-1);
          padding: var(--spacing-3); cursor: pointer;
          border-bottom: 1px solid var(--border-primary);
          transition: background var(--transition-fast);
        }
        .search-bar__result:hover, .search-bar__result--selected { background: var(--bg-hover); }
        .search-bar__result-row { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-2); }
        .search-bar__result-title {
          font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
          color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }
        .search-bar__status {
          display: inline-flex; padding: var(--spacing-px) var(--spacing-2);
          font-size: var(--font-size-xs); font-weight: var(--font-weight-medium);
          background: color-mix(in srgb, currentColor 15%, transparent);
          border-radius: var(--radius-sm); flex-shrink: 0;
        }
        .search-bar__snippet {
          font-size: var(--font-size-xs); color: var(--text-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default SearchBar;
