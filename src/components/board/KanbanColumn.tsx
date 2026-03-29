import { memo, useCallback } from "react";
import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
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

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (!ref) {
    return;
  }

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  Object.assign(ref, { current: value });
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
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: { status },
  });

  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      assignRef(innerRef, node);
    },
    [innerRef, setNodeRef]
  );

  return (
    <div
      style={columnStyles}
      role="region"
      aria-label={`${label} column, ${count} tickets`}
      data-testid={columnTestId}
      data-status={status}
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
        ref={setContentRef}
        style={{
          ...columnContentStyles,
          ...(isOver ? activeColumnContentStyles : undefined),
        }}
        data-testid={`${columnTestId}-content`}
        data-droppable={status}
        data-drop-active={isOver ? "true" : undefined}
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
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
  overflow: "hidden",
  scrollSnapAlign: "start",
};

const columnHeaderStyles: React.CSSProperties = {
  padding: "var(--spacing-4) var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  flexShrink: 0,
  background: "var(--bg-secondary)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const headerContentStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
};

const headerAccentStyles: React.CSSProperties = {
  width: "6px",
  height: "6px",
  borderRadius: "var(--radius-full)",
  flexShrink: 0,
  boxShadow: "0 0 8px currentColor",
};

const headerTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  fontFamily: "var(--font-mono)",
  letterSpacing: "var(--tracking-wide)",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  flex: 1,
};

const countBadgeStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "22px",
  height: "22px",
  padding: "0 var(--spacing-2)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  fontFamily: "var(--font-mono)",
  color: "var(--text-tertiary)",
  background: "var(--bg-primary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
};

const columnContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
};

const activeColumnContentStyles: React.CSSProperties = {
  background: "color-mix(in srgb, var(--accent-primary) 6%, transparent)",
  boxShadow: "inset 0 0 24px color-mix(in srgb, var(--accent-primary) 4%, transparent)",
};

const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-8) var(--spacing-4)",
  border: "1px dashed var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  margin: "var(--spacing-2) 0",
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
  letterSpacing: "var(--tracking-wide)",
};

export default KanbanColumn;
