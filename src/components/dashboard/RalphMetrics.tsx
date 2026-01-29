import { type FC, useMemo, useState, useEffect } from "react";
import { Clock, Bot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface RalphMetricsProps {
  analytics: DashboardAnalytics;
}

/**
 * RalphMetrics - Shows Ralph session success rate, average duration, and time by state.
 */
export const RalphMetrics: FC<RalphMetricsProps> = ({ analytics }) => {
  const { ralphMetrics } = analytics;

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  // Prepare data for horizontal bar chart (time by state)
  const stateData = useMemo(() => {
    const entries = Object.entries(ralphMetrics.avgTimeByState)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Top 5 states

    return entries.map(([state, minutes]) => ({
      name: state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " "),
      value: minutes,
    }));
  }, [ralphMetrics.avgTimeByState]);

  // Get computed colors for gradient
  const [colors, setColors] = useState({ start: "#14b8a6", end: "#f97316" });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateColors = () => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const start = style.getPropertyValue("--accent-ai").trim() || "#14b8a6";
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
        <Bot size={18} style={{ color: "var(--accent-ai)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Ralph Sessions</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {ralphMetrics.totalSessions} total
        </span>
      </div>
      <div style={sectionContentStyles}>
        {/* Average Duration - Prominent */}
        <div style={{ marginBottom: "var(--spacing-4)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
              marginBottom: "var(--spacing-1)",
            }}
          >
            <Clock size={16} style={{ color: "var(--accent-ai)" }} />
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Avg Duration
            </span>
          </div>
          <div>
            <span
              style={{
                fontSize: "var(--font-size-2xl)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--accent-ai)",
                background: "linear-gradient(135deg, var(--accent-ai), var(--accent-primary))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {formatDuration(ralphMetrics.avgDuration)}
            </span>
          </div>
        </div>

        {/* Time by State - Horizontal Bar Chart */}
        {stateData.length > 0 ? (
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-2)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Time by State
            </div>
            <ResponsiveContainer width="100%" height={stateData.length * 35 + 20}>
              <BarChart
                data={stateData}
                layout="vertical"
                margin={{ top: 5, right: 5, left: 60, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="ralphGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={colors.start} />
                    <stop offset="100%" stopColor={colors.end} />
                  </linearGradient>
                </defs>
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  stroke="var(--border-primary)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
                  stroke="var(--border-primary)"
                  width={55}
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
                  formatter={(value: number) => formatDuration(value)}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  fill="url(#ralphGradient)"
                  background={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 140,
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            No state data yet
          </div>
        )}
      </div>
    </section>
  );
};
