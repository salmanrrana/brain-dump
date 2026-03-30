import { type FC } from "react";
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
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface VelocityChartProps {
  analytics: DashboardAnalytics;
}

/**
 * VelocityChart - Completion trend with gradient area fill and average reference line.
 */
export const VelocityChart: FC<VelocityChartProps> = ({ analytics }) => {
  const { completionTrend, velocity } = analytics;

  const getTrendIcon = () => {
    switch (velocity.trend) {
      case "up":
        return <TrendingUp size={16} style={{ color: "var(--status-done)" }} />;
      case "down":
        return <TrendingDown size={16} style={{ color: "var(--accent-danger)" }} />;
      default:
        return <Minus size={16} style={{ color: "var(--text-secondary)" }} />;
    }
  };

  const getTrendLabel = () => {
    switch (velocity.trend) {
      case "up":
        return "Increasing";
      case "down":
        return "Decreasing";
      default:
        return "Stable";
    }
  };

  const hasData = completionTrend.length > 0 && completionTrend.some((d) => d.count > 0);
  const avg = hasData
    ? completionTrend.reduce((sum, d) => sum + d.count, 0) /
      completionTrend.filter((d) => d.count > 0).length
    : 0;

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
          <Activity size={18} style={{ color: "#10b981" }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Completion Trend</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-1)" }}>
          {getTrendIcon()}
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
            {getTrendLabel()}
          </span>
        </div>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={completionTrend}>
              <defs>
                <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="none"
                stroke="var(--border-primary)"
                opacity={0.15}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "none",
                  outline: "none",
                  boxShadow: "var(--shadow-lg)",
                  padding: "var(--spacing-2)",
                  borderRadius: "var(--radius-md)",
                }}
                wrapperStyle={{ outline: "none", border: "none" }}
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              {avg > 0 && (
                <ReferenceLine
                  y={avg}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              )}
              <Area
                type="monotone"
                dataKey="count"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#completionGradient)"
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
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No completion data yet
          </div>
        )}
      </div>
    </section>
  );
};
