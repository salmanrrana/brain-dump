import { type FC, useMemo, useEffect, useState } from "react";
import { Activity, Loader2, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardTelemetryAnalytics } from "../../api/telemetry";
import type { DashboardCostAnalytics } from "../../api/cost";
import { CostTrendChart } from "./CostTrendChart";
import { CostPerTicketChart } from "./CostPerTicketChart";
import { CostByEpicChart } from "./CostByEpicChart";

interface AITelemetryTabProps {
  analytics: DashboardTelemetryAnalytics;
  isLoading: boolean;
  error: Error | null;
  costAnalytics?: DashboardCostAnalytics | null | undefined;
}

// Resolve CSS variable values to actual colors for Recharts
function getComputedColors() {
  if (typeof window === "undefined") {
    return {
      primary: "#f97316",
      ai: "#14b8a6",
      secondary: "#ea580c",
      success: "#22c55e",
      error: "#ef4444",
      warning: "#f59e0b",
      muted: "#71717a",
      border: "#374151",
      bg: "#1e293b",
      text: "#e2e8f0",
      textSecondary: "#94a3b8",
    };
  }
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    primary: style.getPropertyValue("--accent-primary").trim() || "#f97316",
    ai: style.getPropertyValue("--accent-ai").trim() || "#14b8a6",
    secondary: style.getPropertyValue("--accent-secondary").trim() || "#ea580c",
    success: style.getPropertyValue("--success").trim() || "#22c55e",
    error: style.getPropertyValue("--error").trim() || "#ef4444",
    warning: style.getPropertyValue("--warning").trim() || "#f59e0b",
    muted: style.getPropertyValue("--text-tertiary").trim() || "#71717a",
    border: style.getPropertyValue("--border-primary").trim() || "#374151",
    bg: style.getPropertyValue("--bg-secondary").trim() || "#1e293b",
    text: style.getPropertyValue("--text-primary").trim() || "#e2e8f0",
    textSecondary: style.getPropertyValue("--text-secondary").trim() || "#94a3b8",
  };
}

