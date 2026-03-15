import { type FC, useEffect, useState, useMemo } from "react";
import { Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardCostAnalytics } from "../../api/cost";

function getComputedColors() {
  if (typeof window === "undefined") {
    return {
      ai: "#14b8a6",
      border: "#374151",
      textSecondary: "#94a3b8",
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    ai: style.getPropertyValue("--accent-ai").trim() || "#14b8a6",
    border: style.getPropertyValue("--border-primary").trim() || "#374151",
    textSecondary: style.getPropertyValue("--text-secondary").trim() || "#94a3b8",
  };
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export interface CostByEpicChartProps {
  data: DashboardCostAnalytics["costByEpic"];
}

/**
 * CostByEpicChart - Horizontal bar chart showing total cost per epic.
 * Follows ToolCallDistributionChart pattern from AITelemetryTab.
 */
export const CostByEpicChart: FC<CostByEpicChartProps> = ({ data }) => {
  const [colors, setColors] = useState(getComputedColors());

  useEffect(() => {
    const update = () => setColors(getComputedColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        shortTitle: d.title.length > 25 ? d.title.substring(0, 25) + "…" : d.title,
      })),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Layers size={18} style={{ color: colors.ai }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        </div>
        <div style={sectionContentStyles}>
          <EmptyState message="No epic cost data yet" />
        </div>
      </section>
    );
  }

  const totalCost = chartData.reduce((sum, d) => sum + d.costUsd, 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Layers size={18} style={{ color: colors.ai }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {formatUsd(totalCost)} total
        </span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={chartData.length * 32 + 20}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 100, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              tickFormatter={(v: number) => `$${v}`}
            />
            <YAxis
              type="category"
              dataKey="shortTitle"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              width={95}
              stroke={colors.border}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [formatUsd(value), "Cost"]}
              labelFormatter={(_label: string, payload) => {
                const item = payload?.[0]?.payload as { title?: string } | undefined;
                return item?.title ?? _label;
              }}
            />
            <Bar dataKey="costUsd" fill={colors.ai} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-secondary)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "var(--spacing-2)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  boxShadow: "var(--shadow-lg)",
};

function EmptyState({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}
