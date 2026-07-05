import React from "react";
import { CheckCircle2, Circle, Loader2, MinusCircle, PlayCircle, XCircle } from "lucide-react";
import { useDemoScript } from "../../lib/hooks";
import type { DemoStep as DemoStepSchema } from "../../lib/schema";
import type { DemoStepStatus } from "./DemoStep";

export interface DemoPanelProps {
  ticketId: string;
  /** Kept for existing callers; verification runner completion replaces manual approval. */
  onComplete?: (passed: boolean) => void;
}

const READ_ONLY_STATUS_CONFIG: Record<
  DemoStepStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
    icon: <Circle size={14} />,
  },
  passed: {
    label: "Passed",
    className: "bg-[var(--success-muted)] text-[var(--success)]",
    icon: <CheckCircle2 size={14} />,
  },
  failed: {
    label: "Failed",
    className: "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]",
    icon: <XCircle size={14} />,
  },
  skipped: {
    label: "Skipped",
    className: "bg-[var(--bg-hover)] text-[var(--text-tertiary)]",
    icon: <MinusCircle size={14} />,
  },
};

function ReadOnlyDemoStep({ step }: { step: DemoStepSchema }) {
  const status = (step.status as DemoStepStatus) || "pending";
  const statusConfig = READ_ONLY_STATUS_CONFIG[status];

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)]">Step {step.order}</span>
            <span className="rounded-full bg-[var(--info-muted)] px-2 py-1 text-xs capitalize text-[var(--info)]">
              {step.type}
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{step.description}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.className}`}
        >
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>

      <div className="mt-4 space-y-3 border-t border-[var(--border-primary)] pt-4">
        <div>
          <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Expected Outcome:</p>
          <p className="text-sm text-[var(--text-secondary)]">{step.expectedOutcome}</p>
        </div>
        {step.notes && (
          <div>
            <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Runner Notes:</p>
            <p className="text-sm text-[var(--text-secondary)]">{step.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only demo handoff panel.
 *
 * Manual approval/rejection was retired with the AI verification status. The
 * verification runner executes these steps, records evidence, and owns the
 * ai_verification -> done / in_progress transition.
 */
export const DemoPanel: React.FC<DemoPanelProps> = ({ ticketId }) => {
  const { demoScript, loading, error, refetch } = useDemoScript(ticketId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
        <Loader2 className="animate-spin mr-2" size={20} />
        <span>Loading demo script...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30 rounded-lg p-4 text-[var(--accent-danger)]">
        <p>Failed to load demo script: {error}</p>
        <button
          onClick={() => void refetch()}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!demoScript) {
    return (
      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-6 text-center">
        <p className="text-[var(--text-secondary)]">
          No demo script generated for this ticket yet.
        </p>
        <p className="text-sm text-[var(--text-tertiary)] mt-2">
          A demo script will be available after the AI completes its review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-[var(--info-muted)] border border-[var(--info)]/30 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <PlayCircle className="text-[var(--info)]" size={24} />
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">AI Verification Handoff</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            These steps are waiting for the verification runner. Manual approval has been retired.
          </p>
        </div>
      </div>

      {demoScript.completedAt && (
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">
          Last recorded result: {demoScript.passed ? "passed" : "failed"} on{" "}
          {new Date(demoScript.completedAt).toLocaleString()}.
        </div>
      )}

      {demoScript.feedback && (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Feedback:</p>
          <p className="text-sm text-[var(--text-secondary)]">{demoScript.feedback}</p>
        </div>
      )}

      <div className="space-y-3">
        {demoScript.steps.map((step) => (
          <ReadOnlyDemoStep key={step.order} step={step} />
        ))}
      </div>
    </div>
  );
};

export default DemoPanel;
