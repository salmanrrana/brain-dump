import { type FC, useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
      primary: "#f97316",
      border: "#374151",
      textSecondary: "#94a3b8",
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue("--accent-primary").trim() || "#f97316",
    border: style.getPropertyValue("--border-primary").trim() || "#374151",
    textSecondary: style.getPropertyValue("--text-secondary").trim() || "#94a3b8",
  };
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export interface CostTrendChartProps {
  data: DashboardCostAnalytics["costTrend"];
}

/**
 * CostTrendChart - Line chart showing daily cost over last 30 days.
 * Follows SessionsOverTimeChart pattern from AITelemetryTab.
 */
export const CostTrendChart: FC<CostTrendChartProps> = ({ data }) => {
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

  const hasData = data.some((d) => d.costUsd > 0);
  const totalCost = data.reduce((sum, d) => sum + d.costUsd, 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <DollarSign size={18} style={{ color: colors.primary }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost Trend</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {hasData ? `${formatUsd(totalCost)} total • Last 30 days` : "Last 30 days"}
        </span>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={formatShortDate}
              />
              <YAxis
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                formatter={(value: number) => [formatUsd(value), "Cost"]}
              />
              <Line
                type="monotone"
                dataKey="costUsd"
                stroke={colors.primary}
                strokeWidth={2}
                dot={{ fill: colors.primary, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No cost data yet" />
        )}
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
