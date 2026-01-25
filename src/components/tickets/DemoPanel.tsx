import React, { useState } from "react";
import { PlayCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import { DemoStep, type DemoStep as DemoStepType } from "./DemoStep";

export interface DemoScript {
  id: string;
  ticketId: string;
  steps: DemoStepType[];
  generatedAt: string;
  completedAt?: string;
  passed?: boolean;
  feedback?: string;
}

export interface DemoPanelProps {
  ticketId: string;
  demoScript: DemoScript;
  isLoading?: boolean;
  onApprove: (
    feedback: string,
    stepResults: Array<{ order: number; status: string; notes?: string }>
  ) => void;
  onReject: (
    feedback: string,
    stepResults: Array<{ order: number; status: string; notes?: string }>
  ) => void;
}

export const DemoPanel: React.FC<DemoPanelProps> = ({
  demoScript,
  isLoading = false,
  onApprove,
  onReject,
}) => {
  const [stepStatuses, setStepStatuses] = useState<
    Record<number, "pending" | "passed" | "failed" | "skipped">
  >(Object.fromEntries(demoScript.steps.map((s) => [s.order, "pending"])));

  const [stepNotes, setStepNotes] = useState<Record<number, string>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const markedCount = Object.values(stepStatuses).filter((s) => s !== "pending").length;
  const totalSteps = demoScript.steps.length;

  const allStepsMarked = markedCount === totalSteps;
  const hasFailedSteps = Object.values(stepStatuses).some((s) => s === "failed");

  const getStepResults = () =>
    demoScript.steps.map((step) => {
      const notes = stepNotes[step.order];
      return {
        order: step.order,
        status: (stepStatuses[step.order] || "pending") as string,
        ...(notes ? { notes } : {}),
      };
    });

  const handleApprove = () => {
    if (!allStepsMarked) return;
    onApprove(overallFeedback, getStepResults());
  };

  const handleReject = () => {
    if (!hasFailedSteps && !overallFeedback.trim()) return;
    onReject(overallFeedback, getStepResults());
  };

  return (
    <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <PlayCircle className="text-blue-600" size={24} />
        <div>
          <h3 className="font-semibold text-slate-900">Demo Verification</h3>
          <p className="text-sm text-slate-600">
            Please run through these steps to verify the feature works correctly.
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
            onStatusChange={(newStatus) =>
              setStepStatuses((prev) => ({ ...prev, [step.order]: newStatus }))
            }
            onNotesChange={(notes) => setStepNotes((prev) => ({ ...prev, [step.order]: notes }))}
            isExpanded={expandedStep === step.order}
            onToggleExpand={() =>
              setExpandedStep((prev) => (prev === step.order ? null : step.order))
            }
          />
        ))}
      </div>

      {/* Progress Indicator */}
      <div className="bg-white rounded-lg p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-700">
            Progress: <span className="font-semibold">{markedCount}</span>/
            <span className="font-semibold">{totalSteps}</span> steps verified
          </span>
          <div className="w-32 bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(markedCount / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Overall Feedback */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-900">
          Overall Feedback (optional):
        </label>
        <textarea
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          placeholder="Add any additional feedback, issues encountered, or suggestions..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-blue-200">
        <button
          onClick={handleApprove}
          disabled={!allStepsMarked || isLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            allStepsMarked && !isLoading
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-slate-200 text-slate-500 cursor-not-allowed"
          }`}
        >
          <ThumbsUp size={18} />
          Approve & Complete
        </button>

        <button
          onClick={handleReject}
          disabled={(!hasFailedSteps && !overallFeedback.trim()) || isLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            (hasFailedSteps || overallFeedback.trim()) && !isLoading
              ? "bg-orange-600 text-white hover:bg-orange-700"
              : "bg-slate-200 text-slate-500 cursor-not-allowed"
          }`}
        >
          <ThumbsDown size={18} />
          Request Changes
        </button>
      </div>

      {/* Help Text */}
      <div className="text-xs text-slate-600 space-y-1 pt-2">
        <p>✓ Mark all steps before approving</p>
        <p>✗ Mark at least one step as failed or add feedback before requesting changes</p>
      </div>
    </div>
  );
};
