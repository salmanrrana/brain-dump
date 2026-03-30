import { type FC, useMemo, useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface AIUsageChartProps {
  analytics: DashboardAnalytics;
}

/** Richer, more distinctive palette for AI usage segments. */
const SEGMENT_DEFAULTS = {
  claude: "#f97316",
  ralph: "#14b8a6",
  opencode: "#6366f1",
  user: "#94a3b8",
} as const;

function getComputedColors(): { claude: string; ralph: string; opencode: string; user: string } {
  if (typeof window === "undefined") return { ...SEGMENT_DEFAULTS };

  const root = document.documentElement;
  const style = getComputedStyle(root);

  return {
    claude: style.getPropertyValue("--accent-primary").trim() || SEGMENT_DEFAULTS.claude,
    ralph: style.getPropertyValue("--accent-ai").trim() || SEGMENT_DEFAULTS.ralph,
    opencode: "#6366f1",
    user: style.getPropertyValue("--text-tertiary").trim() || SEGMENT_DEFAULTS.user,
  };
}

/**
 * AIUsageChart - Donut chart with centered total statistic.
 */
export const AIUsageChart: FC<AIUsageChartProps> = ({ analytics }) => {
  const { aiUsage } = analytics;
  const [colors, setColors] = useState(getComputedColors());

  useEffect(() => {
    const updateColors = () => setColors(getComputedColors());
    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => {
    const total = aiUsage.claude + aiUsage.ralph + aiUsage.opencode + aiUsage.user;
    if (total === 0) return [];

    return [
      { name: "Claude", value: aiUsage.claude, percentage: (aiUsage.claude / total) * 100 },
      { name: "Ralph", value: aiUsage.ralph, percentage: (aiUsage.ralph / total) * 100 },
      { name: "OpenCode", value: aiUsage.opencode, percentage: (aiUsage.opencode / total) * 100 },
      { name: "User", value: aiUsage.user, percentage: (aiUsage.user / total) * 100 },
    ].filter((item) => item.value > 0);
  }, [aiUsage]);

  const total = aiUsage.claude + aiUsage.ralph + aiUsage.opencode + aiUsage.user;

  // Find the dominant source
  const dominant =
    data.length > 0
      ? data.reduce((max, item) => (item.value > max.value ? item : max), data[0]!)
      : null;

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Brain size={18} style={{ color: colors.ralph }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>AI Usage</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {total} comments
        </span>
      </div>
      <div style={sectionContentStyles}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name}: ${percentage.toFixed(0)}%`}
                outerRadius={80}
                innerRadius={40}
                dataKey="value"
                stroke="var(--bg-card)"
                strokeWidth={3}
                paddingAngle={2}
              >
                {data.map((entry, index) => {
                  const colorKey = entry.name.toLowerCase() as keyof typeof colors;
                  const color = colors[colorKey] || colors.user;
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Pie>
              {/* Centered total statistic */}
              {dominant && (
                <>
                  <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: 20, fontWeight: 700, fill: "var(--text-primary)" }}
                  >
                    {total}
                  </text>
                  <text
                    x="50%"
                    y="57%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontSize: 9,
                      fill: "var(--text-tertiary)",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.5px",
                    }}
                  >
                    total
                  </text>
                </>
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0];
                  if (!item) return null;
                  const payloadData = item.payload as { percentage?: number } | undefined;
                  const percentage = payloadData?.percentage ?? 0;
                  return (
                    <div
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "none",
                        outline: "none",
                        borderRadius: "var(--radius-md)",
                        padding: "var(--spacing-2)",
                        color: "var(--text-primary)",
                        fontSize: "var(--font-size-sm)",
                        boxShadow: "var(--shadow-lg)",
                      }}
                    >
                      <div style={{ fontWeight: "500" }}>{item.name}</div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {item.value} comments ({percentage.toFixed(1)}%)
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 220,
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No AI usage data yet
          </div>
        )}
      </div>
    </section>
  );
};
