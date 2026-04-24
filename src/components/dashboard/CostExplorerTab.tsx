/**
 * Hollywood-grade Cost Explorer tab.
 *
 * Features:
 * - Lazy-loaded ECharts (only loads ~800KB when tab is active)
 * - Time range selector (7d / 30d / 90d / All)
 * - Treemap ↔ Sunburst view toggle with morph animation
 * - Summary cards with animated counters
 * - Detail panel with stage breakdown
 */

import { type FC, useState, useCallback, useMemo, Suspense, lazy } from "react";
import type { CostExplorerNode, CostExplorerParams } from "../../../core/types.ts";
import { deriveCostExplorerSummary, useCostExplorer } from "../../lib/hooks";
import { CostSummaryCards } from "./CostSummaryCards";
import { CostDetailPanel } from "./CostDetailPanel";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
  emptyStateStyles,
  emptyTextStyles,
  emptySubtextStyles,
} from "./shared-styles";
import {
  type TimeRange,
  type ChartViewMode,
  TIME_RANGES,
  timeRangeToSince,
} from "./cost-explorer-utils";
import { TreesIcon, LayoutGrid, Sun } from "lucide-react";

// Lazy-load the heavy ECharts component
const CostTreemapChart = lazy(() =>
  import("./CostTreemapChart").then((m) => ({ default: m.CostTreemapChart }))
);

/** Loading skeleton for the chart while ECharts loads. */
const ChartSkeleton: FC = () => (
  <div style={skeletonStyles}>
    <div style={skeletonPulseStyles}>
      <div style={{ ...skeletonBlockStyles, width: "60%", height: 200 }} />
      <div style={{ ...skeletonBlockStyles, width: "38%", height: 200 }} />
      <div style={{ ...skeletonBlockStyles, width: "45%", height: 140 }} />
      <div style={{ ...skeletonBlockStyles, width: "53%", height: 140 }} />
    </div>
    <div style={skeletonTextStyles}>Loading chart engine…</div>
  </div>
);

