import { type FC } from "react";
import { VelocityChart } from "./VelocityChart";
import { AIUsageChart } from "./AIUsageChart";
import { VelocityMetrics } from "./VelocityMetrics";
import { RalphMetrics } from "./RalphMetrics";
import { PRMetrics } from "./PRMetrics";
import { CycleTimeCard } from "./CycleTimeCard";
import { TopProjectsCard } from "./TopProjectsCard";
import { CommitsPerDayCard } from "./CommitsPerDayCard";
import type { DashboardAnalytics } from "../../api/analytics";

export interface AnalyticsSectionProps {
  analytics: DashboardAnalytics;
  loading?: boolean;
  error?: Error | null;
}

/**
 * AnalyticsSection - Wrapper component arranging all analytics cards in responsive grid.
 *
 * Layout:
 * - Mobile (1 column)
 * - Tablet (2 columns)
 * - Desktop (3 columns)
 */
export const AnalyticsSection: FC<AnalyticsSectionProps> = ({ analytics, loading, error }) => {
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--spacing-8)",
          color: "var(--text-secondary)",
        }}
      >
        Loading analytics...
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
        }}
      >
        Failed to load analytics: {error.message}
      </div>
    );
  }

  return (
    <div style={gridStyles} className="analytics-grid">
      <VelocityChart analytics={analytics} />
      <AIUsageChart analytics={analytics} />
      <VelocityMetrics analytics={analytics} />
      <RalphMetrics analytics={analytics} />
      <PRMetrics analytics={analytics} />
      <CycleTimeCard analytics={analytics} />
      <TopProjectsCard analytics={analytics} />
      <CommitsPerDayCard analytics={analytics} />
    </div>
  );
};

const gridStyles: React.CSSProperties = {
  // Base styles - responsive handled by CSS class
};
