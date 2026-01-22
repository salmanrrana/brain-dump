import { type FC } from "react";
import { GitPullRequest, GitMerge, GitBranch, FileText } from "lucide-react";
import {
  sectionStyles,
  sectionHeaderStyles,
  sectionTitleStyles,
  sectionContentStyles,
} from "./shared-styles";
import type { DashboardAnalytics } from "../../api/analytics";

export interface PRMetricsProps {
  analytics: DashboardAnalytics;
}

/**
 * PRMetrics - Shows PR counts, merge rate, and status breakdown.
 */
export const PRMetrics: FC<PRMetricsProps> = ({ analytics }) => {
  const { prMetrics } = analytics;

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <GitPullRequest size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h3 style={sectionTitleStyles}>Pull Requests</h3>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-tertiary)" }}>
          {prMetrics.total} total
        </span>
      </div>
      <div style={sectionContentStyles}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
          {/* Merge Rate */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
              <GitMerge size={16} style={{ color: "var(--status-done)" }} />
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                Merge Rate
              </span>
            </div>
            <div style={{ marginTop: "var(--spacing-1)" }}>
              <span
                style={{
                  fontSize: "var(--font-size-2xl)",
                  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
                  color: "var(--text-primary)",
                }}
              >
                {prMetrics.mergeRate.toFixed(1)}%
              </span>
            </div>
            {/* Progress bar */}
            <div
              style={{
                marginTop: "var(--spacing-2)",
                height: "6px",
                background: "var(--bg-primary)",
                borderRadius: "var(--radius-full)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${prMetrics.mergeRate}%`,
                  background: "var(--gradient-accent)",
                  borderRadius: "var(--radius-full)",
                  transition: "width var(--transition-fast)",
                }}
              />
            </div>
          </div>

          {/* Status Breakdown */}
          <div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                marginBottom: "var(--spacing-2)",
              }}
            >
              Status Breakdown
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                <GitMerge size={14} style={{ color: "var(--status-done)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  Merged
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "500",
                    color: "var(--text-primary)",
                  }}
                >
                  {prMetrics.merged}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                <GitBranch size={14} style={{ color: "var(--status-in-progress)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  Open
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "500",
                    color: "var(--text-primary)",
                  }}
                >
                  {prMetrics.open}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                <FileText size={14} style={{ color: "var(--text-tertiary)" }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  Draft
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "500",
                    color: "var(--text-primary)",
                  }}
                >
                  {prMetrics.draft}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
