import { type FC, type ReactNode } from "react";
import { Search, Plus } from "lucide-react";

export interface HeaderProps {
  /** Content to render in the logo/brand area on the left */
  logo?: ReactNode;
  /** Content to render in the search area (center) - typically SearchBar component */
  searchSlot?: ReactNode;
  /** Content to render in the status area (right) - typically StatusPill components */
  statusSlot?: ReactNode;
  /** Content to render in the actions area (far right) - typically NewTicketDropdown */
  actionsSlot?: ReactNode;
  /** Handler for clicking the "New" button (used when actionsSlot is not provided) */
  onNewClick?: () => void;
}

/**
 * Header component - Main navigation bar at the top of the content area.
 *
 * Features:
 * - **Full width**: Spans the entire content area width
 * - **64px height**: Matches the sidebar icon size for visual consistency
 * - **Logo/brand area**: On the left side
 * - **Search bar**: In the center (slot for SearchBar component)
 * - **Status pills**: On the right (slot for StatusPill components)
 * - **"New" button**: On the far right (slot for NewTicketDropdown)
 * - **Background**: Uses --bg-secondary CSS variable
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Brain Dump    [🔍 Search...     ]    🐳 Running  ⚡ AI   [+]│
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */
export const Header: FC<HeaderProps> = ({
  logo,
  searchSlot,
  statusSlot,
  actionsSlot,
  onNewClick,
}) => {
  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: "64px",
    minHeight: "64px",
    background: "var(--bg-secondary)",
    borderBottom: "1px solid var(--border-primary)",
    padding: "0 var(--spacing-6)",
    gap: "var(--spacing-4)",
  };

  const logoAreaStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    flexShrink: 0,
  };

  const brandStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  };

  const searchAreaStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    flex: 1,
    maxWidth: "480px",
    margin: "0 auto",
  };

  // Placeholder search input styles (used when searchSlot is not provided)
  const placeholderSearchStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    height: "40px",
    padding: "0 var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
    cursor: "text",
  };

  const rightSectionStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-3)",
    flexShrink: 0,
  };

  const statusAreaStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
  };

  // Placeholder status pill styles (used when statusSlot is not provided)
  const placeholderPillStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    padding: "var(--spacing-1) var(--spacing-2)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-full)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
    whiteSpace: "nowrap",
  };

  const newButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-1)",
    height: "36px",
    padding: "0 var(--spacing-3)",
    background: "var(--gradient-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
    transition: "all var(--transition-normal)",
  };

  const handleNewButtonHover = (e: React.MouseEvent<HTMLButtonElement>, isHovering: boolean) => {
    const target = e.currentTarget;
    if (isHovering) {
      target.style.filter = "brightness(1.1)";
      target.style.boxShadow = "var(--shadow-glow-sm)";
    } else {
      target.style.filter = "none";
      target.style.boxShadow = "none";
    }
  };

  return (
    <header style={headerStyles} role="banner">
      <div style={logoAreaStyles}>
        {logo ?? (
          <div style={brandStyles}>
            <span>Brain Dump</span>
          </div>
        )}
      </div>

      <div style={searchAreaStyles}>
        {searchSlot ?? (
          <div style={placeholderSearchStyles}>
            <Search size={16} aria-hidden="true" />
            <span>Search tickets...</span>
          </div>
        )}
      </div>

      <div style={rightSectionStyles}>
        <div style={statusAreaStyles}>
          {statusSlot ?? (
            <>
              <span style={placeholderPillStyles}>
                <span style={{ fontSize: "12px" }}>🐳</span>
                <span>Docker</span>
              </span>
              <span style={placeholderPillStyles}>
                <span style={{ fontSize: "12px" }}>⚡</span>
                <span>AI</span>
              </span>
            </>
          )}
        </div>

        {actionsSlot ?? (
          <button
            type="button"
            style={newButtonStyles}
            onClick={onNewClick}
            onMouseEnter={(e) => handleNewButtonHover(e, true)}
            onMouseLeave={(e) => handleNewButtonHover(e, false)}
            aria-label="Create new ticket"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-secondary)]"
          >
            <Plus size={16} aria-hidden="true" />
            <span>New</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
