import { type FC, useMemo } from "react";
import { Clock, Bot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
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

/** State-specific colors matching the cost explorer stage palette. */
const STATE_COLORS: Record<string, string> = {
  committing: "#a855f7", // violet
  implementing: "#f97316", // orange
  testing: "#22c55e", // green
  analyzing: "#3b82f6", // blue
  reviewing: "#14b8a6", // teal
  idle: "#71717a", // gray
};

function getStateColor(state: string): string {
  const key = state.toLowerCase().replace(/\s+/g, "_");
  return STATE_COLORS[key] ?? "#6366f1";
}

/**
 * RalphMetrics - Shows Ralph session stats with state-colored bars.
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

  const stateData = useMemo(() => {
    const entries = Object.entries(ralphMetrics.avgTimeByState)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return entries.map(([state, minutes]) => ({
      name: state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " "),
      value: minutes,
      rawState: state,
    }));
  }, [ralphMetrics.avgTimeByState]);

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

        {/* Time by State - Horizontal Bar Chart with state-specific colors */}
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
                margin={{ top: 5, right: 5, left: 70, bottom: 5 }}
              >
                <defs>
                  {stateData.map((item, i) => {
                    const color = getStateColor(item.rawState);
                    return (
                      <linearGradient key={i} id={`stateBar${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                  stroke="var(--border-primary)"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                  stroke="transparent"
                  width={65}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--bg-hover)", radius: 4 }}
                  contentStyle={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "none",
                    outline: "none",
                    boxShadow: "var(--shadow-lg)",
                    padding: "var(--spacing-2)",
                    borderRadius: "var(--radius-md)",
                  }}
                  wrapperStyle={{ outline: "none", border: "none" }}
                  formatter={(value: number) => formatDuration(value)}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {stateData.map((_entry, index) => (
                    <Cell key={index} fill={`url(#stateBar${index})`} />
                  ))}
                </Bar>
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