const OUTCOME_COLORS: Record<string, string> = {
  success: "#22c55e",
  failure: "#ef4444",
  timeout: "#f59e0b",
  cancelled: "#71717a",
  inProgress: "#3b82f6",
};

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-secondary)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "var(--spacing-2)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  boxShadow: "var(--shadow-lg)",
};

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** Tool Call Distribution - horizontal bar chart */
const ToolCallDistributionChart: FC<{
  data: DashboardTelemetryAnalytics["toolCallDistribution"];
}> = ({ data }) => {
  const [colors, setColors] = useState(getComputedColors());

  useEffect(() => {
    const update = () => setColors(getComputedColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const top10 = useMemo(() => data.slice(0, 10), [data]);

  if (top10.length === 0) {
    return <EmptyState message="No tool call data yet" />;
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: colors.primary }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Tool Call Distribution</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          Top {top10.length}
        </span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={top10.length * 32 + 20}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
            />
            <YAxis
              type="category"
              dataKey="toolName"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              width={75}
              stroke={colors.border}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value, "Calls"]} />
            <Bar dataKey="count" fill={colors.primary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Session Outcomes - donut chart */
const SessionOutcomesChart: FC<{
  data: DashboardTelemetryAnalytics["sessionOutcomes"];
}> = ({ data }) => {
  const pieData = useMemo(() => {
    const entries = [
      { name: "Success", value: data.success, color: OUTCOME_COLORS.success },
      { name: "Failure", value: data.failure, color: OUTCOME_COLORS.failure },
      { name: "Timeout", value: data.timeout, color: OUTCOME_COLORS.timeout },
      { name: "Cancelled", value: data.cancelled, color: OUTCOME_COLORS.cancelled },
      { name: "In Progress", value: data.inProgress, color: OUTCOME_COLORS.inProgress },
    ];
    return entries.filter((e) => e.value > 0);
  }, [data]);

  const total = data.success + data.failure + data.timeout + data.cancelled + data.inProgress;

  if (total === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Activity size={18} style={{ color: "var(--success)" }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Session Outcomes</h3>
        </div>
        <div style={sectionContentStyles}>
          <EmptyState message="No session data yet" />
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "var(--success)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Session Outcomes</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {total} sessions
        </span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}`}
              outerRadius={75}
              innerRadius={35}
              dataKey="value"
              stroke="var(--bg-secondary)"
              strokeWidth={2}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const item = payload[0];
                if (!item) return null;
                return (
                  <div style={tooltipStyle}>
                    <div style={{ fontWeight: "500" }}>{item.name}</div>
                    <div style={{ color: "var(--text-secondary)" }}>
                      {item.value} session{(item.value as number) !== 1 ? "s" : ""} (
                      {(((item.value as number) / total) * 100).toFixed(0)}%)
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Environment Breakdown - bar chart */
const EnvironmentBreakdownChart: FC<{
  data: DashboardTelemetryAnalytics["environmentBreakdown"];
}> = ({ data }) => {
  const [colors, setColors] = useState(getComputedColors());

  useEffect(() => {
    const update = () => setColors(getComputedColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Activity size={18} style={{ color: colors.ai }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Environments</h3>
        </div>
        <div style={sectionContentStyles}>
          <EmptyState message="No environment data yet" />
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: colors.ai }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Environments</h3>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={data.length * 35 + 20}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
            />
            <YAxis
              type="category"
              dataKey="environment"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              width={75}
              stroke={colors.border}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [value, "Sessions"]}
            />
            <Bar dataKey="count" fill={colors.ai} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Sessions Over Time - line chart (last 30 days) */
const SessionsOverTimeChart: FC<{
  data: DashboardTelemetryAnalytics["sessionsOverTime"];
}> = ({ data }) => {
  const [colors, setColors] = useState(getComputedColors());

  useEffect(() => {
    const update = () => setColors(getComputedColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: colors.primary }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Sessions Over Time</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          Last 30 days
        </span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              tickFormatter={formatShortDate}
            />
            <YAxis
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
              formatter={(value: number) => [value, "Sessions"]}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={colors.primary}
              strokeWidth={2}
              dot={{ fill: colors.primary, r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Avg Session Duration Over Time - line chart */
const AvgDurationOverTimeChart: FC<{
  data: DashboardTelemetryAnalytics["avgDurationOverTime"];
}> = ({ data }) => {
  const [colors, setColors] = useState(getComputedColors());

  useEffect(() => {
    const update = () => setColors(getComputedColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const hasData = data.some((d) => d.avgMinutes > 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: colors.ai }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Avg Session Duration</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          Last 30 days
        </span>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: colors.textSecondary }}
                stroke={colors.border}
                tickFormatter={formatShortDate}
              />
              <YAxis tick={{ fontSize: 10, fill: colors.textSecondary }} stroke={colors.border} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                formatter={(value: number) => [`${value} min`, "Avg Duration"]}
              />
              <Line
                type="monotone"
                dataKey="avgMinutes"
                stroke={colors.ai}
                strokeWidth={2}
                dot={{ fill: colors.ai, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No duration data yet" />
        )}
      </div>
    </section>
  );
};

function EmptyState({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}

/**
 * AITelemetryTab - Full AI Telemetry dashboard tab with interactive charts.
 *
 * Charts:
 * 1. Tool Call Distribution (horizontal bar)
 * 2. Session Outcomes (donut)
 * 3. Environment Breakdown (horizontal bar)
 * 4. Sessions Over Time (line, 30 days)
 * 5. Avg Session Duration (line, 30 days)
 * 6. Cost Trend (line, 30 days)
 * 7. Cost per Ticket (bar)
 * 8. Cost by Epic (horizontal bar)
 */
export const AITelemetryTab: FC<AITelemetryTabProps> = ({
  analytics,
  isLoading,
  error,
  costAnalytics,
}) => {
  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--spacing-8)",
          color: "var(--text-secondary)",
          gap: "var(--spacing-2)",
        }}
        role="status"
        aria-live="polite"
      >
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Loading telemetry analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--spacing-8)",
          color: "var(--accent-danger)",
          gap: "var(--spacing-2)",
        }}
        role="alert"
      >
        <AlertCircle size={18} aria-hidden="true" />
        Failed to load telemetry: {error.message}
      </div>
    );
  }

  return (
    <div style={gridStyles} className="analytics-grid">
      <ToolCallDistributionChart data={analytics.toolCallDistribution} />
      <SessionOutcomesChart data={analytics.sessionOutcomes} />
      <EnvironmentBreakdownChart data={analytics.environmentBreakdown} />
      <SessionsOverTimeChart data={analytics.sessionsOverTime} />
      <AvgDurationOverTimeChart data={analytics.avgDurationOverTime} />
      {costAnalytics && <CostTrendChart data={costAnalytics.costTrend} />}
      {costAnalytics && <CostPerTicketChart data={costAnalytics.costPerTicket} />}
      {costAnalytics && <CostByEpicChart data={costAnalytics.costByEpic} />}
    </div>
  );
};

const gridStyles: React.CSSProperties = {
  // Base styles - responsive handled by CSS class "analytics-grid"
};
