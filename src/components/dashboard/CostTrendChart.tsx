import { DollarSign } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import {
  useThemeColors,
  formatUsd,
  formatShortDate,
  tooltipStyle,
  emptyChartStyle,
  subtitleStyle,
} from "./chart-utils";
import type { DashboardCostAnalytics } from "../../api/cost";

export interface CostTrendChartProps {
  data: DashboardCostAnalytics["costTrend"];
}

/**
 * CostTrendChart - Line chart showing daily cost over last 30 days.
 */
export function CostTrendChart({ data }: CostTrendChartProps) {
  const colors = useThemeColors();
  const hasData = data.some((d) => d.costUsd > 0);
  const totalCost = data.reduce((sum, d) => sum + d.costUsd, 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <DollarSign size={18} style={{ color: colors.primary }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost Trend</h3>
        <span style={subtitleStyle}>
          {hasData ? `${formatUsd(totalCost)} total \u2022 Last 30 days` : "Last 30 days"}
        </span>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={formatShortDate}
              />
              <YAxis
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                separator=": "
                labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                formatter={(value: number) => [formatUsd(value), "Cost"]}
              />
              <Line
                type="monotone"
                dataKey="costUsd"
                stroke={colors.primary}
                strokeWidth={2}
                dot={{ fill: colors.primary, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={emptyChartStyle}>No cost data yet</div>
        )}
      </div>
    </section>
  );
}
