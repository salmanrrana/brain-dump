import { type FC, useMemo } from "react";
import { Activity, Loader2, AlertCircle } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import { useThemeColors, formatShortDate, emptyChartStyle, subtitleStyle } from "./chart-utils";
import { EChart, buildHBarOption, buildDonutOption, buildAreaOption } from "./echarts-base";
import type { DashboardTelemetryAnalytics } from "../../api/telemetry";
import { useCostAnalytics, useDashboardTelemetryAnalytics } from "../../lib/hooks";
import { CostTrendChart } from "./CostTrendChart";
import { CostPerTicketChart } from "./CostPerTicketChart";
import { CostByEpicChart } from "./CostByEpicChart";

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

  const option = useMemo(
    () =>
      buildHBarOption({
        categories: top10.map((d) => d.toolName),
        values: top10.map((d) => d.count),
        palette: TOOL_PALETTE,
        colors,
        barWidth: 20,
        tooltipValue: (value) => `${value} calls`,
      }),
    [top10, colors]
  );

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
        <EChart
          option={option}
          height={top10.length * 34 + 20}
          ariaLabel="Tool call distribution"
        />
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

  const colors = useThemeColors();
  const option = useMemo(
    () =>
      buildDonutOption({
        data: pieData.map((e) => ({ name: e.name, value: e.value, color: e.color ?? "#71717a" })),
        colors,
        centerText: `${successRate}%`,
        centerSubtext: "SUCCESS",
        centerColor: OUTCOME_COLORS.success,
        labelFormatter: "{b}: {c}",
        tooltipUnit: "session",
      }),
    [pieData, successRate, colors]
  );

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
        <EChart option={option} height={280} ariaLabel="Session outcomes breakdown" />
      </div>
    </section>
  );
};

/** Environment Breakdown - horizontal bar chart with multi-color bars */
const EnvironmentBreakdownChart: FC<{
  data: DashboardTelemetryAnalytics["environmentBreakdown"];
}> = ({ data }) => {
  const colors = useThemeColors();

  const option = useMemo(
    () =>
      buildHBarOption({
        categories: data.map((d) => d.environment),
        values: data.map((d) => d.count),
        palette: ENV_PALETTE,
        colors,
        barWidth: 24,
        tooltipValue: (value) => `${value} sessions`,
      }),
    [data, colors]
  );

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
        <EChart
          option={option}
          height={Math.max(data.length * 42 + 20, 100)}
          ariaLabel="Sessions by environment"
        />
      </div>
    </section>
  );
};

/** Sessions Over Time - area chart with gradient fill */
const SessionsOverTimeChart: FC<{
  data: DashboardTelemetryAnalytics["sessionsOverTime"];
}> = ({ data }) => {
  const colors = useThemeColors();
  const option = useMemo(
    () =>
      buildAreaOption({
        categories: data.map((d) => d.date),
        values: data.map((d) => d.count),
        color: "#14b8a6",
        colors,
        yAxisAllowDecimals: false,
        xAxisLabelFormatter: formatShortDate,
        tooltipTitle: (name) => new Date(name).toLocaleDateString(),
        tooltipValue: (value) => `${value} sessions`,
      }),
    [data, colors]
  );

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#14b8a6" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Sessions Over Time</h3>
        <span style={subtitleStyle}>Last 30 days</span>
      </div>
      <div style={sectionContentStyles}>
        <EChart option={option} height={200} ariaLabel="Sessions over time" />
      </div>
    </section>
  );
};

/** Avg Session Duration Over Time - area chart with gradient fill */
const AvgDurationOverTimeChart: FC<{
  data: DashboardTelemetryAnalytics["avgDurationOverTime"];
}> = ({ data }) => {
  const hasData = data.some((d) => d.avgMinutes > 0);
  const colors = useThemeColors();
  const option = useMemo(
    () =>
      buildAreaOption({
        categories: data.map((d) => d.date),
        values: data.map((d) => d.avgMinutes),
        color: "#f97316",
        colors,
        xAxisLabelFormatter: formatShortDate,
        tooltipTitle: (name) => new Date(name).toLocaleDateString(),
        tooltipValue: (value) => `${value} min`,
      }),
    [data, colors]
  );

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Activity size={18} style={{ color: "#f97316" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Avg Session Duration</h3>
        <span style={subtitleStyle}>Last 30 days</span>
      </div>
      <div style={sectionContentStyles}>
        {hasData ? (
          <EChart option={option} height={200} ariaLabel="Average session duration over time" />
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
export const AITelemetryTab: FC = () => {
  const { data: analytics, isLoading, error } = useDashboardTelemetryAnalytics();
  const { data: costAnalytics, error: costError } = useCostAnalytics();

  if (isLoading || !analytics) {
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
