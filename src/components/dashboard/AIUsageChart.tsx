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

// Get computed CSS variable values for recharts (which needs actual color strings)
function getComputedColors(): { claude: string; ralph: string; opencode: string; user: string } {
  if (typeof window === "undefined") {
    // SSR fallback
    return {
      claude: "#f97316", // Ember orange
      ralph: "#14b8a6", // Teal
      opencode: "#ea580c", // Ember secondary
      user: "#71717a", // Gray
    };
  }

  const root = document.documentElement;
  const style = getComputedStyle(root);

  return {
    claude: style.getPropertyValue("--accent-primary").trim() || "#f97316",
    ralph: style.getPropertyValue("--accent-ai").trim() || "#14b8a6",
    opencode: style.getPropertyValue("--accent-secondary").trim() || "#ea580c",
    user: style.getPropertyValue("--text-tertiary").trim() || "#71717a",
  };
}

/**
 * AIUsageChart - Shows distribution of AI usage via donut chart.
 */
export const AIUsageChart: FC<AIUsageChartProps> = ({ analytics }) => {
  const { aiUsage } = analytics;
  const [colors, setColors] = useState(getComputedColors());

  // Update colors when theme changes (listen for data-theme attribute changes)
  useEffect(() => {
    const updateColors = () => setColors(getComputedColors());

    // Initial load
    updateColors();

    // Watch for theme changes via MutationObserver
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

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Brain size={18} style={{ color: "var(--accent-ai)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>AI Usage</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {total} comments
        </span>
      </div>
      <div style={sectionContentStyles}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage }) => `${name}: ${percentage.toFixed(0)}%`}
                outerRadius={75}
                innerRadius={35}
                fill="#8884d8"
                dataKey="value"
                stroke="var(--bg-secondary)"
                strokeWidth={2}
              >
                {data.map((entry, index) => {
                  const colorKey = entry.name.toLowerCase() as keyof typeof colors;
                  const color = colors[colorKey] || colors.user;
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0];
                  if (!data) return null;
                  const payloadData = data.payload as { percentage?: number } | undefined;
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
                      <div style={{ fontWeight: "500" }}>{data.name}</div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {data.value} comments ({percentage.toFixed(1)}%)
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
              height: 200,
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
