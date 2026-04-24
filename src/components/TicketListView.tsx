import { memo, useCallback, useState, useMemo, useRef } from "react";
import type { KeyboardEvent, SyntheticEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { CopyableTag } from "./board/CopyableTag";

const VIRTUALIZATION_THRESHOLD = 20;
const ROW_HEIGHT_ESTIMATE = 45;
const TABLE_COLUMN_COUNT = 8;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

interface ParsedTicketRow {
  ticket: TicketSummary;
  tags: string[];
  subtaskCount: number;
  completedSubtaskCount: number;
  createdAtMs: number;
  createdAtLabel: string;
  epicTitle: string | null;
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
      const createdAtMs = new Date(ticket.createdAt).getTime();
      const epic = ticket.epicId ? epicMap.get(ticket.epicId) : null;
      return {
        ticket,
        tags,
        subtaskCount: subtasks.length,
        completedSubtaskCount: subtasks.filter((s) => s.completed).length,
        createdAtMs,
        createdAtLabel: dateFormatter.format(createdAtMs),
        epicTitle: epic?.title ?? null,
      };
    });
    return rows;
  }, [tickets, epicMap]);

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
          comparison = a.createdAtMs - b.createdAtMs;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [parsedRows, sortField, sortDirection]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField]
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const useVirtual = sortedRows.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 5,
    enabled: useVirtual,
  });

  const virtualItems = useVirtual ? virtualizer.getVirtualItems() : [];

  const renderRow = useCallback(
    (row: ParsedTicketRow) => (
      <TicketTableRow key={row.ticket.id} row={row} onTicketClick={onTicketClick} />
    ),
    [onTicketClick]
  );

  const tableHeader = (
    <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
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
  );

  return (
    <div
      ref={scrollContainerRef}
      className="bg-[var(--bg-secondary)] rounded-lg overflow-auto h-full"
    >
      <table className="w-full">
        {tableHeader}
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td
                colSpan={TABLE_COLUMN_COUNT}
                className="px-4 py-8 text-center text-[var(--text-muted)] text-sm"
              >
                No tickets found
              </td>
            </tr>
          ) : useVirtual ? (
            <>
              {virtualItems.length > 0 && virtualItems[0]!.start > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={TABLE_COLUMN_COUNT}
                    style={{ height: virtualItems[0]!.start, padding: 0 }}
                  />
                </tr>
              )}
              {virtualItems.map((virtualRow) => {
                const row = sortedRows[virtualRow.index];
                if (!row) return null;
                return renderRow(row);
              })}
              {virtualItems.length > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={TABLE_COLUMN_COUNT}
                    style={{
                      height:
                        virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end,
                      padding: 0,
                    }}
                  />
                </tr>
              )}
            </>
          ) : (
            sortedRows.map((row) => renderRow(row))
          )}
        </tbody>
      </table>
    </div>
  );
}

const TicketTableRow = memo(function TicketTableRow({
  row,
  onTicketClick,
}: {
  row: ParsedTicketRow;
  onTicketClick: (ticket: TicketSummary) => void;
}) {
  const { ticket, tags, subtaskCount, completedSubtaskCount, createdAtLabel, epicTitle } = row;

  const handleClick = useCallback(() => {
    onTicketClick(ticket);
  }, [onTicketClick, ticket]);

  const stopPropagation = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleTagKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  }, []);

  return (
    <tr
      onClick={handleClick}
      className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-hover)]/50 cursor-pointer"
    >
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
      <td className="px-4 py-3">
        <StatusBadge status={ticket.status} />
      </td>
      <td className="px-4 py-3">
        {ticket.priority && <PriorityBadge priority={ticket.priority} />}
      </td>
      <td className="px-4 py-3">
        {epicTitle && (
          <span className="text-sm text-[var(--text-primary)] truncate max-w-xs">{epicTitle}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap max-w-xs items-center">
          {tags.slice(0, 3).map((tag) => (
            <CopyableTag
              key={tag}
              tag={tag}
              onClick={stopPropagation}
              onPointerDown={stopPropagation}
              onKeyDown={handleTagKeyDown}
            />
          ))}
          {tags.length > 3 && (
            <span className="text-xs text-[var(--text-muted)]">+{tags.length - 3}</span>
          )}
        </div>
      </td>
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
      <td className="px-4 py-3">
        {subtaskCount > 0 && (
          <span className="text-xs text-[var(--text-secondary)]">
            {completedSubtaskCount}/{subtaskCount}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{createdAtLabel}</td>
    </tr>
  );
});

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
