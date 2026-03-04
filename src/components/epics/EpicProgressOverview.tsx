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
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
        <p className="text-slate-400">No tickets</p>
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
        bgColor: config?.className.split(" ")[0] ?? "bg-slate-700",
      };
    })
    .filter(Boolean) as Array<{
    status: string;
    width: number;
    count: number;
    bgColor: string;
  }>;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">Progress</span>
        <span className="text-sm font-semibold text-slate-200">{percentage}%</span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700 flex">
        {barSegments.map((segment) => (
          <div
            key={segment.status}
            className={`h-full ${segment.bgColor} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${segment.width}%` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {statusOrder.map((status) => {
          const count = ticketsByStatus[status] ?? 0;
          if (count === 0) return null;
          const config = STATUS_BADGE_CONFIG[status];
          return (
            <span
              key={status}
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${config?.className ?? "bg-slate-700 text-slate-300"}`}
            >
              {config?.label ?? status} ({count})
            </span>
          );
        })}
      </div>

      {currentTicketId && currentTicketTitle && (
        <div className="pt-2 border-t border-slate-700">
          <p className="text-sm text-slate-400">
            Currently working on:{" "}
            <span className="text-amber-400 font-medium">{currentTicketTitle}</span>
          </p>
        </div>
      )}
    </div>
  );
}
