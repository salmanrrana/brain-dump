import { type FC, useMemo, useState, useEffect } from "react";
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface VelocityMetricsProps {
  analytics: DashboardAnalytics;
}

/**
 * VelocityMetrics - Shows velocity cards for this week, last week, and this month.
 */
export const VelocityMetrics: FC<VelocityMetricsProps> = ({ analytics }) => {
  const { velocity } = analytics;

  const getTrendIcon = () => {
    switch (velocity.trend) {
      case "up":
        return <TrendingUp size={14} style={{ color: "var(--status-done)" }} />;
      case "down":
        return <TrendingDown size={14} style={{ color: "var(--accent-danger)" }} />;
      default:
        return <Minus size={14} style={{ color: "var(--text-secondary)" }} />;
    }
  };

  const getWeekChange = () => {
    if (velocity.lastWeek === 0) {
      return velocity.thisWeek > 0 ? "+100%" : "0%";
    }
    const change = ((velocity.thisWeek - velocity.lastWeek) / velocity.lastWeek) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`;
  };

  const chartData = useMemo(
    () => [
      { name: "Last Week", value: velocity.lastWeek },
      { name: "This Week", value: velocity.thisWeek },
      { name: "This Month", value: velocity.thisMonth },
    ],
    [velocity]
  );

  // Get computed colors for gradient
  const [colors, setColors] = useState({ start: "#71717a", end: "#f97316" });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateColors = () => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const start = style.getPropertyValue("--text-tertiary").trim() || "#71717a";
      const end = style.getPropertyValue("--accent-primary").trim() || "#f97316";
      setColors({ start, end });
    };
    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Gauge size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Velocity</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-1)" }}>
          {getTrendIcon()}
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
            {getWeekChange()}
          </span>
        </div>
      </div>
      <div style={sectionContentStyles}>
        {/* Mini bar chart */}
        <div style={{ marginBottom: "var(--spacing-3)", height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                {/* Gradient for bar 1 (Last Week) - 0% to 33.33% */}
                <linearGradient id="velocityGradient0" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.start} />
                  <stop offset="100%" stopColor={colors.start} />
                </linearGradient>
                {/* Gradient for bar 2 (This Week) - 33.33% to 66.66% */}
                <linearGradient id="velocityGradient1" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.start} />
                  <stop offset="100%" stopColor={colors.end} />
                </linearGradient>
                {/* Gradient for bar 3 (This Month) - 66.66% to 100% */}
                <linearGradient id="velocityGradient2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.end} />
                  <stop offset="100%" stopColor={colors.end} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                width={30}
              />
              <Tooltip
                cursor={{ fill: "transparent" }}
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
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} background={false}>
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#velocityGradient${index})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Value cards - order matches chart: Last Week, This Week, This Month */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--spacing-2)",
          }}
        >
          <div style={metricCardStyles}>
            <div style={metricValueStyles}>{velocity.lastWeek}</div>
            <div style={metricLabelStyles}>Last Week</div>
          </div>
          <div style={metricCardStyles}>
            <div style={metricValueStyles}>{velocity.thisWeek}</div>
            <div style={metricLabelStyles}>This Week</div>
          </div>
          <div style={metricCardStyles}>
            <div style={metricValueStyles}>{velocity.thisMonth}</div>
            <div style={metricLabelStyles}>This Month</div>
          </div>
        </div>
      </div>
    </section>
  );
};

const metricCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "var(--spacing-3)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-secondary)",
};

const metricValueStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  lineHeight: 1,
};

const metricLabelStyles: React.CSSProperties = {
  marginTop: "var(--spacing-1)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};
