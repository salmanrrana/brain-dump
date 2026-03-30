import { useMemo } from "react";
import { Receipt } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
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

/** Rich color palette for individual bars — each ticket gets its own hue. */
const BAR_PALETTE = [
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // emerald
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#84cc16", // lime
];

/**
 * CostPerTicketChart — Top-10 most expensive tickets as horizontal ranked bars.
 *
 * Redesigned from an unreadable vertical bar chart with 30+ angled labels
 * to a clean horizontal layout showing the top 10 tickets ranked by cost,
 * with an average reference line for context.
 */
export function CostPerTicketChart({ data }: CostPerTicketChartProps) {
  const colors = useThemeColors();

  const { top10, avgCost, totalCount, totalCost, remaining } = useMemo(() => {
    if (data.length === 0) {
      return { top10: [], avgCost: 0, totalCount: 0, totalCost: 0, remaining: 0 };
    }
    const sorted = [...data].sort((a, b) => b.costUsd - a.costUsd);
    const top = sorted.slice(0, 10).map((d) => ({
      ...d,
      shortTitle: d.title.length > 32 ? d.title.substring(0, 30) + "\u2026" : d.title,
    }));
    const total = data.reduce((sum, d) => sum + d.costUsd, 0);
    return {
      top10: top,
      avgCost: total / data.length,
      totalCount: data.length,
      totalCost: total,
      remaining: Math.max(0, data.length - 10),
    };
  }, [data]);

  if (top10.length === 0) {
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

  const chartHeight = top10.length * 36 + 24;

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Receipt size={18} style={{ color: "#f43f5e" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost per Ticket</h3>
        <span style={subtitleStyle}>
          {totalCount} tickets {"\u2022"} {formatUsd(totalCost)} {"\u2022"} {formatUsd(avgCost)} avg
        </span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
          >
            <defs>
              {BAR_PALETTE.map((color, i) => (
                <linearGradient key={i} id={`ticketBar${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              tickFormatter={(v: number) => `$${v}`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="shortTitle"
              tick={{ fontSize: 11, fill: colors.text }}
              stroke="transparent"
              width={200}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                ...tooltipStyle,
                minWidth: 200,
              }}
              formatter={(value: number) => [formatUsd(value), "Cost"]}
              labelFormatter={(_label: string, payload) => {
                const item = payload?.[0]?.payload as { title?: string } | undefined;
                return item?.title ?? _label;
              }}
              cursor={{ fill: "var(--bg-hover)", radius: 4 }}
            />
            <ReferenceLine
              x={avgCost}
              stroke={colors.textSecondary}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `avg ${formatUsd(avgCost)}`,
                position: "top",
                fill: colors.textSecondary,
                fontSize: 10,
              }}
            />
            <Bar dataKey="costUsd" radius={[0, 6, 6, 0]} barSize={22}>
              {top10.map((_entry, index) => (
                <Cell key={index} fill={`url(#ticketBar${index % BAR_PALETTE.length})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {remaining > 0 && (
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: colors.textSecondary,
              padding: "4px 0",
              fontStyle: "italic",
            }}
          >
            +{remaining} more tickets not shown
          </div>
        )}
      </div>
    </section>
  );
}
