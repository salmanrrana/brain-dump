import { type FC, useMemo } from "react";
import { Clock } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors } from "./chart-utils";
import { EChart, twoColorGradient, tooltipBox, type FormatterParam } from "./echarts-base";
import type { DashboardAnalytics } from "../../api/analytics";

export interface CycleTimeCardProps {
  analytics: DashboardAnalytics;
}

/**
 * CycleTimeCard - Shows average, median, and P95 cycle times.
 */
const formatHours = (hours: number): string => {
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours < 1) {
    return `${days}d`;
  }
  return `${days}d ${remainingHours.toFixed(0)}h`;
};

export const CycleTimeCard: FC<CycleTimeCardProps> = ({ analytics }) => {
  const { cycleTime } = analytics;
  const colors = useThemeColors();

  const option = useMemo(
    () => ({
      grid: { top: 5, right: 5, bottom: 50, left: 5, containLabel: true },
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
        data: cycleTime.distribution.map((d) => d.range),
        axisLabel: { fontSize: 9, color: colors.textSecondary, rotate: 45 },
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
          data: cycleTime.distribution.map((d) => d.count),
          itemStyle: {
            color: twoColorGradient(colors.primary, colors.secondary),
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    }),
    [cycleTime.distribution, colors]
  );

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Clock size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cycle Time</h3>
      </div>
      <div style={sectionContentStyles}>
        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--spacing-2)",
            marginBottom: "var(--spacing-3)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Avg
            </div>
            <div
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {formatHours(cycleTime.avg)}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Median
            </div>
            <div
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {formatHours(cycleTime.median)}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-1)",
              }}
            >
              P95
            </div>
            <div
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {formatHours(cycleTime.p95)}
            </div>
          </div>
        </div>

        {/* Distribution chart */}
        {cycleTime.distribution.length > 0 ? (
          <EChart option={option} height={120} ariaLabel="Cycle time distribution" />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 120,
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No cycle time data yet
          </div>
        )}
      </div>
    </section>
  );
};
