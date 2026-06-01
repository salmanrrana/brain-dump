import { useMemo } from "react";
import { Receipt } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors, formatUsd, emptyChartStyle, subtitleStyle } from "./chart-utils";
import { EChart, buildHBarOption } from "./echarts-base";
import type { DashboardCostAnalytics } from "../../api/cost";

export interface CostPerTicketChartProps {
  data: DashboardCostAnalytics["costPerTicket"];
}

/** Rich color palette for individual bars — each ticket gets its own hue. */
const BAR_PALETTE = [
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // emerald
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#84cc16", // lime
];

/**
 * CostPerTicketChart — Top-10 most expensive tickets as horizontal ranked bars.
 *
 * Redesigned from an unreadable vertical bar chart with 30+ angled labels
 * to a clean horizontal layout showing the top 10 tickets ranked by cost,
 * with an average reference line for context.
 */
export function CostPerTicketChart({ data }: CostPerTicketChartProps) {
  const colors = useThemeColors();

  const { top10, avgCost, totalCount, totalCost, remaining } = useMemo(() => {
    if (data.length === 0) {
      return { top10: [], avgCost: 0, totalCount: 0, totalCost: 0, remaining: 0 };
    }
    const sorted = [...data].sort((a, b) => b.costUsd - a.costUsd);
    const top = sorted.slice(0, 10).map((d) => ({
      ...d,
      shortTitle: d.title.length > 32 ? d.title.substring(0, 30) + "\u2026" : d.title,
    }));
    const total = data.reduce((sum, d) => sum + d.costUsd, 0);
    return {
      top10: top,
      avgCost: total / data.length,
      totalCount: data.length,
      totalCost: total,
      remaining: Math.max(0, data.length - 10),
    };
  }, [data]);

  const chartHeight = top10.length * 36 + 24;

  const option = useMemo(
    () =>
      buildHBarOption({
        categories: top10.map((d) => d.shortTitle),
        values: top10.map((d) => d.costUsd),
        palette: BAR_PALETTE,
        colors,
        xAxisLabelFormatter: (v) => `$${v}`,
        tooltipTitle: (index, name) => top10[index]?.title ?? name,
        tooltipValue: (value) => `Cost: ${formatUsd(value)}`,
        avg: avgCost,
        avgLabel: `avg ${formatUsd(avgCost)}`,
      }),
    [top10, avgCost, colors]
  );

  if (top10.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Receipt size={18} style={{ color: colors.secondary }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Cost per Ticket</h3>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyChartStyle}>No completed tickets with cost data</div>
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Receipt size={18} style={{ color: "#f43f5e" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost per Ticket</h3>
        <span style={subtitleStyle}>
          {totalCount} tickets {"\u2022"} {formatUsd(totalCost)} {"\u2022"} {formatUsd(avgCost)} avg
        </span>
      </div>
      <div style={sectionContentStyles}>
        <EChart option={option} height={chartHeight} ariaLabel="Cost per ticket (top 10)" />
        {remaining > 0 && (
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: colors.textSecondary,
              padding: "4px 0",
              fontStyle: "italic",
            }}
          >
            +{remaining} more tickets not shown
          </div>
        )}
      </div>
    </section>
  );
}
