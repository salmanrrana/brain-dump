import { useMemo } from "react";
import { Layers } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors, formatUsd, emptyChartStyle, subtitleStyle } from "./chart-utils";
import { EChart, buildHBarOption } from "./echarts-base";
import type { DashboardCostAnalytics } from "../../api/cost";

export interface CostByEpicChartProps {
  data: DashboardCostAnalytics["costByEpic"];
}

/** Rich palette for epic bars — each epic gets a unique color. */
const EPIC_PALETTE = [
  "#10b981", // emerald
  "#6366f1", // indigo
  "#f97316", // orange
  "#ec4899", // pink
  "#0ea5e9", // sky
  "#eab308", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#84cc16", // lime
];

/**
 * CostByEpicChart - Horizontal bar chart with individually colored epic bars.
 */
export function CostByEpicChart({ data }: CostByEpicChartProps) {
  const colors = useThemeColors();

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        shortTitle: d.title.length > 30 ? d.title.substring(0, 28) + "\u2026" : d.title,
      })),
    [data]
  );

  const option = useMemo(
    () =>
      buildHBarOption({
        categories: chartData.map((d) => d.shortTitle),
        values: chartData.map((d) => d.costUsd),
        palette: EPIC_PALETTE,
        colors,
        xAxisLabelFormatter: (v) => `$${v}`,
        tooltipTitle: (index, name) => chartData[index]?.title ?? name,
        tooltipValue: (value) => `Cost: ${formatUsd(value)}`,
      }),
    [chartData, colors]
  );

  if (chartData.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Layers size={18} style={{ color: "#10b981" }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyChartStyle}>No epic cost data yet</div>
        </div>
      </section>
    );
  }

  const totalCost = chartData.reduce((sum, d) => sum + d.costUsd, 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Layers size={18} style={{ color: "#10b981" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        <span style={subtitleStyle}>{formatUsd(totalCost)} total</span>
      </div>
      <div style={sectionContentStyles}>
        <EChart option={option} height={chartData.length * 36 + 20} ariaLabel="Cost by epic" />
      </div>
    </section>
  );
}
