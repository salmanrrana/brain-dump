import { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  AlertCircle,
} from "lucide-react";

import type { Ticket } from "../lib/hooks";
import { STATUS_ORDER, PRIORITY_ORDER } from "../lib/constants";
import { safeJsonParse } from "../lib/utils";

interface Epic {
  id: string;
  title: string;
}

interface TicketListViewProps {
  tickets: Ticket[];
  epics: Epic[];
  onTicketClick: (ticket: Ticket) => void;
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

export default function TicketListView({
  tickets,
  epics,
  onTicketClick,
}: TicketListViewProps) {
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const epicMap = useMemo(() => {
    return new Map(epics.map((e) => [e.id, e]));
  }, [epics]);

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "status":
          comparison =
            (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case "priority":
          comparison =
            (PRIORITY_ORDER[a.priority ?? ""] ?? 99) -
            (PRIORITY_ORDER[b.priority ?? ""] ?? 99);
          break;
        case "createdAt":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [tickets, sortField, sortDirection]);

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
    <div className="bg-slate-900 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-800">
            <th
              className="text-left px-4 py-3 text-sm font-medium text-slate-400 cursor-pointer hover:text-gray-100"
              onClick={() => handleSort("title")}
            >
              Title
              <SortIcon field="title" sortField={sortField} sortDirection={sortDirection} />
            </th>
            <th
              className="text-left px-4 py-3 text-sm font-medium text-slate-400 cursor-pointer hover:text-gray-100"
              onClick={() => handleSort("status")}
            >
              Status
              <SortIcon field="status" sortField={sortField} sortDirection={sortDirection} />
            </th>
            <th
              className="text-left px-4 py-3 text-sm font-medium text-slate-400 cursor-pointer hover:text-gray-100"
              onClick={() => handleSort("priority")}
            >
              Priority
              <SortIcon field="priority" sortField={sortField} sortDirection={sortDirection} />
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
              Epic
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
              Tags
            </th>
            <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">
              Subtasks
            </th>
            <th
              className="text-left px-4 py-3 text-sm font-medium text-slate-400 cursor-pointer hover:text-gray-100"
              onClick={() => handleSort("createdAt")}
            >
              Created
              <SortIcon field="createdAt" sortField={sortField} sortDirection={sortDirection} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTickets.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-8 text-center text-slate-500 text-sm"
              >
                No tickets found
              </td>
            </tr>
          ) : (
            sortedTickets.map((ticket) => {
              const epic = ticket.epicId ? epicMap.get(ticket.epicId) : null;
              const tags = safeJsonParse<string[]>(ticket.tags, []);
              const subtasks = safeJsonParse<{ id: string; text: string; completed: boolean }[]>(ticket.subtasks, []);
              const completedSubtasks = subtasks.filter(
                (s) => s.completed
              ).length;

              return (
                <tr
                  key={ticket.id}
                  onClick={() => onTicketClick(ticket)}
                  className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                >
                  {/* Title with blocked indicator */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {ticket.isBlocked && (
                        <span title={ticket.blockedReason ?? "Blocked"}>
                          <AlertCircle
                            size={14}
                            className="text-red-500 flex-shrink-0"
                          />
                        </span>
                      )}
                      <span className="text-sm text-gray-100 truncate max-w-xs">
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
                    {ticket.priority && (
                      <PriorityBadge priority={ticket.priority} />
                    )}
                  </td>

                  {/* Epic */}
                  <td className="px-4 py-3">
                    {epic && (
                      <span className="text-sm text-slate-300 truncate max-w-xs">
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
                          className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-xs text-slate-500">
                          +{tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Subtasks */}
                  <td className="px-4 py-3">
                    {subtasks.length > 0 && (
                      <span className="text-xs text-slate-400">
                        {completedSubtasks}/{subtasks.length}
                      </span>
                    )}
                  </td>

                  {/* Created date */}
                  <td className="px-4 py-3 text-sm text-slate-400">
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
  const statusConfig: Record<string, { label: string; className: string }> = {
    backlog: {
      label: "Backlog",
      className: "bg-slate-700 text-slate-300",
    },
    ready: {
      label: "Ready",
      className: "bg-blue-900/50 text-blue-300",
    },
    in_progress: {
      label: "In Progress",
      className: "bg-amber-900/50 text-amber-300",
    },
    review: {
      label: "Review",
      className: "bg-purple-900/50 text-purple-300",
    },
    ai_review: {
      label: "AI Review",
      className: "bg-orange-900/50 text-orange-300",
    },
    human_review: {
      label: "Human Review",
      className: "bg-rose-900/50 text-rose-300",
    },
    done: {
      label: "Done",
      className: "bg-green-900/50 text-green-300",
    },
  };

  const config = statusConfig[status] ?? {
    label: status,
    className: "bg-slate-700 text-slate-300",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${config.className}`}>
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const priorityConfig: Record<string, { label: string; className: string }> = {
    high: {
      label: "High",
      className: "bg-red-900/50 text-red-300",
    },
    medium: {
      label: "Medium",
      className: "bg-yellow-900/50 text-yellow-300",
    },
    low: {
      label: "Low",
      className: "bg-green-900/50 text-green-300",
    },
  };

  const config = priorityConfig[priority] ?? {
    label: priority,
    className: "bg-slate-700 text-slate-300",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${config.className}`}>
      {config.label}
    </span>
  );
}
