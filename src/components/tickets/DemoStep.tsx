import React from "react";
import { ChevronDown, ChevronUp, Check, X, Minus } from "lucide-react";
import type { DemoStep as DemoStepSchema } from "../../lib/schema";

// Re-export for convenience
export type { DemoStep as DemoStepType } from "../../lib/schema";

export type DemoStepStatus = "pending" | "passed" | "failed" | "skipped";

export interface DemoStepProps {
  step: DemoStepSchema;
  status: DemoStepStatus;
  notes?: string;
  onStatusChange: (status: DemoStepStatus) => void;
  onNotesChange: (notes: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const STATUS_CONFIG: Record<DemoStepStatus, { bgClass: string; textClass: string }> = {
  pending: {
    bgClass: "bg-[var(--bg-tertiary)]",
    textClass: "text-[var(--text-secondary)]",
  },
  passed: {
    bgClass: "bg-[var(--success-muted)]",
    textClass: "text-[var(--success)]",
  },
  failed: {
    bgClass: "bg-[var(--accent-danger)]/10",
    textClass: "text-[var(--accent-danger)]",
  },
  skipped: {
    bgClass: "bg-[var(--bg-hover)]",
    textClass: "text-[var(--text-tertiary)]",
  },
};

const TYPE_CONFIG: Record<DemoStepSchema["type"], { label: string; badgeClass: string }> = {
  manual: {
    label: "Manual",
    badgeClass: "bg-[var(--info-muted)] text-[var(--info)]",
  },
  visual: {
    label: "Visual",
    badgeClass: "bg-[var(--accent-ai)]/20 text-[var(--accent-ai)]",
  },
  automated: {
    label: "Automated",
    badgeClass: "bg-[var(--success-muted)] text-[var(--success)]",
  },
};

/**
 * DemoStep - A single step in the demo verification process.
 *
 * Displays:
 * - Step number and type badge
 * - Description of what to do
 * - Pass/fail/skip buttons
 * - Expandable section with expected outcome and notes
 */
export const DemoStep: React.FC<DemoStepProps> = ({
  step,
  status,
  notes = "",
  onStatusChange,
  onNotesChange,
  isExpanded = false,
  onToggleExpand,
}) => {
  const statusConfig = STATUS_CONFIG[status];
  const typeConfig = TYPE_CONFIG[step.type];

  return (
    <div
      className={`border border-[var(--border-primary)] rounded-lg p-4 transition-colors ${statusConfig.bgClass}`}
    >
      {/* Step Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-semibold text-[var(--text-primary)]">Step {step.order}</span>
            <span className={`text-xs px-2 py-1 rounded-full ${typeConfig.badgeClass}`}>
              {typeConfig.label}
            </span>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">{step.description}</p>
        </div>

        {/* Status Buttons */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onStatusChange("passed")}
            className={`p-2 rounded transition-colors ${
              status === "passed"
                ? "bg-[var(--success)] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--success-muted)] hover:text-[var(--success)]"
            }`}
            title="Mark as passed"
            aria-label="Mark step as passed"
            aria-pressed={status === "passed"}
          >
            <Check size={18} />
          </button>
          <button
            type="button"
            onClick={() => onStatusChange("failed")}
            className={`p-2 rounded transition-colors ${
              status === "failed"
                ? "bg-[var(--accent-danger)] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--accent-danger)]/20 hover:text-[var(--accent-danger)]"
            }`}
            title="Mark as failed"
            aria-label="Mark step as failed"
            aria-pressed={status === "failed"}
          >
            <X size={18} />
          </button>
          <button
            type="button"
            onClick={() => onStatusChange("skipped")}
            className={`p-2 rounded transition-colors ${
              status === "skipped"
                ? "bg-[var(--text-tertiary)] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
            }`}
            title="Mark as skipped"
            aria-label="Mark step as skipped"
            aria-pressed={status === "skipped"}
          >
            <Minus size={18} />
          </button>
        </div>

        {/* Expand/Collapse Toggle */}
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse step details" : "Expand step details"}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="mt-4 space-y-3 border-t border-[var(--border-primary)] pt-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Expected Outcome:</p>
            <p className="text-sm text-[var(--text-secondary)]">{step.expectedOutcome}</p>
          </div>

          <div>
            <label
              htmlFor={`step-notes-${step.order}`}
              className="block text-sm font-medium text-[var(--text-primary)] mb-1"
            >
              Notes (optional):
            </label>
            <textarea
              id={`step-notes-${step.order}`}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add notes about this step..."
              className="w-full px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] resize-y"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
};
