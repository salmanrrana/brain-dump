import { type FC, useEffect, useState, useMemo } from "react";
import { Receipt } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
      secondary: "#ea580c",
      border: "#374151",
      textSecondary: "#94a3b8",
    };
  }
  const style = getComputedStyle(document.documentElement);
  return {
    secondary: style.getPropertyValue("--accent-secondary").trim() || "#ea580c",
    border: style.getPropertyValue("--border-primary").trim() || "#374151",
    textSecondary: style.getPropertyValue("--text-secondary").trim() || "#94a3b8",
  };
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export interface CostPerTicketChartProps {
  data: DashboardCostAnalytics["costPerTicket"];
}

/**
 * CostPerTicketChart - Bar chart showing cost per completed ticket (last 30 days).
 */
export const CostPerTicketChart: FC<CostPerTicketChartProps> = ({ data }) => {
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
        shortTitle: d.title.length > 20 ? d.title.substring(0, 20) + "…" : d.title,
      })),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Receipt size={18} style={{ color: colors.secondary }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Cost per Ticket</h3>
        </div>
        <div style={sectionContentStyles}>
          <EmptyState message="No completed tickets with cost data" />
        </div>
      </section>
    );
  }

  const avgCost = chartData.reduce((sum, d) => sum + d.costUsd, 0) / chartData.length;

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Receipt size={18} style={{ color: colors.secondary }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost per Ticket</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {chartData.length} tickets • {formatUsd(avgCost)} avg
        </span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.3} />
            <XAxis
              dataKey="shortTitle"
              tick={{ fontSize: 9, fill: colors.textSecondary }}
              stroke={colors.border}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [formatUsd(value), "Cost"]}
              labelFormatter={(_label: string, payload) => {
                const item = payload?.[0]?.payload as { title?: string } | undefined;
                return item?.title ?? _label;
              }}
            />
            <Bar dataKey="costUsd" fill={colors.secondary} radius={[4, 4, 0, 0]} />
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
