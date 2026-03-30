/**
 * Redesigned detail panel for a selected treemap/sunburst node.
 *
 * Design direction: "Radiant Data" — luminous proportional bars that glow
 * against the surface, with clear rank ordering and interactive hover states.
 *
 * Features:
 * - Proportional cost bars scaled to the max child (not total), so the
 *   most expensive item always fills the full width for clear comparison
 * - Rank numbers and percentage labels for context
 * - Hover state reveals detailed token breakdown
 * - Animated gradient stage breakdown bar
 * - Metric cards with accent borders
 * - Smooth entry animation
 */

import { type FC, useEffect, useState, useCallback } from "react";
import { Layers, Tag, Clock, Activity, Cpu, ChevronRight } from "lucide-react";
import type { CostExplorerNode } from "../../../core/types.ts";
import { formatUsd } from "./chart-utils";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { formatTokenCount, formatDuration, getStageColor } from "./cost-explorer-utils";

interface CostDetailPanelProps {
  node: CostExplorerNode;
  onDrillDown?: (node: CostExplorerNode) => void;
}

/** Animate panel entry. */
function useEntryAnimation(): React.CSSProperties {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(12px)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
  };
}

// ============================================
// Node type badge colors
// ============================================

const TYPE_COLORS: Record<string, string> = {
  epic: "#3b82f6",
  ticket: "#f97316",
  stage: "#22c55e",
  session: "#a855f7",
  unassigned: "#71717a",
  project: "#14b8a6",
};

// ============================================
// TicketCostRow — individual row with luminous bar
// ============================================

const TicketCostRow: FC<{
  child: CostExplorerNode;
  maxCost: number;
  totalCost: number;
  rank: number;
  accentColor: string;
  onDrillDown: ((node: CostExplorerNode) => void) | undefined;
}> = ({ child, maxCost, totalCost, rank, accentColor, onDrillDown }) => {
  const [hovered, setHovered] = useState(false);
  const pct = totalCost > 0 ? (child.costUsd / totalCost) * 100 : 0;
  // Scale bar width relative to the MOST EXPENSIVE child, not total
  // This ensures the top item fills ~100% for clear visual comparison
  const barWidth = maxCost > 0 ? Math.max((child.costUsd / maxCost) * 100, 1.5) : 0;
  const isTop3 = rank <= 3;

  // Parse accent color to RGB for opacity control
  const accentRgb = hexToRgb(accentColor);
  const barOpacity = hovered ? 0.32 : 0.2;
  const barEndOpacity = hovered ? 0.1 : 0.04;

  const handleClick = useCallback(() => {
    if (onDrillDown && child.children && child.children.length > 0) {
      onDrillDown(child);
    }
  }, [onDrillDown, child]);

  const isClickable = onDrillDown && child.children && child.children.length > 0;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        padding: "7px 12px",
        borderRadius: 8,
        overflow: "hidden",
        cursor: isClickable ? "pointer" : "default",
        transition: "background 0.2s ease",
        background: hovered ? "var(--bg-hover)" : "transparent",
        borderLeft: isTop3
          ? `2px solid ${accentColor}${hovered ? "cc" : "66"}`
          : "2px solid transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      {/* Proportional cost bar — the key visual element */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${barWidth}%`,
          background: `linear-gradient(90deg, ${accentRgb.replace(")", `,${barOpacity})`)}, ${accentRgb.replace(")", `,${barEndOpacity})`)})`,
          borderRadius: 8,
          transition: "width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease",
        }}
      />

      {/* Rank number */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          width: 22,
          flexShrink: 0,
          fontSize: 11,
          fontWeight: isTop3 ? 600 : 400,
          color: isTop3 ? accentColor : "var(--text-tertiary)",
          fontVariantNumeric: "tabular-nums",
          opacity: isTop3 ? 1 : 0.6,
        }}
      >
        {rank}
      </span>

      {/* Ticket name */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "var(--font-size-sm)",
          color: hovered ? "var(--text-primary)" : "var(--text-primary)",
          fontWeight: isTop3 ? 500 : 400,
          transition: "color 0.15s ease",
        }}
        title={child.name}
      >
        {child.name}
      </span>

      {/* Drill-in indicator */}
      {isClickable && hovered && (
        <ChevronRight
          size={14}
          style={{
            position: "relative",
            zIndex: 1,
            color: "var(--text-tertiary)",
            flexShrink: 0,
            marginLeft: 4,
            opacity: 0.7,
          }}
        />
      )}

      {/* Percentage */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          marginLeft: 8,
          fontSize: 11,
          color: "var(--text-tertiary)",
          fontVariantNumeric: "tabular-nums",
          minWidth: 38,
          textAlign: "right",
          flexShrink: 0,
          transition: "color 0.15s ease",
        }}
      >
        {pct >= 0.1 ? `${pct.toFixed(1)}%` : "<0.1%"}
      </span>

      {/* Cost value */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          marginLeft: 8,
          fontSize: "var(--font-size-sm)",
          fontWeight: 500,
          color: hovered ? accentColor : "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
          minWidth: 70,
          textAlign: "right",
          flexShrink: 0,
          transition: "color 0.15s ease",
        }}
      >
        {formatUsd(child.costUsd)}
      </span>
    </div>
  );
};

