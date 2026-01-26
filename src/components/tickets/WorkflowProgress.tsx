import React from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import type { WorkflowDisplayState } from "../../api/workflow";

export interface WorkflowProgressProps {
  workflowState: WorkflowDisplayState | null;
  loading?: boolean;
  /** Error message if workflow state failed to load */
  error?: string | null;
}

/** Workflow phases in order */
const PHASES = ["started", "implementation", "ai_review", "human_review", "done"] as const;

/** Human-readable labels for each phase */
const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  started: "Started",
  implementation: "Implemented",
  ai_review: "AI Review",
  human_review: "Human Review",
  done: "Done",
};

/**
 * WorkflowProgress - Visual progress indicator for ticket workflow phases.
 *
 * Shows the current position in the workflow with completed, active, and pending states:
 * [✓ Started] → [✓ Implemented] → [◐ AI Review] → [ Human Review] → [ Done]
 */
export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  workflowState,
  loading = false,
  error = null,
}) => {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading workflow...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-[var(--accent-danger)]">
        <AlertCircle size={16} />
        <span className="text-sm">Failed to load workflow: {error}</span>
      </div>
    );
  }

  if (!workflowState) {
    return (
      <div className="text-sm text-[var(--text-tertiary)]">
        Workflow tracking will begin when work starts on this ticket.
      </div>
    );
  }

  const currentPhaseIndex = PHASES.indexOf(workflowState.currentPhase);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        {PHASES.map((phase, index) => {
          const isCompleted = index < currentPhaseIndex;
          const isCurrent = index === currentPhaseIndex;
          const isPending = index > currentPhaseIndex;

          return (
            <React.Fragment key={phase}>
              <PhaseIndicator
                label={PHASE_LABELS[phase]}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isPending={isPending}
              />
              {index < PHASES.length - 1 && (
                <span
                  className={`text-xs ${
                    isCompleted ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Review iteration indicator */}
      {workflowState.reviewIteration > 0 && (
        <div className="text-xs text-[var(--text-secondary)]">
          Review iteration: {workflowState.reviewIteration}
        </div>
      )}
    </div>
  );
};

interface PhaseIndicatorProps {
  label: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isPending: boolean;
}

const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({
  label,
  isCompleted,
  isCurrent,
  isPending,
}) => {
  const getIcon = () => {
    if (isCompleted) {
      return <CheckCircle2 size={14} className="text-[var(--success)]" />;
    }
    if (isCurrent) {
      return (
        <div className="relative">
          <Circle size={14} className="text-[var(--info)]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-[var(--info)] rounded-full" />
          </div>
        </div>
      );
    }
    return <Circle size={14} className="text-[var(--text-tertiary)]" />;
  };

  const getTextClass = () => {
    if (isCompleted) return "text-[var(--success)]";
    if (isCurrent) return "text-[var(--info)] font-medium";
    if (isPending) return "text-[var(--text-tertiary)]";
    return "text-[var(--text-secondary)]";
  };

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
        isCurrent
          ? "bg-[var(--info-muted)] border border-[var(--info)]/30"
          : isCompleted
            ? "bg-[var(--success-muted)] border border-[var(--success)]/30"
            : "bg-[var(--bg-tertiary)] border border-[var(--border-primary)]/30"
      }`}
    >
      {getIcon()}
      <span className={getTextClass()}>{label}</span>
    </div>
  );
};

export default WorkflowProgress;
