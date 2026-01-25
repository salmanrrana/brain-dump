import React, { useState, useMemo, useCallback } from "react";
import { PlayCircle, ThumbsUp, ThumbsDown, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { DemoStep, type DemoStepStatus } from "./DemoStep";
import { useDemoScript, useUpdateDemoStep, useSubmitDemoFeedback } from "../../lib/hooks";
import { useToast } from "../Toast";

export interface DemoPanelProps {
  ticketId: string;
  /** Called when demo is completed (approved or rejected) */
  onComplete?: (passed: boolean) => void;
}

/**
 * DemoPanel - Human Review UI for approving or rejecting a demo.
 *
 * Displays:
 * - List of demo steps to verify
 * - Progress indicator
 * - Overall feedback textarea
 * - Approve & Complete / Request Changes buttons
 *
 * The panel automatically fetches the demo script for the ticket
 * and persists step status changes via mutations.
 */
export const DemoPanel: React.FC<DemoPanelProps> = ({ ticketId, onComplete }) => {
  const { showToast } = useToast();

  // Fetch demo script
  const { demoScript, loading, error, refetch } = useDemoScript(ticketId);

  // Mutations for updating steps and submitting feedback
  const updateStepMutation = useUpdateDemoStep();
  const submitFeedbackMutation = useSubmitDemoFeedback();

  // Local state for step statuses and notes (optimistic UI)
  const [localStepStatuses, setLocalStepStatuses] = useState<Record<number, DemoStepStatus>>({});
  const [localStepNotes, setLocalStepNotes] = useState<Record<number, string>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Merge server state with local state for optimistic updates
  const stepStatuses = useMemo(() => {
    if (!demoScript?.steps) return {};
    const serverStatuses: Record<number, DemoStepStatus> = {};
    for (const step of demoScript.steps) {
      serverStatuses[step.order] = (step.status as DemoStepStatus) || "pending";
    }
    return { ...serverStatuses, ...localStepStatuses };
  }, [demoScript?.steps, localStepStatuses]);

  const stepNotes = useMemo(() => {
    if (!demoScript?.steps) return {};
    const serverNotes: Record<number, string> = {};
    for (const step of demoScript.steps) {
      serverNotes[step.order] = step.notes || "";
    }
    return { ...serverNotes, ...localStepNotes };
  }, [demoScript?.steps, localStepNotes]);

  // Calculate progress
  const totalSteps = demoScript?.steps.length ?? 0;
  const markedCount = Object.values(stepStatuses).filter((s) => s !== "pending").length;
  const allStepsMarked = totalSteps > 0 && markedCount === totalSteps;
  const hasFailedSteps = Object.values(stepStatuses).some((s) => s === "failed");

  // Handle step status change
  const handleStatusChange = useCallback(
    (stepOrder: number, newStatus: DemoStepStatus) => {
      if (!demoScript) return;

      // Optimistic update
      setLocalStepStatuses((prev) => ({ ...prev, [stepOrder]: newStatus }));

      // Persist to server
      const currentNotes = stepNotes[stepOrder];
      updateStepMutation.mutate(
        {
          demoScriptId: demoScript.id,
          stepOrder,
          status: newStatus,
          ...(currentNotes ? { notes: currentNotes } : {}),
        },
        {
          onError: (err) => {
            // Revert optimistic update on error
            setLocalStepStatuses((prev) => {
              const { [stepOrder]: _, ...rest } = prev;
              return rest;
            });
            showToast("error", `Failed to update step: ${err.message}`);
          },
        }
      );
    },
    [demoScript, stepNotes, updateStepMutation, showToast]
  );

  // Handle step notes change
  const handleNotesChange = useCallback((stepOrder: number, notes: string) => {
    setLocalStepNotes((prev) => ({ ...prev, [stepOrder]: notes }));
  }, []);

  // Save notes when user finishes editing (blur)
  const handleNotesSave = useCallback(
    (stepOrder: number) => {
      if (!demoScript) return;

      const notes = localStepNotes[stepOrder];
      if (notes === undefined) return;

      const input = {
        demoScriptId: demoScript.id,
        stepOrder,
        status: (stepStatuses[stepOrder] || "pending") as
          | "pending"
          | "passed"
          | "failed"
          | "skipped",
      };
      updateStepMutation.mutate(notes ? { ...input, notes } : input, {
        onError: (err) => {
          showToast("error", `Failed to save notes: ${err.message}`);
        },
      });
    },
    [demoScript, localStepNotes, stepStatuses, updateStepMutation, showToast]
  );

  // Handle toggle expand - separates side effect from state update
  const handleToggleExpand = useCallback(
    (stepOrder: number) => {
      // Save notes when collapsing (before state update)
      if (expandedStep === stepOrder) {
        handleNotesSave(stepOrder);
      }
      setExpandedStep((prev) => (prev === stepOrder ? null : stepOrder));
    },
    [expandedStep, handleNotesSave]
  );

  // Get step results for submission
  const getStepResults = useCallback(() => {
    if (!demoScript) return [];
    return demoScript.steps.map((step) => ({
      order: step.order,
      status: stepStatuses[step.order] || "pending",
      ...(stepNotes[step.order] ? { notes: stepNotes[step.order] } : {}),
    }));
  }, [demoScript, stepStatuses, stepNotes]);

  // Handle approve
  const handleApprove = useCallback(() => {
    if (!allStepsMarked) {
      showToast("error", "Please verify all steps before approving");
      return;
    }

    submitFeedbackMutation.mutate(
      {
        ticketId,
        passed: true,
        feedback: overallFeedback || "Approved - all steps verified.",
        stepResults: getStepResults(),
      },
      {
        onSuccess: () => {
          showToast("success", "Demo approved! Ticket marked as done.");
          onComplete?.(true);
          void refetch();
        },
        onError: (err) => {
          showToast("error", `Failed to approve demo: ${err.message}`);
        },
      }
    );
  }, [
    allStepsMarked,
    ticketId,
    overallFeedback,
    getStepResults,
    submitFeedbackMutation,
    showToast,
    onComplete,
    refetch,
  ]);

  // Handle reject
  const handleReject = useCallback(() => {
    if (!hasFailedSteps && !overallFeedback.trim()) {
      showToast("error", "Please mark at least one step as failed or provide feedback");
      return;
    }

    submitFeedbackMutation.mutate(
      {
        ticketId,
        passed: false,
        feedback: overallFeedback || "Changes requested - see failed steps.",
        stepResults: getStepResults(),
      },
      {
        onSuccess: () => {
          showToast("info", "Changes requested. Ticket remains in human review.");
          onComplete?.(false);
          void refetch();
        },
        onError: (err) => {
          showToast("error", `Failed to submit feedback: ${err.message}`);
        },
      }
    );
  }, [
    hasFailedSteps,
    overallFeedback,
    ticketId,
    getStepResults,
    submitFeedbackMutation,
    showToast,
    onComplete,
    refetch,
  ]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--text-secondary)]">
        <Loader2 className="animate-spin mr-2" size={20} />
        <span>Loading demo script...</span>
      </div>
    );
  }

  // Error state
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

  // No demo script
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

  // Already completed
  if (demoScript.completedAt) {
    return (
      <div
        className={`border rounded-lg p-6 ${
          demoScript.passed
            ? "bg-[var(--success-muted)] border-[var(--success)]/30"
            : "bg-[var(--accent-danger)]/10 border-[var(--accent-danger)]/30"
        }`}
      >
        <div className="flex items-center gap-3 mb-4">
          {demoScript.passed ? (
            <CheckCircle2 className="text-[var(--success)]" size={24} />
          ) : (
            <XCircle className="text-[var(--accent-danger)]" size={24} />
          )}
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              Demo {demoScript.passed ? "Approved" : "Rejected"}
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Completed on {new Date(demoScript.completedAt).toLocaleString()}
            </p>
          </div>
        </div>
        {demoScript.feedback && (
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Feedback:</p>
            <p className="text-sm text-[var(--text-secondary)]">{demoScript.feedback}</p>
          </div>
        )}
      </div>
    );
  }

  const isSubmitting = submitFeedbackMutation.isPending;

  return (
    <div className="space-y-4 bg-[var(--info-muted)] border border-[var(--info)]/30 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <PlayCircle className="text-[var(--info)]" size={24} />
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">Demo Verification</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Run through these steps to verify the feature works correctly.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {demoScript.steps.map((step) => (
          <DemoStep
            key={step.order}
            step={step}
            status={stepStatuses[step.order] || "pending"}
            notes={stepNotes[step.order] || ""}
            onStatusChange={(status) => handleStatusChange(step.order, status)}
            onNotesChange={(notes) => handleNotesChange(step.order, notes)}
            isExpanded={expandedStep === step.order}
            onToggleExpand={() => handleToggleExpand(step.order)}
          />
        ))}
      </div>

      {/* Progress Indicator */}
      <div className="bg-[var(--bg-secondary)] rounded-lg p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-secondary)]">
            Progress:{" "}
            <span className="font-semibold text-[var(--text-primary)]">{markedCount}</span>/
            <span className="font-semibold text-[var(--text-primary)]">{totalSteps}</span> steps
            verified
          </span>
          <div className="w-32 bg-[var(--bg-tertiary)] rounded-full h-2">
            <div
              className="bg-[var(--info)] h-2 rounded-full transition-all"
              style={{ width: `${totalSteps > 0 ? (markedCount / totalSteps) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Overall Feedback */}
      <div className="space-y-2">
        <label
          htmlFor="overall-feedback"
          className="block text-sm font-medium text-[var(--text-primary)]"
        >
          Overall Feedback (optional):
        </label>
        <textarea
          id="overall-feedback"
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          placeholder="Add any additional feedback, issues encountered, or suggestions..."
          className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] resize-none"
          rows={3}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-[var(--info)]/30">
        <button
          type="button"
          onClick={handleApprove}
          disabled={!allStepsMarked || isSubmitting}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            allStepsMarked && !isSubmitting
              ? "bg-[var(--success)] text-white hover:opacity-90"
              : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
          }`}
        >
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ThumbsUp size={18} />}
          Approve & Complete
        </button>

        <button
          type="button"
          onClick={handleReject}
          disabled={(!hasFailedSteps && !overallFeedback.trim()) || isSubmitting}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            (hasFailedSteps || overallFeedback.trim()) && !isSubmitting
              ? "bg-[var(--warning)] text-white hover:opacity-90"
              : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed"
          }`}
        >
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ThumbsDown size={18} />}
          Request Changes
        </button>
      </div>

      {/* Help Text */}
      <div className="text-xs text-[var(--text-tertiary)] space-y-1 pt-2">
        <p>✓ Mark all steps before approving</p>
        <p>✗ Mark at least one step as failed or add feedback before requesting changes</p>
      </div>
    </div>
  );
};
