import { type FC, useMemo } from "react";
import { GitCommit } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors } from "./chart-utils";
import { EChart, buildAreaOption } from "./echarts-base";
import type { DashboardAnalytics } from "../../api/analytics";

const COMMITS_COLOR = "#8b5cf6";

export interface CommitsPerDayCardProps {
  analytics: DashboardAnalytics;
}

/**
 * CommitsPerDayCard - Commit activity trend with gradient area fill.
 */
export const CommitsPerDayCard: FC<CommitsPerDayCardProps> = ({ analytics }) => {
  const { commitsPerDay } = analytics;
  const colors = useThemeColors();

  const totalCommits = commitsPerDay.reduce((sum, day) => sum + day.count, 0);
  const avgPerDay =
    commitsPerDay.length > 0 ? (totalCommits / commitsPerDay.length).toFixed(1) : "0";
  const maxCommits = Math.max(...commitsPerDay.map((d) => d.count), 0);

  const option = useMemo(() => {
    // Map each day-of-month label back to its full date for the tooltip.
    const fullDateByDay = new Map(
      commitsPerDay.map((item) => [
        new Date(item.date).getDate().toString(),
        new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      ])
    );
    return buildAreaOption({
      categories: commitsPerDay.map((item) => new Date(item.date).getDate().toString()),
      values: commitsPerDay.map((d) => d.count),
      color: COMMITS_COLOR,
      colors,
      yAxisAllowDecimals: false,
      tooltipTitle: (name) => fullDateByDay.get(name) ?? name,
      tooltipValue: (value) => `${value} commits`,
    });
  }, [commitsPerDay, colors]);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <GitCommit size={18} style={{ color: "#8b5cf6" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Commits per Day</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {totalCommits} total {"\u2022"} {avgPerDay}/day avg
        </span>
      </div>
      <div style={sectionContentStyles}>
        {commitsPerDay.length > 0 && maxCommits > 0 ? (
          <EChart option={option} height={180} ariaLabel="Commits per day" />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 180,
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No commits tracked yet
          </div>
        )}
      </div>
    </section>
  );
};
