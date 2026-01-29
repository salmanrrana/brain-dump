import { type FC } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
 * VelocityChart - Shows completion trend over last 30 days with velocity indicator.
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

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
          <Activity size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
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
        {completionTrend.length > 0 && completionTrend.some((d) => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={completionTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
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
                wrapperStyle={{
                  outline: "none",
                  border: "none",
                }}
                labelFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString();
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--accent-primary)"
                strokeWidth={2}
                dot={{ fill: "var(--accent-primary)", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
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
