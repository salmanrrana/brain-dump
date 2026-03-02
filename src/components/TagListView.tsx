import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, Tag } from "lucide-react";
import { getTagColor } from "../lib/tag-colors";
import type { TagMetadata } from "../lib/hooks";

interface TagListViewProps {
  tagsWithMetadata: TagMetadata[];
  onTagClick?: (tagName: string) => void;
}

type SortField = "tag" | "ticketCount" | "lastUsedAt";
type SortDirection = "asc" | "desc";

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

export default function TagListView({ tagsWithMetadata, onTagClick }: TagListViewProps) {
  const [sortField, setSortField] = useState<SortField>("ticketCount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAndSorted = useMemo(() => {
    let filtered = tagsWithMetadata;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((t) => t.tag.toLowerCase().includes(query));
    }

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "tag":
          comparison = a.tag.localeCompare(b.tag);
          break;
        case "ticketCount":
          comparison = a.ticketCount - b.ticketCount;
          break;
        case "lastUsedAt":
          comparison = new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [tagsWithMetadata, sortField, sortDirection, searchQuery]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "tag" ? "asc" : "desc");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (tagsWithMetadata.length === 0) {
    return (
      <div className="bg-[var(--bg-secondary)] rounded-lg p-8 text-center">
        <Tag size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-muted)] mb-1">No tags found</p>
        <p className="text-xs text-[var(--text-muted)]">
          Add tags to tickets to see them here. Tags help organize and categorize your work.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg h-full flex flex-col overflow-hidden">
      {/* Search - sticky at top */}
      <div className="px-4 py-3 border-b border-[var(--border-primary)] shrink-0">
        <input
          type="text"
          placeholder="Filter tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-xs px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
        />
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
            <tr className="border-b border-[var(--border-primary)]">
              <th
                className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
                onClick={() => handleSort("tag")}
              >
                Tag
                <SortIcon field="tag" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th
                className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
                onClick={() => handleSort("ticketCount")}
              >
                Tickets
                <SortIcon field="ticketCount" sortField={sortField} sortDirection={sortDirection} />
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
                Status Breakdown
              </th>
              <th
                className="text-left px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
                onClick={() => handleSort("lastUsedAt")}
              >
                Last Used
                <SortIcon field="lastUsedAt" sortField={sortField} sortDirection={sortDirection} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                  No matching tags
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((tagMeta) => {
                const color = getTagColor(tagMeta.tag);
                const doneCount = tagMeta.statusBreakdown.done;
                const total = tagMeta.ticketCount;
                const donePercent = total > 0 ? (doneCount / total) * 100 : 0;

                return (
                  <tr
                    key={tagMeta.tag}
                    onClick={() => onTagClick?.(tagMeta.tag)}
                    className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-hover)]/50 cursor-pointer"
                  >
                    {/* Tag name with color pill */}
                    <td className="px-4 py-3">
                      <span
                        style={{
                          ...tagPillStyles,
                          backgroundColor: color.bg,
                          color: color.text,
                        }}
                      >
                        {tagMeta.tag}
                      </span>
                    </td>

                    {/* Ticket count */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--text-primary)]">
                        {tagMeta.ticketCount}
                      </span>
                    </td>

                    {/* Status breakdown - mini progress bar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 max-w-[120px] h-2 rounded-full overflow-hidden"
                          style={{ backgroundColor: "var(--bg-tertiary)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${donePercent}%`,
                              backgroundColor: "var(--success, #22c55e)",
                            }}
                          />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {doneCount}/{total} done
                        </span>
                      </div>
                    </td>

                    {/* Last used date */}
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {formatDate(tagMeta.lastUsedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tagPillStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "9999px",
  padding: "3px 10px",
  fontSize: "12px",
  fontWeight: 500,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};
