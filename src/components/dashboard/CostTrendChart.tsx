import { DollarSign } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
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
  subtitleStyle,
} from "./chart-utils";
import type { DashboardCostAnalytics } from "../../api/cost";

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
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="costTrendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="none"
                stroke={colors.border}
                opacity={0.12}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={formatShortDate}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={(v: number) => `$${v}`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                separator=": "
                labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                formatter={(value: number) => [formatUsd(value), "Cost"]}
              />
              {avgDaily > 0 && (
                <ReferenceLine
                  y={avgDaily}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              )}
              <Area
                type="monotone"
                dataKey="costUsd"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#costTrendGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: "#10b981",
                  fill: "var(--bg-card)",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
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
