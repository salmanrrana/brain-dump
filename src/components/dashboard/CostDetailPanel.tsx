/**
 * Hollywood-grade detail panel for a selected treemap/sunburst node.
 *
 * Features:
 * - Animated gradient stage breakdown bar with percentages
 * - Metric cards with subtle gradient accents
 * - Session timeline with model badges
 * - Smooth entry animation
 */

import { type FC, useEffect, useState } from "react";
import { Layers, Tag, Clock, Activity, Cpu } from "lucide-react";
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

export const CostDetailPanel: FC<CostDetailPanelProps> = ({ node }) => {
  const animStyle = useEntryAnimation();

  // Node type badge color
  const typeColors: Record<string, string> = {
    epic: "#3b82f6",
    ticket: "#f97316",
    stage: "#22c55e",
    session: "#a855f7",
    unassigned: "#71717a",
    project: "#14b8a6",
  };
  const badgeColor = typeColors[node.type] ?? "#71717a";

  return (
    <div style={{ ...sectionStyles, ...animStyle }}>
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
        {/* Metrics grid with accent highlights */}
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

        {/* Stage-specific: duration and percentage */}
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

        {/* Session-specific: model, outcome, timestamps */}
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

        {/* Epic/Ticket: children summary with animated stage bar */}
        {(node.type === "epic" || node.type === "unassigned") && node.children && (
          <div style={detailSectionStyles}>
            <h4 style={detailHeadingStyles}>
              <Layers size={14} aria-hidden="true" /> Tickets ({node.children.length})
            </h4>
            <div style={childListStyles}>
              {node.children.slice(0, 10).map((child) => {
                const pct = node.costUsd > 0 ? (child.costUsd / node.costUsd) * 100 : 0;
                return (
                  <div key={child.id} style={childRowStyles}>
                    <div style={childBarBgStyles}>
                      <div style={{ ...childBarFillStyles, width: `${pct}%` }} />
                    </div>
                    <span style={childNameStyles} title={child.name}>
                      {child.name.length > 35 ? child.name.substring(0, 33) + "…" : child.name}
                    </span>
                    <span style={childCostStyles}>{formatUsd(child.costUsd)}</span>
                  </div>
                );
              })}
              {node.children.length > 10 && (
                <div style={moreStyles}>+{node.children.length - 10} more</div>
              )}
            </div>
          </div>
        )}

        {/* Ticket: stage breakdown with animated gradient bar */}
        {node.type === "ticket" && node.children && node.children.length > 0 && (
          <div style={detailSectionStyles}>
            <h4 style={detailHeadingStyles}>
              <Layers size={14} aria-hidden="true" />{" "}
              {node.children[0]?.type === "stage" ? "Stage Breakdown" : "Sessions"}
            </h4>
            {node.children[0]?.type === "stage" && (
              <>
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
                          background: `linear-gradient(180deg, ${getStageColor(stage.name)}, ${getStageColor(stage.name)}88)`,
                        }}
                        title={`${stage.name}: ${formatUsd(stage.costUsd)} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
                <div style={stageLegendStyles}>
                  {node.children.map((child) => {
                    const pct = node.costUsd > 0 ? (child.costUsd / node.costUsd) * 100 : 0;
                    return (
                      <div key={child.id} style={stageLegendItemStyles}>
                        <span
                          style={{ ...stageDotStyles, background: getStageColor(child.name) }}
                        />
                        <span style={stageLegendNameStyles}>{child.name}</span>
                        <span style={stageLegendValueStyles}>{formatUsd(child.costUsd)}</span>
                        <span style={stageLegendPctStyles}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {node.children[0]?.type !== "stage" && (
              <div style={childListStyles}>
                {node.children.map((child) => (
                  <div key={child.id} style={childRowStyles}>
                    <span style={childNameStyles}>{child.name}</span>
                    <span style={childCostStyles}>{formatUsd(child.costUsd)}</span>
                  </div>
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
  marginBottom: "var(--spacing-2)",
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
  fontFamily: "monospace",
};

const outcomeBadgeStyles: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 4,
  textTransform: "capitalize",
};

const childListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const childRowStyles: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-sm)",
  overflow: "hidden",
};

const childBarBgStyles: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  right: 0,
  background: "transparent",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
};

const childBarFillStyles: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, rgba(249,115,22,0.08), rgba(249,115,22,0.02))",
  transition: "width 0.6s ease",
};

const childNameStyles: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
  zIndex: 1,
};

const childCostStyles: React.CSSProperties = {
  position: "relative",
  color: "var(--text-secondary)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  whiteSpace: "nowrap",
  marginLeft: "var(--spacing-2)",
  fontVariantNumeric: "tabular-nums",
  zIndex: 1,
};

const moreStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  textAlign: "center",
  padding: "var(--spacing-1)",
};

const stageBarContainerStyles: React.CSSProperties = {
  display: "flex",
  height: 10,
  borderRadius: 5,
  overflow: "hidden",
  marginBottom: "var(--spacing-2)",
  background: "var(--bg-tertiary)",
};

const stageBarSegmentStyles: React.CSSProperties = {
  height: "100%",
  minWidth: 4,
  transition: "width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const stageLegendStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
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
  flex: 1,
  textTransform: "capitalize",
};

const stageLegendValueStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontVariantNumeric: "tabular-nums",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const stageLegendPctStyles: React.CSSProperties = {
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-xs)",
  minWidth: 30,
  textAlign: "right",
};
