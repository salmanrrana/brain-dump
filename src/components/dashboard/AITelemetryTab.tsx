import { type FC, useMemo } from "react";
import { Activity, Loader2, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import {
  useThemeColors,
  formatShortDate,
  tooltipStyle,
  emptyChartStyle,
  subtitleStyle,
} from "./chart-utils";
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
  costError?: Error | null | undefined;
}

const OUTCOME_COLORS: Record<string, string> = {
  success: "#22c55e",
  failure: "#ef4444",
  timeout: "#f59e0b",
  cancelled: "#71717a",
  inProgress: "#0ea5e9",
};

/** Rich palette for tool call bars — each tool gets a unique color. */
const TOOL_PALETTE = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#14b8a6",
  "#ef4444",
  "#eab308",
  "#ec4899",
  "#6366f1",
  "#84cc16",
];

/** Palette for environment bars. */
const ENV_PALETTE = ["#10b981", "#6366f1", "#f97316", "#ec4899", "#0ea5e9"];

/** Tool Call Distribution - horizontal bar chart with multi-color bars */
const ToolCallDistributionChart: FC<{
  data: DashboardTelemetryAnalytics["toolCallDistribution"];
}> = ({ data }) => {
  const colors = useThemeColors();
  const top10 = useMemo(() => data.slice(0, 10), [data]);

  if (top10.length === 0) {
    return <div style={emptyChartStyle}>No tool call data yet</div>;
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#f97316" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Tool Call Distribution</h3>
        <span style={subtitleStyle}>Top {top10.length}</span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={top10.length * 34 + 20}>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
          >
            <defs>
              {TOOL_PALETTE.map((color, i) => (
                <linearGradient key={i} id={`toolBar${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="toolName"
              tick={{ fontSize: 11, fill: colors.text }}
              width={75}
              stroke="transparent"
              tickLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [value, "Calls"]}
              cursor={{ fill: "var(--bg-hover)", radius: 4 }}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
              {top10.map((_entry, index) => (
                <Cell key={index} fill={`url(#toolBar${index % TOOL_PALETTE.length})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Session Outcomes - donut chart with centered statistic */
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
  const successRate = total > 0 ? Math.round((data.success / total) * 100) : 0;

  if (total === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Activity size={18} style={{ color: "#22c55e" }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Session Outcomes</h3>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyChartStyle}>No session data yet</div>
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#22c55e" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Session Outcomes</h3>
        <span style={subtitleStyle}>{total} sessions</span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}`}
              outerRadius={85}
              innerRadius={45}
              dataKey="value"
              stroke="var(--bg-card)"
              strokeWidth={3}
              paddingAngle={2}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            {/* Centered success rate */}
            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 22, fontWeight: 700, fill: "#22c55e" }}
            >
              {successRate}%
            </text>
            <text
              x="50%"
              y="56%"
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontSize: 10,
                fill: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              success
            </text>
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

/** Environment Breakdown - horizontal bar chart with multi-color bars */
const EnvironmentBreakdownChart: FC<{
  data: DashboardTelemetryAnalytics["environmentBreakdown"];
}> = ({ data }) => {
  const colors = useThemeColors();

  if (data.length === 0) {
    return (
      <section style={sectionStyles}>
        <div style={sectionHeaderStyles}>
          <Activity size={18} style={{ color: "#6366f1" }} aria-hidden="true" />
          <h3 style={sectionTitleStyles}>Environments</h3>
        </div>
        <div style={sectionContentStyles}>
          <div style={emptyChartStyle}>No environment data yet</div>
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#6366f1" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Environments</h3>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={Math.max(data.length * 42 + 20, 100)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
          >
            <defs>
              {ENV_PALETTE.map((color, i) => (
                <linearGradient key={i} id={`envBar${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: colors.textSecondary }}
              stroke={colors.border}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="environment"
              tick={{ fontSize: 11, fill: colors.text }}
              width={75}
              stroke="transparent"
              tickLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [value, "Sessions"]}
              cursor={{ fill: "var(--bg-hover)", radius: 4 }}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
              {data.map((_entry, index) => (
                <Cell key={index} fill={`url(#envBar${index % ENV_PALETTE.length})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Sessions Over Time - area chart with gradient fill */
const SessionsOverTimeChart: FC<{
  data: DashboardTelemetryAnalytics["sessionsOverTime"];
}> = ({ data }) => {
  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#14b8a6" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Sessions Over Time</h3>
        <span style={subtitleStyle}>Last 30 days</span>
      </div>
      <div style={sectionContentStyles}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="sessionsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="none"
              stroke="var(--border-primary)"
              opacity={0.12}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              stroke="var(--border-primary)"
              tickFormatter={formatShortDate}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              stroke="var(--border-primary)"
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
              formatter={(value: number) => [value, "Sessions"]}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#14b8a6"
              strokeWidth={2.5}
              fill="url(#sessionsGradient)"
              dot={false}
              activeDot={{
                r: 5,
                strokeWidth: 2,
                stroke: "#14b8a6",
                fill: "var(--bg-card)",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

/** Avg Session Duration Over Time - area chart with gradient fill */
const AvgDurationOverTimeChart: FC<{
  data: DashboardTelemetryAnalytics["avgDurationOverTime"];
}> = ({ data }) => {
  const hasData = data.some((d) => d.avgMinutes > 0);

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#f97316" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Avg Session Duration</h3>
        <span style={subtitleStyle}>Last 30 days</span>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="durationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="none"
                stroke="var(--border-primary)"
                opacity={0.12}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                tickFormatter={formatShortDate}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                stroke="var(--border-primary)"
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                formatter={(value: number) => [`${value} min`, "Avg Duration"]}
              />
              <Area
                type="monotone"
                dataKey="avgMinutes"
                stroke="#f97316"
                strokeWidth={2.5}
                fill="url(#durationGradient)"
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: "#f97316",
                  fill: "var(--bg-card)",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={emptyChartStyle}>No duration data yet</div>
        )}
      </div>
    </section>
  );
};

/**
 * AITelemetryTab - Full AI Telemetry dashboard tab with premium visualizations.
 */
export const AITelemetryTab: FC<AITelemetryTabProps> = ({
  analytics,
  isLoading,
  error,
  costAnalytics,
  costError,
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
      {costError ? (
        <section style={sectionStyles}>
          <div style={sectionHeaderStyles}>
            <AlertCircle size={18} style={{ color: "var(--accent-danger)" }} aria-hidden="true" />
            <h3 style={sectionTitleStyles}>Cost Analytics</h3>
          </div>
          <div style={sectionContentStyles}>
            <div style={emptyChartStyle} role="alert">
              Failed to load cost data: {costError.message}
            </div>
          </div>
        </section>
      ) : costAnalytics ? (
        <>
          <CostTrendChart data={costAnalytics.costTrend} />
          <CostPerTicketChart data={costAnalytics.costPerTicket} />
          <CostByEpicChart data={costAnalytics.costByEpic} />
        </>
      ) : null}
    </div>
  );
};

const gridStyles: React.CSSProperties = {
  // Base styles - responsive handled by CSS class "analytics-grid"
};
