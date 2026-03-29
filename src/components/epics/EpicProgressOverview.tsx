import { STATUS_BADGE_CONFIG, COLUMN_STATUSES } from "../../lib/constants";

export interface EpicProgressOverviewProps {
  ticketsByStatus: Record<string, number>;
  ticketsTotal: number;
  ticketsDone: number;
  currentTicketId: string | null;
  currentTicketTitle?: string;
}

export function EpicProgressOverview({
  ticketsByStatus,
  ticketsTotal,
  ticketsDone,
  currentTicketId,
  currentTicketTitle,
}: EpicProgressOverviewProps) {
  if (ticketsTotal === 0) {
    return (
      <div
        style={{
          padding: "var(--spacing-8)",
          textAlign: "center",
          border: "1px dashed var(--border-primary)",
          borderRadius: "var(--radius-xl)",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--font-size-xs)",
          letterSpacing: "var(--tracking-wide)",
        }}
      >
        No tickets in this epic
      </div>
    );
  }

  const percentage = Math.round((ticketsDone / ticketsTotal) * 100);
  const statusOrder = COLUMN_STATUSES;

  const barSegments = statusOrder
    .map((status) => {
      const count = ticketsByStatus[status] ?? 0;
      if (count === 0) return null;
      const width = (count / ticketsTotal) * 100;
      const config = STATUS_BADGE_CONFIG[status];
      return {
        status,
        width,
        count,
        bgColor: config?.className.split(" ")[0] ?? "bg-[var(--bg-tertiary)]",
      };
    })
    .filter(Boolean) as Array<{
    status: string;
    width: number;
    count: number;
    bgColor: string;
  }>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
      {/* Header with percentage */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "var(--font-size-xs)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            letterSpacing: "var(--tracking-wider)",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Progress
        </span>
        <span
          style={{
            fontSize: "var(--font-size-2xl)",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            letterSpacing: "var(--tracking-tight)",
            color: percentage === 100 ? "var(--success)" : "var(--text-primary)",
          }}
        >
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: "6px",
          width: "100%",
          overflow: "hidden",
          borderRadius: "var(--radius-full)",
          background: "var(--bg-primary)",
          display: "flex",
        }}
      >
        {barSegments.map((segment) => (
          <div
            key={segment.status}
            className={`h-full ${segment.bgColor}`}
            style={{
              width: `${segment.width}%`,
              transition: "width 0.5s var(--ease-out-expo)",
            }}
          />
        ))}
      </div>

      {/* Status legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-2)" }}>
        {statusOrder.map((status) => {
          const count = ticketsByStatus[status] ?? 0;
          if (count === 0) return null;
          const config = STATUS_BADGE_CONFIG[status];
          return (
            <span
              key={status}
              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${config?.className ?? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"}`}
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.01em" }}
            >
              {config?.label ?? status} ({count})
            </span>
          );
        })}
      </div>

      {/* Current ticket indicator */}
      {currentTicketId && currentTicketTitle && (
        <div
          style={{
            paddingTop: "var(--spacing-3)",
            borderTop: "1px solid var(--border-primary)",
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-2)",
          }}
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--accent-ai)",
              boxShadow: "0 0 8px var(--accent-ai-glow)",
              animation: "ai-pulse 2.5s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              letterSpacing: "var(--tracking-wide)",
              textTransform: "uppercase",
            }}
          >
            Active
          </span>
          <span
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--accent-ai)",
              fontWeight: 500,
            }}
          >
            {currentTicketTitle}
          </span>
        </div>
      )}
    </div>
  );
}
