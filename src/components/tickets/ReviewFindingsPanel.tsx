import React from "react";
import { AlertTriangle, AlertCircle, Info, Lightbulb, CheckCircle2, Loader2 } from "lucide-react";
import type { WorkflowDisplayState } from "../../api/workflow";

export interface ReviewFindingsPanelProps {
  workflowState: WorkflowDisplayState | null;
  loading?: boolean;
}

/**
 * ReviewFindingsPanel - Displays review findings summary by severity.
 *
 * Shows a breakdown of findings from code review agents:
 * Review Findings
 * ├── P0 (Critical): 0
 * ├── P1 (Major): 1
 * ├── P2 (Minor): 3
 * ├── Suggestions: 2
 * └── Fixed: 2/6
 */
export const ReviewFindingsPanel: React.FC<ReviewFindingsPanelProps> = ({
  workflowState,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading findings...</span>
      </div>
    );
  }

  if (!workflowState) {
    return null;
  }

  const { findingsSummary } = workflowState;
  const hasFindings = findingsSummary.total > 0;

  if (!hasFindings) {
    return (
      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Review Findings</h4>
        <p className="text-xs text-[var(--text-tertiary)]">No review findings yet</p>
      </div>
    );
  }

  const unfixedCount = findingsSummary.total - findingsSummary.fixed;
  const allFixed = unfixedCount === 0;
  const hasCritical = findingsSummary.critical > 0;

  return (
    <div
      className={`border rounded-lg p-4 ${
        hasCritical && !allFixed
          ? "bg-[var(--accent-danger)]/10 border-[var(--accent-danger)]/30"
          : allFixed
            ? "bg-[var(--success-muted)] border-[var(--success)]/30"
            : "bg-[var(--warning-muted)] border-[var(--warning)]/30"
      }`}
    >
      <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">Review Findings</h4>

      <div className="space-y-2">
        {/* Critical (P0) */}
        {findingsSummary.critical > 0 && (
          <FindingRow
            icon={<AlertTriangle size={14} className="text-[var(--accent-danger)]" />}
            label="P0 (Critical)"
            count={findingsSummary.critical}
            variant="critical"
          />
        )}

        {/* Major (P1) */}
        {findingsSummary.major > 0 && (
          <FindingRow
            icon={<AlertCircle size={14} className="text-[var(--warning)]" />}
            label="P1 (Major)"
            count={findingsSummary.major}
            variant="major"
          />
        )}

        {/* Minor (P2) */}
        {findingsSummary.minor > 0 && (
          <FindingRow
            icon={<Info size={14} className="text-[var(--info)]" />}
            label="P2 (Minor)"
            count={findingsSummary.minor}
            variant="minor"
          />
        )}

        {/* Suggestions */}
        {findingsSummary.suggestion > 0 && (
          <FindingRow
            icon={<Lightbulb size={14} className="text-[var(--text-tertiary)]" />}
            label="Suggestions"
            count={findingsSummary.suggestion}
            variant="suggestion"
          />
        )}

        {/* Divider */}
        <div className="border-t border-[var(--border-primary)] my-2" />

        {/* Fixed count */}
        <div className="flex items-center gap-2">
          <CheckCircle2
            size={14}
            className={allFixed ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}
          />
          <span className="text-xs text-[var(--text-secondary)]">Fixed:</span>
          <span
            className={`text-xs font-medium ${
              allFixed ? "text-[var(--success)]" : "text-[var(--text-primary)]"
            }`}
          >
            {findingsSummary.fixed}/{findingsSummary.total}
          </span>
          {allFixed && <span className="text-xs text-[var(--success)] ml-1">All resolved</span>}
        </div>
      </div>
    </div>
  );
};

interface FindingRowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  variant: "critical" | "major" | "minor" | "suggestion";
}

const FindingRow: React.FC<FindingRowProps> = ({ icon, label, count }) => {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-[var(--text-secondary)]">{label}:</span>
      <span className="text-xs font-medium text-[var(--text-primary)]">{count}</span>
    </div>
  );
};

export default ReviewFindingsPanel;
