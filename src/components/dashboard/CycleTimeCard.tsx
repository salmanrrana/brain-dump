import { type FC, useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface CycleTimeCardProps {
  analytics: DashboardAnalytics;
}

/**
 * CycleTimeCard - Shows average, median, and P95 cycle times.
 */
export const CycleTimeCard: FC<CycleTimeCardProps> = ({ analytics }) => {
  const { cycleTime } = analytics;

  // Get computed colors for gradient
  const [colors, setColors] = useState({ start: "#f97316", end: "#ea580c" });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateColors = () => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const start = style.getPropertyValue("--accent-primary").trim() || "#f97316";
      const end = style.getPropertyValue("--accent-secondary").trim() || "#ea580c";
      setColors({ start, end });
    };
    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const formatHours = (hours: number): string => {
    if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours < 1) {
      return `${days}d`;
    }
    return `${days}d ${remainingHours.toFixed(0)}h`;
  };

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Clock size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Cycle Time</h3>
      </div>
      <div style={sectionContentStyles}>
        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--spacing-2)",
            marginBottom: "var(--spacing-3)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Avg
            </div>
            <div
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {formatHours(cycleTime.avg)}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Median
            </div>
            <div
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {formatHours(cycleTime.median)}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-1)",
              }}
            >
              P95
            </div>
            <div
              style={{
                fontSize: "var(--font-size-base)",
                fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                color: "var(--text-primary)",
              }}
            >
              {formatHours(cycleTime.p95)}
            </div>
          </div>
        </div>

        {/* Distribution chart */}
        {cycleTime.distribution.length > 0 ? (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={cycleTime.distribution}>
              <defs>
                <linearGradient id="cycleTimeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.start} />
                  <stop offset="100%" stopColor={colors.end} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="range"
                tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--text-tertiary)" }}
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
              />
              <Bar
                dataKey="count"
                fill="url(#cycleTimeGradient)"
                radius={[4, 4, 0, 0]}
                background={false}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 120,
              color: "var(--text-tertiary)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            No cycle time data yet
          </div>
        )}
      </div>
    </section>
  );
};
