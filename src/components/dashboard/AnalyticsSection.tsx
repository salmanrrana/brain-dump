import { type FC, lazy, Suspense } from "react";
import { PRMetrics } from "./PRMetrics";
import { TopProjectsCard } from "./TopProjectsCard";
import type { DashboardAnalytics } from "../../api/analytics";

// Lazy-load recharts-heavy chart components so the initial dashboard bundle
// does not include the full recharts library (~200 KB parsed).
const VelocityChart = lazy(() =>
  import("./VelocityChart").then((m) => ({ default: m.VelocityChart }))
);
const AIUsageChart = lazy(() =>
  import("./AIUsageChart").then((m) => ({ default: m.AIUsageChart }))
);
const VelocityMetrics = lazy(() =>
  import("./VelocityMetrics").then((m) => ({ default: m.VelocityMetrics }))
);
const RalphMetrics = lazy(() =>
  import("./RalphMetrics").then((m) => ({ default: m.RalphMetrics }))
);
const CycleTimeCard = lazy(() =>
  import("./CycleTimeCard").then((m) => ({ default: m.CycleTimeCard }))
);
const CommitsPerDayCard = lazy(() =>
  import("./CommitsPerDayCard").then((m) => ({ default: m.CommitsPerDayCard }))
);

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
      <Suspense fallback={<ChartCardSkeleton />}>
        <VelocityChart analytics={analytics} />
      </Suspense>
      <Suspense fallback={<ChartCardSkeleton />}>
        <AIUsageChart analytics={analytics} />
      </Suspense>
      <Suspense fallback={<ChartCardSkeleton />}>
        <VelocityMetrics analytics={analytics} />
      </Suspense>
      <Suspense fallback={<ChartCardSkeleton />}>
        <RalphMetrics analytics={analytics} />
      </Suspense>
      <PRMetrics analytics={analytics} />
      <Suspense fallback={<ChartCardSkeleton />}>
        <CycleTimeCard analytics={analytics} />
      </Suspense>
      <TopProjectsCard analytics={analytics} />
      <Suspense fallback={<ChartCardSkeleton />}>
        <CommitsPerDayCard analytics={analytics} />
      </Suspense>
    </div>
  );
};

/** Lightweight skeleton matching the card layout used by chart components. */
function ChartCardSkeleton() {
  return (
    <div style={skeletonCard}>
      <div style={skeletonHeader}>
        <div
          style={{
            ...skeletonPulse,
            width: "20px",
            height: "20px",
            borderRadius: "var(--radius-sm)",
          }}
        />
        <div style={{ ...skeletonPulse, width: "120px", height: "16px" }} />
      </div>
      <div style={skeletonBody}>
        <div style={{ ...skeletonPulse, width: "100%", height: "140px" }} />
      </div>
    </div>
  );
}

const skeletonCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
  overflow: "hidden",
};

const skeletonHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  borderBottom: "1px solid var(--border-primary)",
};

const skeletonBody: React.CSSProperties = {
  padding: "var(--spacing-3)",
};

const skeletonPulse: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease-in-out infinite",
};

const gridStyles: React.CSSProperties = {
  // Base styles - responsive handled by CSS class
};
