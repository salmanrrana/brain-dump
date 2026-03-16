import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, AlertCircle, GitBranch, GitPullRequest } from "lucide-react";

import type { TicketSummary } from "../api/tickets";
import {
  STATUS_ORDER,
  PRIORITY_ORDER,
  STATUS_BADGE_CONFIG,
  PRIORITY_BADGE_CONFIG,
  getPrStatusIconColor,
} from "../lib/constants";
import { safeJsonParse } from "../lib/utils";

interface ParsedTicketRow {
  ticket: TicketSummary;
  tags: string[];
  subtaskCount: number;
  completedSubtaskCount: number;
}

interface Epic {
  id: string;
  title: string;
}

interface TicketListViewProps {
  tickets: TicketSummary[];
  epics: Epic[];
  onTicketClick: (ticket: TicketSummary) => void;
}

type SortField = "title" | "status" | "priority" | "createdAt";
type SortDirection = "asc" | "desc";

// Sort icon component - declared outside to avoid recreating during render
function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (field !== sortField) return null;
  return sortDirection === "asc" ? (
    <ChevronUp size={14} className="inline ml-1" />
  ) : (
    <ChevronDown size={14} className="inline ml-1" />
  );
}

export default function TicketListView({ tickets, epics, onTicketClick }: TicketListViewProps) {
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const epicMap = useMemo(() => {
    return new Map(epics.map((e) => [e.id, e]));
  }, [epics]);

  // Parse JSON fields once per data change, not per render
  const parsedRows = useMemo(() => {
    const rows: ParsedTicketRow[] = tickets.map((ticket) => {
      const tags = safeJsonParse<string[]>(ticket.tags, []);
      const subtasks = safeJsonParse<{ completed: boolean }[]>(ticket.subtasks, []);
      return {
        ticket,
        tags,
        subtaskCount: subtasks.length,
        completedSubtaskCount: subtasks.filter((s) => s.completed).length,
      };
    });
    return rows;
  }, [tickets]);

  const sortedRows = useMemo(() => {
    return [...parsedRows].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "title":
          comparison = a.ticket.title.localeCompare(b.ticket.title);
          break;
        case "status":
          comparison =
            (STATUS_ORDER[a.ticket.status] ?? 99) - (STATUS_ORDER[b.ticket.status] ?? 99);
          break;
        case "priority":
          comparison =
            (PRIORITY_ORDER[a.ticket.priority ?? ""] ?? 99) -
            (PRIORITY_ORDER[b.ticket.priority ?? ""] ?? 99);
          break;
        case "createdAt":
          comparison =
            new Date(a.ticket.createdAt).getTime() - new Date(b.ticket.createdAt).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [parsedRows, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--border-primary)]">
            <th
              className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
              onClick={() => handleSort("title")}
            >
              Title
              <SortIcon field="title" sortField={sortField} sortDirection={sortDirection} />
            </th>
            <th
              className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
              onClick={() => handleSort("status")}
            >
              Status
              <SortIcon field="status" sortField={sortField} sortDirection={sortDirection} />
            </th>
            <th
              className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
              onClick={() => handleSort("priority")}
            >
              Priority
              <SortIcon field="priority" sortField={sortField} sortDirection={sortDirection} />
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Epic
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Tags
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Branch / PR
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Subtasks
            </th>
            <th
              className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
              onClick={() => handleSort("createdAt")}
            >
              Created
              <SortIcon field="createdAt" sortField={sortField} sortDirection={sortDirection} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                No tickets found
              </td>
            </tr>
          ) : (
            sortedRows.map(({ ticket, tags, subtaskCount, completedSubtaskCount }) => {
              const epic = ticket.epicId ? epicMap.get(ticket.epicId) : null;

              return (
                <tr
                  key={ticket.id}
                  onClick={() => onTicketClick(ticket)}
                  className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-hover)]/50 cursor-pointer"
                >
                  {/* Title with blocked indicator */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {ticket.isBlocked && (
                        <span title={ticket.blockedReason ?? "Blocked"}>
                          <AlertCircle size={14} className="text-[var(--error)] flex-shrink-0" />
                        </span>
                      )}
                      <span className="text-sm text-[var(--text-primary)] truncate max-w-xs">
                        {ticket.title}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={ticket.status} />
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3">
                    {ticket.priority && <PriorityBadge priority={ticket.priority} />}
                  </td>

                  {/* Epic */}
                  <td className="px-4 py-3">
                    {epic && (
                      <span className="text-sm text-[var(--text-primary)] truncate max-w-xs">
                        {epic.title}
                      </span>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap max-w-xs">
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 bg-[var(--bg-hover)] text-[var(--text-primary)] rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-xs text-[var(--text-muted)]">+{tags.length - 3}</span>
                      )}
                    </div>
                  </td>

                  {/* Branch / PR */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {ticket.branchName && (
                        <span
                          className="flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                          title={ticket.branchName}
                        >
                          <GitBranch size={12} className="text-[var(--accent-ai)]" />
                          <span className="truncate max-w-[120px]">
                            {ticket.branchName.replace(/^feature\//, "")}
                          </span>
                        </span>
                      )}
                      {ticket.prNumber && (
                        <span
                          className={`flex items-center gap-1 text-xs ${getPrStatusIconColor(ticket.prStatus)}`}
                          title={`PR #${ticket.prNumber} - ${ticket.prStatus ?? "open"}`}
                        >
                          <GitPullRequest size={12} />#{ticket.prNumber}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Subtasks */}
                  <td className="px-4 py-3">
                    {subtaskCount > 0 && (
                      <span className="text-xs text-[var(--text-secondary)]">
                        {completedSubtaskCount}/{subtaskCount}
                      </span>
                    )}
                  </td>

                  {/* Created date */}
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {formatDate(ticket.createdAt)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_BADGE_CONFIG[status] ?? {
    label: status,
    className: "bg-[var(--bg-hover)] text-[var(--text-primary)]",
  };

  return <span className={`text-xs px-2 py-1 rounded ${config.className}`}>{config.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_BADGE_CONFIG[priority] ?? {
    label: priority,
    className: "bg-[var(--bg-hover)] text-[var(--text-primary)]",
  };

  return <span className={`text-xs px-2 py-1 rounded ${config.className}`}>{config.label}</span>;
}
