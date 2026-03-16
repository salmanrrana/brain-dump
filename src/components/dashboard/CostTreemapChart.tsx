/**
 * Hollywood-grade ECharts visualization for the Cost Explorer.
 *
 * Features:
 * - Treemap ↔ Sunburst toggle with universalTransition morph animation
 * - Gradient fills on every tile with depth-varying saturation
 * - Hover glow (shadowBlur: 20) + blur non-focused nodes
 * - Staggered entrance animation (cascading tile reveal)
 * - Rich multi-style labels: {name} on top, {cost} below in accent color
 * - Glassmorphism HTML tooltips with progress bars and token breakdowns
 * - 4-level drill-down with animated zoom transitions
 * - leafDepth: 2 for panoramic overview before drilling
 */

import { type FC, useRef, useMemo, useEffect, useCallback } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { TreemapChart, SunburstChart } from "echarts/charts";
import { TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { CostExplorerNode } from "../../../core/types.ts";
import { formatUsd } from "./chart-utils";
import {
  formatTokenCount,
  getStageColor,
  getStageColorDark,
  getEpicGradient,
  glowColor,
  type ChartViewMode,
} from "./cost-explorer-utils";

// Register all required ECharts components
echarts.use([TreemapChart, SunburstChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);

interface CostTreemapChartProps {
  data: CostExplorerNode;
  viewMode: ChartViewMode;
  onNodeSelect?: (node: CostExplorerNode | null) => void;
}

// ============================================
// Data Transformation
// ============================================

/** Convert CostExplorerNode tree to ECharts data with gradient itemStyles. */
function toEChartsData(
  nodes: CostExplorerNode[],
  rootTotal: number,
  depth: number = 0
): Array<Record<string, unknown>> {
  return nodes.map((node, index) => {
    const item: Record<string, unknown> = {
      name: node.name,
      value: node.value,
      id: node.id,
      // Store the original node for tooltip access
      nodeData: node,
      // groupId for universalTransition morph
      groupId: node.id,
    };

    // Gradient fills by node type
    if (node.type === "epic" || node.type === "unassigned") {
      const gradient =
        node.type === "unassigned"
          ? { top: "#52525b", bottom: "#27272a", glow: "rgba(82,82,91,0.4)" }
          : getEpicGradient(index, node.metadata?.color as string | undefined);

      item.itemStyle = {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: gradient.top },
          { offset: 1, color: gradient.bottom },
        ]),
        borderRadius: 4,
      };
      item.emphasis = {
        itemStyle: {
          shadowBlur: 24,
          shadowColor: gradient.glow,
          shadowOffsetY: 4,
          borderColor: gradient.top,
          borderWidth: 2,
        },
      };
    } else if (node.type === "stage") {
      const color = getStageColor(node.name);
      const dark = getStageColorDark(node.name);
      item.itemStyle = {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color },
          { offset: 1, color: dark },
        ]),
        borderRadius: 3,
      };
      item.emphasis = {
        itemStyle: {
          shadowBlur: 16,
          shadowColor: glowColor(color, 0.5),
        },
      };
    } else if (node.type === "ticket") {
      // Tickets inherit parent color but desaturated. Use a subtle gradient.
      item.itemStyle = { borderRadius: 3 };
    } else if (node.type === "session") {
      item.itemStyle = { borderRadius: 2 };
    }

    if (node.children && node.children.length > 0) {
      item.children = toEChartsData(node.children, rootTotal, depth + 1);
    }

    return item;
  });
}

/** Flatten the tree for sunburst (same data, flat children). */
function toSunburstData(nodes: CostExplorerNode[]): Array<Record<string, unknown>> {
  return nodes.map((node, index) => {
    const item: Record<string, unknown> = {
      name: node.name,
      value: node.value,
      id: node.id,
      nodeData: node,
      groupId: node.id,
    };

    // Color by type
    if (node.type === "epic" || node.type === "unassigned") {
      const gradient =
        node.type === "unassigned"
          ? { top: "#52525b", bottom: "#27272a", glow: "rgba(82,82,91,0.4)" }
          : getEpicGradient(index, node.metadata?.color as string | undefined);
      item.itemStyle = {
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: gradient.top },
          { offset: 1, color: gradient.bottom },
        ]),
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
      };
    } else if (node.type === "stage") {
      const color = getStageColor(node.name);
      item.itemStyle = {
        color,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      };
    }

    if (node.children && node.children.length > 0) {
      item.children = toSunburstData(node.children);
    }

    return item;
  });
}

