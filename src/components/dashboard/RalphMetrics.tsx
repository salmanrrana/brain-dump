import { type FC, useMemo } from "react";
import { Clock, Bot } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors } from "./chart-utils";
import { EChart, buildHBarOption } from "./echarts-base";
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
const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
};

export const RalphMetrics: FC<RalphMetricsProps> = ({ analytics }) => {
  const { ralphMetrics } = analytics;
  const colors = useThemeColors();

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

  const option = useMemo(
    () =>
      buildHBarOption({
        categories: stateData.map((d) => d.name),
        values: stateData.map((d) => d.value),
        palette: stateData.map((d) => getStateColor(d.rawState)),
        colors,
        barWidth: 20,
        gradientEnd: 0.5,
        yAxisLabelColor: colors.textSecondary,
        tooltipValue: (value) => formatDuration(value),
      }),
    [stateData, colors]
  );

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
            <EChart
              option={option}
              height={stateData.length * 35 + 20}
              ariaLabel="Average time by Ralph session state"
            />
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
