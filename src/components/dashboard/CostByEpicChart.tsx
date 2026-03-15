import { useMemo } from "react";
import { Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import {
  useThemeColors,
  formatUsd,
  tooltipStyle,
  emptyChartStyle,
  subtitleStyle,
} from "./chart-utils";
import type { DashboardCostAnalytics } from "../../api/cost";

export interface CostByEpicChartProps {
  data: DashboardCostAnalytics["costByEpic"];
}

/**
 * CostByEpicChart - Horizontal bar chart showing total cost per epic.
 */
export function CostByEpicChart({ data }: CostByEpicChartProps) {
  const colors = useThemeColors();

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        shortTitle: d.title.length > 30 ? d.title.substring(0, 30) + "\u2026" : d.title,
      })),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Layers size={18} style={{ color: colors.ai }} aria-hidden="true" />
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
        <Layers size={18} style={{ color: colors.ai }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        <span style={subtitleStyle}>{formatUsd(totalCost)} total</span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={chartData.length * 32 + 20}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 120, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              tickFormatter={(v: number) => `$${v}`}
            />
            <YAxis
              type="category"
              dataKey="shortTitle"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              width={115}
              stroke={colors.border}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [formatUsd(value), "Cost"]}
              labelFormatter={(_label: string, payload) => {
                const item = payload?.[0]?.payload as { title?: string } | undefined;
                return item?.title ?? _label;
              }}
            />
            <Bar dataKey="costUsd" fill={colors.ai} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
