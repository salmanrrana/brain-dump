import { useMemo } from "react";
import { DollarSign } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors, formatUsd, formatShortDate, subtitleStyle } from "./chart-utils";
import { EChart, buildAreaOption } from "./echarts-base";
import type { DashboardCostAnalytics } from "../../api/cost";

const COST_COLOR = "#10b981";

export interface CostTrendChartProps {
  data: DashboardCostAnalytics["costTrend"];
}

/**
 * CostTrendChart - Daily cost trend with gradient area fill and average reference.
 */
export function CostTrendChart({ data }: CostTrendChartProps) {
  const colors = useThemeColors();
  const hasData = data.some((d) => d.costUsd > 0);
  const totalCost = data.reduce((sum, d) => sum + d.costUsd, 0);
  const daysWithCost = data.filter((d) => d.costUsd > 0).length;
  const avgDaily = daysWithCost > 0 ? totalCost / daysWithCost : 0;

  const option = useMemo(
    () =>
      buildAreaOption({
        categories: data.map((d) => d.date),
        values: data.map((d) => d.costUsd),
        color: COST_COLOR,
        colors,
        avg: avgDaily,
        xAxisLabelFormatter: formatShortDate,
        yAxisLabelFormatter: (v) => `$${v}`,
        tooltipTitle: (name) => new Date(name).toLocaleDateString(),
        tooltipValue: (value) => `Cost: ${formatUsd(value)}`,
      }),
    [data, avgDaily, colors]
  );

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <DollarSign size={18} style={{ color: "#10b981" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost Trend</h3>
        <span style={subtitleStyle}>
          {hasData ? `${formatUsd(totalCost)} total \u2022 Last 30 days` : "Last 30 days"}
        </span>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <EChart option={option} height={200} ariaLabel="Daily cost trend" />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: colors.textSecondary,
              fontSize: "var(--font-size-sm)",
            }}
          >
            No cost data yet
          </div>
        )}
      </div>
    </section>
  );
}
