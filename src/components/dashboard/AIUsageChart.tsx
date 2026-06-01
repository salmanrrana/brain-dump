import { type FC, useMemo, useEffect, useState } from "react";
import { Brain } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors } from "./chart-utils";
import { EChart, buildDonutOption } from "./echarts-base";
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
  const themeColors = useThemeColors();

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

  const option = useMemo(
    () =>
      buildDonutOption({
        data: data.map((entry) => {
          const colorKey = entry.name.toLowerCase() as keyof typeof colors;
          return { name: entry.name, value: entry.value, color: colors[colorKey] || colors.user };
        }),
        colors: themeColors,
        centerText: dominant ? String(total) : undefined,
        centerSubtext: "TOTAL",
        labelFormatter: "{b}: {d}%",
        tooltipUnit: "comment",
      }),
    [data, dominant, total, colors, themeColors]
  );

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
          <EChart option={option} height={220} ariaLabel="AI usage breakdown by source" />
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
