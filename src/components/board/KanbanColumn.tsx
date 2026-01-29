import { memo } from "react";
import type { ReactNode } from "react";
import type { TicketStatus } from "../../api/tickets";

export interface KanbanColumnProps {
  /** Status this column represents */
  status: TicketStatus;
  /** Human-readable label for the column */
  label: string;
  /** Number of tickets in this column */
  count: number;
  /** Accent color for the column header (CSS variable or color value) */
  accentColor: string;
  /** Content to render (ticket cards) */
  children?: ReactNode;
  /** Test ID prefix for targeting in tests */
  testId?: string;
  /** Ref for drop target */
  innerRef?: React.Ref<HTMLDivElement>;
}

/**
 * KanbanColumn - Individual kanban column with header, count, and drop zone.
 *
 * Features:
 * - Column header with status label and accent color
 * - Ticket count badge
 * - Scrollable ticket list area (acts as drop zone for future drag-and-drop)
 * - Empty state message when no tickets
 * - Status-specific accent color on header
 * - Min-width: 280px, max-width: 320px
 *
 * Layout:
 * ```
 * ┌─────────────────────┐
 * │ In Progress    (3)  │  <- Header with accent, label, count
 * ├─────────────────────┤
 * │ ┌─────────────────┐ │
 * │ │ Ticket Card 1   │ │
 * │ └─────────────────┘ │
 * │ ┌─────────────────┐ │
 * │ │ Ticket Card 2   │ │
 * │ └─────────────────┘ │
 * │                     │  <- Drop zone / scrollable area
 * └─────────────────────┘
 * ```
 */
export const KanbanColumn = memo(function KanbanColumn({
  status,
  label,
  count,
  accentColor,
  children,
  testId,
  innerRef,
}: KanbanColumnProps) {
  const isEmpty = count === 0;
  const columnTestId = testId ?? `column-${status}`;

  return (
    <div
      style={columnStyles}
      role="region"
      aria-label={`${label} column, ${count} tickets`}
      data-testid={columnTestId}
      data-status={status}
      ref={innerRef}
    >
      {/* Column Header */}
      <div style={columnHeaderStyles}>
        <div style={headerContentStyles}>
          <span
            style={{ ...headerAccentStyles, backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <h3 style={headerTitleStyles}>{label}</h3>
          <span style={countBadgeStyles} data-testid={`count-${status}`}>
            {count}
          </span>
        </div>
      </div>

      {/* Column Content (Drop Zone) */}
      <div
        style={columnContentStyles}
        data-testid={`${columnTestId}-content`}
        data-droppable={status}
      >
        {isEmpty ? (
          <div style={emptyStateStyles} role="status">
            <span style={emptyTextStyles}>No tickets</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
});

const columnStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: "280px",
  maxWidth: "320px",
  flexShrink: 0,
  height: "100%",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  overflow: "hidden", // Ensure children respect radius
  // Scroll snap alignment for touch scrolling
  scrollSnapAlign: "start",
};

const columnHeaderStyles: React.CSSProperties = {
  padding: "var(--spacing-3) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  flexShrink: 0,
  background: "var(--bg-secondary)", // Ensure header sits on top
  // Sticky header within column during vertical scroll
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const headerContentStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const headerAccentStyles: React.CSSProperties = {
  width: "4px",
  height: "16px",
  borderRadius: "2px",
  flexShrink: 0,
};

const headerTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  flex: 1,
};

const countBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "20px",
  height: "20px",
  padding: "0 var(--spacing-2)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-full)",
};

const columnContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3)",
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
};

const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-8) var(--spacing-4)",
  border: "2px dashed var(--border-secondary)",
  borderRadius: "var(--radius-md)",
  margin: "var(--spacing-2) 0",
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
};

export default KanbanColumn;
