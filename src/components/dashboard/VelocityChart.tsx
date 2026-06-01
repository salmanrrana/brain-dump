import { type FC, useMemo } from "react";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors, formatShortDate } from "./chart-utils";
import { EChart, buildAreaOption } from "./echarts-base";
import type { DashboardAnalytics } from "../../api/analytics";

const COMPLETION_COLOR = "#10b981";

export interface VelocityChartProps {
  analytics: DashboardAnalytics;
}

/**
 * VelocityChart - Completion trend with gradient area fill and average reference line.
 */
export const VelocityChart: FC<VelocityChartProps> = ({ analytics }) => {
  const { completionTrend, velocity } = analytics;
  const colors = useThemeColors();

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

  const option = useMemo(
    () =>
      buildAreaOption({
        categories: completionTrend.map((d) => d.date),
        values: completionTrend.map((d) => d.count),
        color: COMPLETION_COLOR,
        colors,
        avg,
        xAxisLabelFormatter: formatShortDate,
        tooltipTitle: (name) => new Date(name).toLocaleDateString(),
        tooltipValue: (value) => `${value} completed`,
      }),
    [completionTrend, avg, colors]
  );

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
          <EChart option={option} height={200} ariaLabel="Completion trend over time" />
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
