import { type FC, useMemo } from "react";
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

/** OpenCode has no theme token; it keeps a fixed brand color. */
const OPENCODE_COLOR = "#6366f1";

/**
 * AIUsageChart - Donut chart with centered total statistic.
 */
export const AIUsageChart: FC<AIUsageChartProps> = ({ analytics }) => {
  const { aiUsage } = analytics;
  const themeColors = useThemeColors();

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

  const option = useMemo(() => {
    // Segment colors derived from theme tokens (theme-reactive via useThemeColors).
    const segmentColors: Record<string, string> = {
      claude: themeColors.primary,
      ralph: themeColors.ai,
      opencode: OPENCODE_COLOR,
      user: themeColors.muted,
    };
    return buildDonutOption({
      data: data.map((entry) => ({
        name: entry.name,
        value: entry.value,
        color: segmentColors[entry.name.toLowerCase()] ?? themeColors.muted,
      })),
      colors: themeColors,
      centerText: data.length > 0 ? String(total) : undefined,
      centerSubtext: "TOTAL",
      labelFormatter: "{b}: {d}%",
      tooltipUnit: "comment",
    });
  }, [data, total, themeColors]);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Brain size={18} style={{ color: themeColors.ai }} aria-hidden="true" />
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
