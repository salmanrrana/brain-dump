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
        No tickets in this epic yet
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
    <div
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-primary)",
        background: "var(--bg-card)",
        overflow: "hidden",
      }}
    >
      {STATUS_GROUP_ORDER.map((status) => {
        const groupTickets = ticketsByStatus[status];
        if (!groupTickets || groupTickets.length === 0) return null;

        const isCollapsed = collapsedGroups.has(status);
        const statusConfig = STATUS_BADGE_CONFIG[status];
        const count = groupTickets.length;

        return (
          <div
            key={status}
            style={{
              borderBottom: "1px solid var(--border-primary)",
            }}
            className="last:border-b-0"
          >
            <button
              type="button"
              onClick={() => toggleGroup(status)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: "var(--spacing-3)",
                padding: "var(--spacing-3) var(--spacing-4)",
                textAlign: "left",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background-color var(--transition-fast)",
              }}
              className="hover:bg-[var(--bg-hover)]"
            >
              {isCollapsed ? (
                <ChevronRight size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              ) : (
                <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              )}
              <span
                className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${statusConfig?.className ?? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"}`}
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.01em" }}
              >
                {statusConfig?.label ?? getStatusLabel(status)} ({count})
              </span>
            </button>

            {!isCollapsed && (
              <div
                style={{
                  paddingBottom: "var(--spacing-2)",
                }}
              >
                {groupTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "var(--spacing-2)",
                      padding: "var(--spacing-2) var(--spacing-4)",
                      paddingLeft: "var(--spacing-10)",
                      minWidth: 0,
                      transition: "background-color var(--transition-fast)",
                    }}
                    className="hover:bg-[var(--bg-hover)]"
                  >
                    <Link
                      to="/ticket/$id"
                      params={{ id: ticket.id }}
                      preload="intent"
                      style={{
                        flex: 1,
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                        textDecoration: "none",
                        lineHeight: 1.4,
                        minWidth: 0,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                      className="hover:text-[var(--accent-primary)] hover:underline"
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
                            className={`inline-flex items-center rounded-lg px-1.5 py-0.5 text-xs font-medium ${priorityConfig.className}`}
                            style={{ flexShrink: 0 }}
                          >
                            {priorityConfig.label}
                          </span>
                        );
                      })()}

                    {ticket.isBlocked && (
                      <div className="relative group/blocked" style={{ flexShrink: 0 }}>
                        <AlertCircle size={14} style={{ color: "var(--error)" }} />
                        {ticket.blockedReason && (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "100%",
                              marginTop: "4px",
                              zIndex: 10,
                              width: "200px",
                              padding: "var(--spacing-2) var(--spacing-3)",
                              borderRadius: "var(--radius-xl)",
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border-secondary)",
                              boxShadow: "var(--shadow-xl)",
                              fontSize: "var(--font-size-xs)",
                              color: "var(--text-secondary)",
                              lineHeight: 1.4,
                            }}
                            className="opacity-0 group-hover/blocked:opacity-100 pointer-events-none transition-opacity"
                          >
                            {ticket.blockedReason}
                          </div>
                        )}
                      </div>
                    )}

                    {ticket.prNumber && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium ${getPrStatusBadgeStyle(ticket.prStatus)}`}
                        style={{
                          flexShrink: 0,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        <GitPullRequest size={11} />#{ticket.prNumber}
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