// ============================================
// Tooltip Formatter (Glassmorphism HTML)
// ============================================

function buildTooltipHtml(nodeData: CostExplorerNode, rootTotal: number): string {
  const pct = rootTotal > 0 ? ((nodeData.costUsd / rootTotal) * 100).toFixed(1) : "0";
  const barWidth = rootTotal > 0 ? Math.min(100, (nodeData.costUsd / rootTotal) * 100) : 0;

  // Node type badge color
  const typeColors: Record<string, string> = {
    epic: "#3b82f6",
    ticket: "#f97316",
    stage: "#22c55e",
    session: "#a855f7",
    unassigned: "#71717a",
    project: "#14b8a6",
  };
  const badgeColor = typeColors[nodeData.type] ?? "#71717a";

  let html = `
    <div style="
      min-width: 220px;
      max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e2e8f0;
    ">
      <!-- Header -->
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span style="
          background: ${badgeColor}22;
          color: ${badgeColor};
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        ">${nodeData.type}</span>
      </div>

      <!-- Name -->
      <div style="
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      ">${nodeData.name}</div>

      <!-- Cost + Percentage -->
      <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:10px;">
        <span style="
          font-size: 22px;
          font-weight: 700;
          background: linear-gradient(135deg, #10b981, #34d399);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        ">${formatUsd(nodeData.costUsd)}</span>
        <span style="font-size:12px; color:#94a3b8;">${pct}% of total</span>
      </div>

      <!-- Progress Bar -->
      <div style="
        background: rgba(255,255,255,0.06);
        border-radius: 4px;
        height: 6px;
        margin-bottom: 12px;
        overflow: hidden;
      ">
        <div style="
          background: linear-gradient(90deg, #10b981, #34d399);
          width: ${barWidth}%;
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        "></div>
      </div>`;

  // Token breakdown table
  if (nodeData.inputTokens > 0 || nodeData.outputTokens > 0) {
    html += `
      <div style="
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 12px;
        font-size: 11px;
        margin-bottom: 8px;
      ">
        <div style="color:#94a3b8;">Input</div>
        <div style="text-align:right; font-weight:500;">${formatTokenCount(nodeData.inputTokens)}</div>
        <div style="color:#94a3b8;">Output</div>
        <div style="text-align:right; font-weight:500;">${formatTokenCount(nodeData.outputTokens)}</div>`;

    if (nodeData.cacheReadTokens > 0) {
      html += `
        <div style="color:#94a3b8;">Cache Read</div>
        <div style="text-align:right; font-weight:500; color:#22c55e;">${formatTokenCount(nodeData.cacheReadTokens)}</div>`;
    }
    if (nodeData.cacheCreationTokens > 0) {
      html += `
        <div style="color:#94a3b8;">Cache Create</div>
        <div style="text-align:right; font-weight:500;">${formatTokenCount(nodeData.cacheCreationTokens)}</div>`;
    }

    html += `</div>`;
  }

  // Session count
  if (nodeData.sessionCount > 0) {
    html += `
      <div style="
        display:flex;
        align-items:center;
        gap:6px;
        padding-top:8px;
        border-top:1px solid rgba(255,255,255,0.06);
        font-size:11px;
        color:#94a3b8;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
        ${nodeData.sessionCount} session${nodeData.sessionCount !== 1 ? "s" : ""}
      </div>`;
  }

  html += `</div>`;
  return html;
}

// ============================================
// Chart Component
// ============================================

