import { useMemo } from "react";
import { Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
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

export interface CostByEpicChartProps {
  data: DashboardCostAnalytics["costByEpic"];
}

/** Rich palette for epic bars — each epic gets a unique color. */
const EPIC_PALETTE = [
  "#10b981", // emerald
  "#6366f1", // indigo
  "#f97316", // orange
  "#ec4899", // pink
  "#0ea5e9", // sky
  "#eab308", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#84cc16", // lime
];

/**
 * CostByEpicChart - Horizontal bar chart with individually colored epic bars.
 */
export function CostByEpicChart({ data }: CostByEpicChartProps) {
  const colors = useThemeColors();

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        shortTitle: d.title.length > 30 ? d.title.substring(0, 28) + "\u2026" : d.title,
      })),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Layers size={18} style={{ color: "#10b981" }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyChartStyle}>No epic cost data yet</div>
        </div>
      </section>
    );
  }

  const totalCost = chartData.reduce((sum, d) => sum + d.costUsd, 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Layers size={18} style={{ color: "#10b981" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cost by Epic</h3>
        <span style={subtitleStyle}>{formatUsd(totalCost)} total</span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={chartData.length * 36 + 20}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 8, bottom: 5 }}
          >
            <defs>
              {EPIC_PALETTE.map((color, i) => (
                <linearGradient key={i} id={`epicBar${i}`} x1="0" y1="0" x2="1" y2="0">
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
              width={200}
              stroke="transparent"
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ ...tooltipStyle, minWidth: 180 }}
              formatter={(value: number) => [formatUsd(value), "Cost"]}
              labelFormatter={(_label: string, payload) => {
                const item = payload?.[0]?.payload as { title?: string } | undefined;
                return item?.title ?? _label;
              }}
              cursor={{ fill: "var(--bg-hover)", radius: 4 }}
            />
            <Bar dataKey="costUsd" radius={[0, 6, 6, 0]} barSize={22}>
              {chartData.map((_entry, index) => (
                <Cell key={index} fill={`url(#epicBar${index % EPIC_PALETTE.length})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
