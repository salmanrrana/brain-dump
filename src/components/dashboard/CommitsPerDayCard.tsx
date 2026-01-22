import { type FC } from "react";
import { GitCommit } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface CommitsPerDayCardProps {
  analytics: DashboardAnalytics;
}

/**
 * CommitsPerDayCard - Shows commit activity trend over the last 30 days.
 */
export const CommitsPerDayCard: FC<CommitsPerDayCardProps> = ({ analytics }) => {
  const { commitsPerDay } = analytics;

  // Calculate stats
  const totalCommits = commitsPerDay.reduce((sum, day) => sum + day.count, 0);
  const avgPerDay =
    commitsPerDay.length > 0 ? (totalCommits / commitsPerDay.length).toFixed(1) : "0";
  const maxCommits = Math.max(...commitsPerDay.map((d) => d.count), 0);

  // Format dates for display (show day of month)
  const formattedData = commitsPerDay.map((item) => ({
    ...item,
    displayDate: new Date(item.date).getDate().toString(),
  }));

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <GitCommit size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Commits per Day</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {totalCommits} total • {avgPerDay}/day avg
        </span>
      </div>
      <div style={sectionContentStyles}>
        {commitsPerDay.length > 0 && maxCommits > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={formattedData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" opacity={0.2} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                width={30}
              />
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "none",
                  outline: "none",
                  boxShadow: "var(--shadow-lg)",
                  padding: "var(--spacing-2)",
                  borderRadius: "var(--radius-md)",
                }}
                wrapperStyle={{
                  outline: "none",
                  border: "none",
                }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
                formatter={(value: number) => [`${value} commits`, "Commits"]}
                labelFormatter={(label) => {
                  const item = formattedData.find((d) => d.displayDate === label);
                  return item
                    ? new Date(item.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : label;
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--accent-primary)"
                strokeWidth={2}
                dot={{ fill: "var(--accent-primary)", r: 3 }}
                activeDot={{ r: 5, fill: "var(--accent-secondary)" }}
              />
            </LineChart>
          </ResponsiveContainer>
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