export const CostExplorerTab: FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("90d");
  const [viewMode, setViewMode] = useState<ChartViewMode>("treemap");
  const [selectedNode, setSelectedNode] = useState<CostExplorerNode | null>(null);

  // Memoize to prevent infinite refetch loop — timeRangeToSince uses Date.now()
  // which changes every millisecond, creating a new query key each render
  const sinceValue = useMemo(() => timeRangeToSince(timeRange), [timeRange]);
  const params = useMemo<CostExplorerParams>(
    () => (sinceValue ? { since: sinceValue } : {}),
    [sinceValue]
  );

  const { data: tree, isLoading, isPlaceholderData, error } = useCostExplorer(params);
  const summary = useMemo(() => (tree ? deriveCostExplorerSummary(tree) : null), [tree]);

  const handleNodeSelect = useCallback((node: CostExplorerNode | null) => {
    setSelectedNode(node);
  }, []);

  const handleDrillDown = useCallback((node: CostExplorerNode) => {
    setSelectedNode(node);
  }, []);

  if (error) {
    return (
      <div style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <TreesIcon size={18} aria-hidden="true" style={{ color: "var(--accent-primary)" }} />
          <h2 style={sectionTitleStyles}>Cost Explorer</h2>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyStateStyles}>
            <p style={emptyTextStyles}>Failed to load cost data</p>
            <p style={emptySubtextStyles}>{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && !tree) {
    return (
      <div style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <TreesIcon size={18} aria-hidden="true" style={{ color: "var(--accent-primary)" }} />
          <h2 style={sectionTitleStyles}>Cost Explorer</h2>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyStateStyles}>
            <div style={spinnerStyles} />
            <p style={emptyTextStyles}>Loading cost data…</p>
          </div>
        </div>
      </div>
    );
  }

  const hasData = tree && tree.costUsd > 0;

  return (
    <div style={containerStyles}>
      {/* Summary cards */}
      {summary && <CostSummaryCards data={summary} />}

      {/* Main explorer area — chart + detail panel side by side on wide screens */}
      <div style={explorerLayoutStyles}>
        {/* Chart section */}
        <div
          style={{
            ...sectionStyles,
            flex: selectedNode ? "1 1 60%" : "1 1 100%",
            minWidth: 0,
            transition: "flex 0.3s ease",
          }}
        >
          {/* Header with controls */}
          <div style={headerStyles}>
            <div style={headerLeftStyles}>
              <TreesIcon size={18} aria-hidden="true" style={{ color: "var(--accent-primary)" }} />
              <h2 style={sectionTitleStyles}>Cost Breakdown</h2>
              {isPlaceholderData && (
                <span style={loadingBadgeStyles}>
                  <div style={miniSpinnerStyles} />
                  Loading…
                </span>
              )}
            </div>
            <div style={controlsStyles}>
              {/* View mode toggle */}
              <div style={toggleGroupStyles} role="radiogroup" aria-label="Chart view mode">
                <button
                  role="radio"
                  aria-checked={viewMode === "treemap"}
                  onClick={() => setViewMode("treemap")}
                  style={viewMode === "treemap" ? activeToggleStyles : toggleStyles}
                  title="Treemap view"
                >
                  <LayoutGrid size={14} aria-hidden="true" />
                </button>
                <button
                  role="radio"
                  aria-checked={viewMode === "sunburst"}
                  onClick={() => setViewMode("sunburst")}
                  style={viewMode === "sunburst" ? activeToggleStyles : toggleStyles}
                  title="Sunburst view"
                >
                  <Sun size={14} aria-hidden="true" />
                </button>
              </div>

              {/* Time range selector */}
              <div style={timeRangeGroupStyles} role="radiogroup" aria-label="Time range">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.value}
                    role="radio"
                    aria-checked={timeRange === range.value}
                    onClick={() => {
                      setTimeRange(range.value);
                      setSelectedNode(null);
                    }}
                    style={timeRange === range.value ? activeTimeStyles : timeStyles}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div style={{ ...sectionContentStyles, padding: hasData ? 0 : undefined }}>
            {hasData ? (
              <Suspense fallback={<ChartSkeleton />}>
                <CostTreemapChart data={tree} viewMode={viewMode} onNodeSelect={handleNodeSelect} />
              </Suspense>
            ) : (
              <div style={emptyStateStyles}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.3"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <p style={emptyTextStyles}>No cost data yet</p>
                <p style={emptySubtextStyles}>
                  Cost data is recorded when AI sessions complete work on tickets.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — slides in beside the chart */}
        {selectedNode && (
          <div style={detailPanelContainerStyles}>
            <CostDetailPanel node={selectedNode} onDrillDown={handleDrillDown} />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Styles
// ============================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-4)",
};

const explorerLayoutStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-4)",
  alignItems: "flex-start",
};

const detailPanelContainerStyles: React.CSSProperties = {
  flex: "0 0 380px",
  maxHeight: 700,
  overflowY: "auto",
  position: "sticky",
  top: "var(--spacing-4)",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3)",
  borderBottom: "1px solid var(--border-primary)",
  flexWrap: "wrap",
};

const headerLeftStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const controlsStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const toggleGroupStyles: React.CSSProperties = {
  display: "flex",
  gap: 1,
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  padding: 2,
  border: "1px solid var(--border-primary)",
};

const toggleStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 26,
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const activeToggleStyles: React.CSSProperties = {
  ...toggleStyles,
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
};

const timeRangeGroupStyles: React.CSSProperties = {
  display: "flex",
  gap: 1,
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  padding: 2,
  border: "1px solid var(--border-primary)",
};

const timeStyles: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-tertiary)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "all 0.15s ease",
  whiteSpace: "nowrap",
};

const activeTimeStyles: React.CSSProperties = {
  ...timeStyles,
  color: "var(--text-primary)",
  background: "var(--bg-secondary)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
};

const loadingBadgeStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  background: "var(--bg-tertiary)",
  padding: "2px 10px",
  borderRadius: "var(--radius-sm)",
};

const miniSpinnerStyles: React.CSSProperties = {
  width: 10,
  height: 10,
  border: "2px solid var(--border-primary)",
  borderTopColor: "var(--accent-primary)",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

const spinnerStyles: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "3px solid var(--border-primary)",
  borderTopColor: "var(--accent-primary)",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

const skeletonStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: 450,
  padding: "var(--spacing-4)",
  gap: "var(--spacing-3)",
};

const skeletonPulseStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "center",
  opacity: 0.15,
};

const skeletonBlockStyles: React.CSSProperties = {
  background: "var(--text-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease infinite",
};

const skeletonTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
};