export const CostTreemapChart: FC<CostTreemapChartProps> = ({ data, viewMode, onNodeSelect }) => {
  const chartRef = useRef<ReactEChartsCore>(null);
  const rootTotal = data.costUsd;

  const treemapData = useMemo(
    () => toEChartsData(data.children ?? [], rootTotal),
    [data.children, rootTotal]
  );

  const sunburstData = useMemo(() => toSunburstData(data.children ?? []), [data.children]);

  const option = useMemo(() => {
    // Shared tooltip config
    const tooltip = {
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      extraCssText:
        "backdrop-filter: blur(20px); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(16,185,129,0.08);",
      formatter(info: Record<string, unknown>) {
        const treeNode = info.data as Record<string, unknown> | undefined;
        const nodeData = treeNode?.nodeData as CostExplorerNode | undefined;
        if (!nodeData) return "";
        return buildTooltipHtml(nodeData, rootTotal);
      },
    };

    if (viewMode === "sunburst") {
      return {
        tooltip,
        series: [
          {
            type: "sunburst",
            data: sunburstData,
            radius: ["12%", "90%"],
            sort: "desc",
            emphasis: {
              focus: "ancestor",
              itemStyle: {
                shadowBlur: 20,
                shadowColor: "rgba(16,185,129,0.3)",
              },
            },
            levels: [
              {},
              {
                // Epic level
                r0: "12%",
                r: "40%",
                label: {
                  fontSize: 15,
                  fontWeight: "bold" as const,
                  color: "#fff",
                  textShadowColor: "rgba(0,0,0,0.6)",
                  textShadowBlur: 3,
                },
                itemStyle: {
                  borderWidth: 2,
                  borderColor: "rgba(0,0,0,0.2)",
                },
              },
              {
                // Ticket level
                r0: "40%",
                r: "68%",
                label: {
                  fontSize: 13,
                  color: "#e2e8f0",
                  textShadowColor: "rgba(0,0,0,0.5)",
                  textShadowBlur: 2,
                },
                itemStyle: {
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.15)",
                },
              },
              {
                // Stage level
                r0: "68%",
                r: "82%",
                label: {
                  fontSize: 12,
                  color: "#cbd5e1",
                },
                itemStyle: {
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.1)",
                },
              },
              {
                // Session level
                r0: "82%",
                r: "90%",
                label: { show: false },
                itemStyle: {
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.08)",
                },
              },
            ],
            universalTransition: true,
            animationDurationUpdate: 800,
            animationEasingUpdate: "cubicInOut",
          },
        ],
      };
    }

    // Treemap view (default)
    return {
      tooltip,
      series: [
        {
          type: "treemap",
          data: treemapData,
          roam: false,
          nodeClick: false, // We handle drill-down manually via dispatchAction
          breadcrumb: {
            show: true,
            top: 6,
            left: 8,
            height: 22,
            itemStyle: {
              color: "rgba(30, 41, 59, 0.9)",
              borderColor: "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderRadius: 6,
              shadowBlur: 8,
              shadowColor: "rgba(0,0,0,0.3)",
              textStyle: {
                color: "#e2e8f0",
                fontSize: 13,
              },
            },
            emphasis: {
              itemStyle: {
                color: "rgba(51, 65, 85, 0.95)",
                textStyle: { color: "#f1f5f9" },
              },
            },
          },
          // Show 1 level at a time — click to drill down
          leafDepth: 1,
          levels: [
            {
              // Epic level — bold borders, strong gradients
              itemStyle: {
                borderColor: "rgba(255,255,255,0.12)",
                borderWidth: 3,
                gapWidth: 3,
                borderRadius: 6,
              },
              upperLabel: {
                show: true,
                height: 36,
                color: "#fff",
                fontSize: 16,
                fontWeight: "bold" as const,
                textShadowColor: "rgba(0,0,0,0.7)",
                textShadowBlur: 4,
                padding: [0, 10],
              },
              emphasis: {
                upperLabel: {
                  color: "#f1f5f9",
                  fontSize: 18,
                },
              },
            },
            {
              // Ticket level
              itemStyle: {
                borderColor: "rgba(255,255,255,0.06)",
                borderWidth: 2,
                gapWidth: 2,
                borderRadius: 4,
              },
              upperLabel: {
                show: true,
                height: 30,
                fontSize: 14,
                color: "#e2e8f0",
                textShadowColor: "rgba(0,0,0,0.6)",
                textShadowBlur: 3,
                padding: [0, 8],
              },
              colorSaturation: [0.35, 0.6],
            },
            {
              // Stage level
              itemStyle: {
                borderWidth: 1,
                gapWidth: 1,
                borderRadius: 3,
                borderColor: "rgba(255,255,255,0.04)",
              },
              upperLabel: {
                show: true,
                height: 26,
                fontSize: 13,
                color: "#cbd5e1",
                textShadowColor: "rgba(0,0,0,0.5)",
                textShadowBlur: 2,
              },
              colorMappingBy: "id",
              colorSaturation: [0.3, 0.5],
            },
            {
              // Session level
              itemStyle: {
                borderColor: "rgba(255,255,255,0.03)",
                gapWidth: 1,
                borderRadius: 2,
              },
              colorSaturation: [0.25, 0.45],
            },
          ],
          // Rich multi-style labels
          label: {
            show: true,
            formatter(params: Record<string, unknown>) {
              const val = params.value as number;
              if (val < 0.01) return "";
              const name = params.name as string;
              const displayName = name.length > 30 ? name.substring(0, 28) + "…" : name;
              return `{name|${displayName}}\n{cost|$${val.toFixed(2)}}`;
            },
            rich: {
              name: {
                fontSize: 14,
                color: "rgba(255,255,255,0.9)",
                lineHeight: 20,
                textShadowColor: "rgba(0,0,0,0.7)",
                textShadowBlur: 4,
              },
              cost: {
                fontSize: 16,
                fontWeight: "bold" as const,
                color: "#34d399",
                lineHeight: 24,
                textShadowColor: "rgba(0,0,0,0.7)",
                textShadowBlur: 4,
              },
            },
          },
          // Hover emphasis — glow effect (no focus/blur to avoid blocking drill-down)
          emphasis: {
            itemStyle: {
              shadowBlur: 20,
              shadowColor: "rgba(16,185,129,0.4)",
              shadowOffsetY: 4,
            },
            label: {
              rich: {
                name: { color: "#fff", fontSize: 15 },
                cost: { color: "#10b981", fontSize: 18 },
              },
            },
          },
          // Staggered entrance animation
          animationDuration: 800,
          animationEasing: "cubicOut",
          animationDelay(idx: number) {
            return idx * 12;
          },
          animationDurationUpdate: 600,
          animationEasingUpdate: "cubicInOut",
          universalTransition: true,
          visibleMin: 200,
          childrenVisibleMin: 80,
        },
      ],
    };
  }, [treemapData, sunburstData, viewMode, rootTotal]);

  const onEvents = useMemo(() => {
    const handleClick = (params: Record<string, unknown>) => {
      const treeNode = params.data as Record<string, unknown> | undefined;
      const nodeData = treeNode?.nodeData as CostExplorerNode | undefined;
      if (!nodeData) return;

      // Update detail panel
      if (onNodeSelect) {
        onNodeSelect(nodeData);
      }

      // For treemap: manually dispatch drill-down zoom
      if (viewMode === "treemap") {
        const instance = chartRef.current?.getEchartsInstance();
        if (instance && nodeData.children && nodeData.children.length > 0) {
          instance.dispatchAction({
            type: "treemapRootToNode",
            targetNodeId: nodeData.id,
          });
        }
      }
    };

    return { click: handleClick };
  }, [onNodeSelect, viewMode]);

  // Resize ECharts when the container is resized by the user — must be before early return
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      instance.resize();
    }
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleResize]);

  const hasData = (data.children ?? []).length > 0;

  if (!hasData) {
    return (
      <div style={emptyStyles}>
        <div style={emptyIconStyles}>
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
        </div>
        <p style={{ margin: 0 }}>No cost data available for the selected time range.</p>
        <p style={{ fontSize: "var(--font-size-xs)", marginTop: 4, opacity: 0.6 }}>
          Cost data is recorded when AI sessions complete work on tickets.
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={resizableWrapperStyles}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={option}
        style={{ width: "100%", height: "100%" }}
        onEvents={onEvents}
      />
      <div style={resizeHandleStyles} title="Drag to resize" />
    </div>
  );
};

const resizableWrapperStyles: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 600,
  minHeight: 300,
  maxHeight: 1200,
  resize: "vertical",
  overflow: "hidden",
};

const resizeHandleStyles: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  height: 8,
  cursor: "ns-resize",
  background: "linear-gradient(transparent, rgba(255,255,255,0.04))",
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const emptyStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: 400,
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-sm)",
  textAlign: "center",
  gap: 8,
};

const emptyIconStyles: React.CSSProperties = {
  marginBottom: 8,
  opacity: 0.5,
};
