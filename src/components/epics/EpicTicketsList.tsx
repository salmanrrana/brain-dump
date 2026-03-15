import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, AlertCircle, GitPullRequest } from "lucide-react";
import {
  STATUS_BADGE_CONFIG,
  getStatusLabel,
  PRIORITY_BADGE_CONFIG,
  getPrStatusBadgeStyle,
} from "../../lib/constants";

export interface EpicTicketsListProps {
  tickets: Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    isBlocked: boolean | null;
    blockedReason: string | null;
    prNumber: number | null;
    prStatus: string | null;
  }>;
}

const STATUS_GROUP_ORDER = [
  "in_progress",
  "ai_review",
  "human_review",
  "ready",
  "backlog",
  "done",
] as const;

export function EpicTicketsList({ tickets }: EpicTicketsListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    return new Set(["done"]);
  });

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
        <p className="text-slate-400">No tickets in this epic yet</p>
      </div>
    );
  }

  const ticketsByStatus = tickets.reduce(
    (acc, ticket) => {
      const status = ticket.status || "backlog";
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(ticket);
      return acc;
    },
    {} as Record<string, typeof tickets>
  );

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-2">
      {STATUS_GROUP_ORDER.map((status) => {
        const groupTickets = ticketsByStatus[status];
        if (!groupTickets || groupTickets.length === 0) return null;

        const isCollapsed = collapsedGroups.has(status);
        const statusConfig = STATUS_BADGE_CONFIG[status];
        const count = groupTickets.length;

        return (
          <div key={status} className="border-b border-slate-700 last:border-b-0">
            <button
              type="button"
              onClick={() => toggleGroup(status)}
              className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-700/30 rounded transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusConfig?.className ?? "bg-slate-700 text-slate-300"}`}
              >
                {statusConfig?.label ?? getStatusLabel(status)} ({count})
              </span>
            </button>

            {!isCollapsed && (
              <div className="ml-6 space-y-1 pb-2">
                {groupTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-700/30 group min-w-0"
                  >
                    <Link
                      to="/ticket/$id"
                      params={{ id: ticket.id }}
                      className="flex-1 text-sm text-slate-200 hover:text-blue-400 hover:underline line-clamp-2 min-w-0"
                      title={ticket.title}
                    >
                      {ticket.title}
                    </Link>

                    {ticket.priority &&
                      (() => {
                        const priorityConfig = PRIORITY_BADGE_CONFIG[ticket.priority];
                        if (!priorityConfig) return null;
                        return (
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${priorityConfig.className}`}
                          >
                            {priorityConfig.label}
                          </span>
                        );
                      })()}

                    {ticket.isBlocked && (
                      <div className="relative group/blocked">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        {ticket.blockedReason && (
                          <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded bg-red-900/90 p-2 text-xs text-red-200 opacity-0 group-hover/blocked:opacity-100 pointer-events-none transition-opacity">
                            {ticket.blockedReason}
                          </div>
                        )}
                      </div>
                    )}

                    {ticket.prNumber && (
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${getPrStatusBadgeStyle(ticket.prStatus)}`}
                      >
                        <GitPullRequest className="h-3 w-3" />#{ticket.prNumber}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
