import { type FC, useMemo } from "react";
import { Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors } from "./chart-utils";
import { EChart, twoColorGradient, tooltipBox, type FormatterParam } from "./echarts-base";
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

  const colors = useThemeColors();

  const option = useMemo(() => {
    // Per-bar gradients: solid muted → muted→primary blend → solid primary.
    const barColors = [
      twoColorGradient(colors.muted, colors.muted),
      twoColorGradient(colors.muted, colors.primary),
      twoColorGradient(colors.primary, colors.primary),
    ];
    return {
      grid: { top: 5, right: 5, bottom: 5, left: 5, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...tooltipBox(colors),
        formatter: (params: FormatterParam[]) => {
          const p = params[0];
          if (!p) return "";
          return `<div style="font-weight:500">${p.name}</div><div style="color:var(--text-secondary)">${p.value}</div>`;
        },
      },
      xAxis: {
        type: "category",
        data: chartData.map((d) => d.name),
        axisLabel: { fontSize: 9, color: colors.textSecondary },
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 9, color: colors.textSecondary },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: colors.border, opacity: 0.3 } },
      },
      series: [
        {
          type: "bar",
          data: chartData.map((d, i) => ({
            value: d.value,
            itemStyle: { color: barColors[i], borderRadius: [4, 4, 0, 0] },
          })),
        },
      ],
    };
  }, [chartData, colors]);

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
          <EChart option={option} height="100%" ariaLabel="Velocity by period" />
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