// ============================================
// Hex to RGB utility
// ============================================

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgb(${r},${g},${b}`;
}

// ============================================
// Main CostDetailPanel
// ============================================

export const CostDetailPanel: FC<CostDetailPanelProps> = ({ node, onDrillDown }) => {
  const animStyle = useEntryAnimation();
  const badgeColor = TYPE_COLORS[node.type] ?? "#71717a";

  // Determine accent color for bars based on node type
  const barAccent = node.type === "epic" ? badgeColor : "#f97316";

  // Calculate max child cost for proportional bar scaling
  const maxChildCost = node.children ? Math.max(...node.children.map((c) => c.costUsd), 0) : 0;

  return (
    <div style={{ ...sectionStyles, ...animStyle }}>
      {/* Header */}
      <div style={sectionHeaderStyles}>
        <Activity size={18} aria-hidden="true" style={{ color: badgeColor }} />
        <h3
          style={{
            ...sectionTitleStyles,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap" as const,
          }}
        >
          {node.name}
        </h3>
        <span style={{ ...typeBadgeStyles, background: badgeColor + "18", color: badgeColor }}>
          {node.type}
        </span>
      </div>

      <div style={sectionContentStyles}>
        {/* Metrics grid */}
        <div style={metricsGridStyles}>
          <MetricCard label="Total Cost" value={formatUsd(node.costUsd)} accent="#10b981" />
          <MetricCard
            label="Input Tokens"
            value={formatTokenCount(node.inputTokens)}
            accent="#3b82f6"
          />
          <MetricCard
            label="Output Tokens"
            value={formatTokenCount(node.outputTokens)}
            accent="#f97316"
          />
          {node.cacheReadTokens > 0 && (
            <MetricCard
              label="Cache Read"
              value={formatTokenCount(node.cacheReadTokens)}
              accent="#22c55e"
            />
          )}
          {node.cacheCreationTokens > 0 && (
            <MetricCard
              label="Cache Create"
              value={formatTokenCount(node.cacheCreationTokens)}
              accent="#eab308"
            />
          )}
          {node.sessionCount > 0 && (
            <MetricCard label="Sessions" value={String(node.sessionCount)} accent="#a855f7" />
          )}
        </div>

        {/* Stage details */}
        {node.type === "stage" && node.metadata && (
          <div style={detailSectionStyles}>
            <h4 style={detailHeadingStyles}>
              <Clock size={14} aria-hidden="true" /> Stage Details
            </h4>
            <div style={metricsGridStyles}>
              {typeof node.metadata.durationMs === "number" && (
                <MetricCard
                  label="Duration"
                  value={formatDuration(node.metadata.durationMs)}
                  accent="#14b8a6"
                />
              )}
              {typeof node.metadata.percentage === "number" && (
                <MetricCard
                  label="% of Ticket"
                  value={`${(node.metadata.percentage as number).toFixed(1)}%`}
                  accent="#f97316"
                />
              )}
            </div>
          </div>
        )}

        {/* Session details */}
        {node.type === "session" && node.metadata && (
          <div style={detailSectionStyles}>
            <h4 style={detailHeadingStyles}>
              <Tag size={14} aria-hidden="true" /> Session Details
            </h4>
            <div style={sessionDetailsStyles}>
              {node.metadata.model != null && (
                <div style={sessionRowStyles}>
                  <Cpu
                    size={12}
                    aria-hidden="true"
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                  <span style={sessionLabelStyles}>Model</span>
                  <span style={modelBadgeStyles}>{String(node.metadata.model)}</span>
                </div>
              )}
              {node.metadata.outcome != null && (
                <div style={sessionRowStyles}>
                  <Activity
                    size={12}
                    aria-hidden="true"
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                  <span style={sessionLabelStyles}>Outcome</span>
                  <span
                    style={{
                      ...outcomeBadgeStyles,
                      color: node.metadata.outcome === "success" ? "#22c55e" : "#ef4444",
                      background:
                        node.metadata.outcome === "success"
                          ? "rgba(34,197,94,0.1)"
                          : "rgba(239,68,68,0.1)",
                    }}
                  >
                    {String(node.metadata.outcome)}
                  </span>
                </div>
              )}
              {node.metadata.startedAt != null && (
                <div style={sessionRowStyles}>
                  <Clock
                    size={12}
                    aria-hidden="true"
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                  <span style={sessionLabelStyles}>Started</span>
                  <span style={sessionValueStyles}>
                    {new Date(String(node.metadata.startedAt)).toLocaleString()}
                  </span>
                </div>
              )}
              {node.metadata.completedAt != null && (
                <div style={sessionRowStyles}>
                  <Clock
                    size={12}
                    aria-hidden="true"
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                  <span style={sessionLabelStyles}>Completed</span>
                  <span style={sessionValueStyles}>
                    {new Date(String(node.metadata.completedAt)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Epic/Unassigned: Ranked ticket cost comparison */}
        {(node.type === "epic" || node.type === "unassigned") && node.children && (
          <div style={detailSectionStyles}>
            <div style={childrenHeaderStyles}>
              <h4 style={detailHeadingStyles}>
                <Layers size={14} aria-hidden="true" /> Tickets ({node.children.length})
              </h4>
              <span style={childrenSubtitleStyles}>Ranked by cost</span>
            </div>
            <div style={ticketListStyles}>
              {node.children.map((child, idx) => (
                <TicketCostRow
                  key={child.id}
                  child={child}
                  maxCost={maxChildCost}
                  totalCost={node.costUsd}
                  rank={idx + 1}
                  accentColor={barAccent}
                  onDrillDown={onDrillDown}
                />
              ))}
            </div>
          </div>
        )}

        {/* Ticket: stage breakdown with gradient bar */}
        {node.type === "ticket" && node.children && node.children.length > 0 && (
          <div style={detailSectionStyles}>
            <h4 style={detailHeadingStyles}>
              <Layers size={14} aria-hidden="true" />{" "}
              {node.children[0]?.type === "stage" ? "Stage Breakdown" : "Sessions"}
            </h4>
            {node.children[0]?.type === "stage" && (
              <>
                {/* Taller, more visible stage bar */}
                <div style={stageBarContainerStyles}>
                  {node.children.map((stage) => {
                    const pct = node.costUsd > 0 ? (stage.costUsd / node.costUsd) * 100 : 0;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={stage.id}
                        style={{
                          ...stageBarSegmentStyles,
                          width: `${pct}%`,
                          background: `linear-gradient(180deg, ${getStageColor(stage.name)}, ${getStageColor(stage.name)}aa)`,
                        }}
                        title={`${stage.name}: ${formatUsd(stage.costUsd)} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                {/* Stage legend with bars */}
                <div style={stageLegendStyles}>
                  {node.children.map((child) => {
                    const pct = node.costUsd > 0 ? (child.costUsd / node.costUsd) * 100 : 0;
                    const stageMax = Math.max(...node.children!.map((c) => c.costUsd), 0);
                    const barW = stageMax > 0 ? (child.costUsd / stageMax) * 100 : 0;
                    return (
                      <div key={child.id} style={stageLegendItemStyles}>
                        <span
                          style={{ ...stageDotStyles, background: getStageColor(child.name) }}
                        />
                        <span style={stageLegendNameStyles}>{child.name}</span>
                        {/* Mini proportional bar */}
                        <div style={stageMiniBarBgStyles}>
                          <div
                            style={{
                              ...stageMiniBarFillStyles,
                              width: `${barW}%`,
                              background: getStageColor(child.name),
                            }}
                          />
                        </div>
                        <span style={stageLegendValueStyles}>{formatUsd(child.costUsd)}</span>
                        <span style={stageLegendPctStyles}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {node.children[0]?.type !== "stage" && (
              <div style={ticketListStyles}>
                {node.children.map((child, idx) => (
                  <TicketCostRow
                    key={child.id}
                    child={child}
                    maxCost={maxChildCost}
                    totalCost={node.costUsd}
                    rank={idx + 1}
                    accentColor="#a855f7"
                    onDrillDown={onDrillDown}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

const MetricCard: FC<{ label: string; value: string; accent: string }> = ({
  label,
  value,
  accent,
}) => (
  <div style={metricCardStyles}>
    <div style={{ ...metricAccentStyles, background: accent }} />
    <div style={metricCardInnerStyles}>
      <span style={metricLabelStyles}>{label}</span>
      <span style={metricValueStyles}>{value}</span>
    </div>
  </div>
);

// ============================================
// Styles
// ============================================

const typeBadgeStyles: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 600,
  padding: "3px 8px",
  borderRadius: 6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const metricsGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
  gap: "var(--spacing-2)",
};

const metricCardStyles: React.CSSProperties = {
  position: "relative",
  display: "flex",
  overflow: "hidden",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
};

const metricAccentStyles: React.CSSProperties = {
  width: 3,
  flexShrink: 0,
};

const metricCardInnerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "8px 10px",
};

const metricLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};

const metricValueStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  fontVariantNumeric: "tabular-nums",
};

const detailSectionStyles: React.CSSProperties = {
  marginTop: "var(--spacing-3)",
  paddingTop: "var(--spacing-3)",
  borderTop: "1px solid var(--border-primary)",
};

const detailHeadingStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  margin: 0,
};

const childrenHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "var(--spacing-2)",
};

const childrenSubtitleStyles: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-tertiary)",
  fontStyle: "italic",
};

const ticketListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const sessionDetailsStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const sessionRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "var(--font-size-sm)",
};

const sessionLabelStyles: React.CSSProperties = {
  color: "var(--text-tertiary)",
  minWidth: 70,
};

const sessionValueStyles: React.CSSProperties = {
  color: "var(--text-primary)",
};

const modelBadgeStyles: React.CSSProperties = {
  background: "rgba(99,102,241,0.1)",
  color: "#818cf8",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
};

const outcomeBadgeStyles: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 4,
  textTransform: "capitalize",
};

const stageBarContainerStyles: React.CSSProperties = {
  display: "flex",
  height: 16,
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: "var(--spacing-2)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
};

const stageBarSegmentStyles: React.CSSProperties = {
  height: "100%",
  minWidth: 4,
  transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const stageLegendStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const stageLegendItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "var(--font-size-sm)",
};

const stageDotStyles: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const stageLegendNameStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  textTransform: "capitalize",
  minWidth: 80,
};

const stageMiniBarBgStyles: React.CSSProperties = {
  flex: 1,
  height: 6,
  background: "var(--bg-tertiary)",
  borderRadius: 3,
  overflow: "hidden",
};

const stageMiniBarFillStyles: React.CSSProperties = {
  height: "100%",
  borderRadius: 3,
  opacity: 0.6,
  transition: "width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const stageLegendValueStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  minWidth: 55,
  textAlign: "right",
};

const stageLegendPctStyles: React.CSSProperties = {
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-xs)",
  minWidth: 30,
  textAlign: "right",
};
