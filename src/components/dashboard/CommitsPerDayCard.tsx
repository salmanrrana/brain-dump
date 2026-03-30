import { type FC } from "react";
import { GitCommit } from "lucide-react";
import {
  AreaChart,
  Area,
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
 * CommitsPerDayCard - Commit activity trend with gradient area fill.
 */
export const CommitsPerDayCard: FC<CommitsPerDayCardProps> = ({ analytics }) => {
  const { commitsPerDay } = analytics;

  const totalCommits = commitsPerDay.reduce((sum, day) => sum + day.count, 0);
  const avgPerDay =
    commitsPerDay.length > 0 ? (totalCommits / commitsPerDay.length).toFixed(1) : "0";
  const maxCommits = Math.max(...commitsPerDay.map((d) => d.count), 0);

  const formattedData = commitsPerDay.map((item) => ({
    ...item,
    displayDate: new Date(item.date).getDate().toString(),
  }));

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
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={formattedData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="commitsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="none"
                stroke="var(--border-primary)"
                opacity={0.12}
                vertical={false}
              />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                interval="preserveStartEnd"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                width={30}
                axisLine={false}
                tickLine={false}
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
                wrapperStyle={{ outline: "none", border: "none" }}
                labelStyle={{ color: "var(--text-primary)" }}
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
              <Area
                type="monotone"
                dataKey="count"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                fill="url(#commitsGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: "#8b5cf6",
                  fill: "var(--bg-card)",
                }}
              />
            </AreaChart>
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
