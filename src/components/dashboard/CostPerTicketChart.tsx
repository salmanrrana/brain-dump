import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import {
  useThemeColors,
  formatUsd,
  tooltipStyle,
  emptyChartStyle,
  subtitleStyle,
} from "./chart-utils";
import type { DashboardCostAnalytics } from "../../api/cost";

export interface CostPerTicketChartProps {
  data: DashboardCostAnalytics["costPerTicket"];
}

/**
 * CostPerTicketChart - Bar chart showing cost per completed ticket (last 30 days).
 */
export function CostPerTicketChart({ data }: CostPerTicketChartProps) {
  const colors = useThemeColors();

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        shortTitle: d.title.length > 20 ? d.title.substring(0, 20) + "\u2026" : d.title,
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
          <div style={emptyChartStyle}>No completed tickets with cost data</div>
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
        <span style={subtitleStyle}>
          {chartData.length} tickets \u2022 {formatUsd(avgCost)} avg
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
}
