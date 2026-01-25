import React from "react";
import { ChevronDown, ChevronUp, Check, X, Minus } from "lucide-react";

export interface DemoStep {
  order: number;
  description: string;
  expectedOutcome: string;
  type: "manual" | "visual" | "automated";
}

export interface DemoStepProps {
  step: DemoStep;
  status: "pending" | "passed" | "failed" | "skipped";
  notes?: string;
  onStatusChange: (status: "pending" | "passed" | "failed" | "skipped") => void;
  onNotesChange: (notes: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const statusConfig = {
  pending: { icon: "□", color: "text-slate-400", bg: "bg-slate-50" },
  passed: { icon: "✓", color: "text-green-600", bg: "bg-green-50" },
  failed: { icon: "✗", color: "text-red-600", bg: "bg-red-50" },
  skipped: { icon: "—", color: "text-slate-500", bg: "bg-slate-50" },
};

const typeConfig = {
  manual: { label: "Manual", badge: "bg-blue-100 text-blue-700" },
  visual: { label: "Visual", badge: "bg-purple-100 text-purple-700" },
  automated: { label: "Automated", badge: "bg-green-100 text-green-700" },
};

export const DemoStep: React.FC<DemoStepProps> = ({
  step,
  status,
  notes = "",
  onStatusChange,
  onNotesChange,
  isExpanded = false,
  onToggleExpand,
}) => {
  const config = statusConfig[status];
  const typeLabel = typeConfig[step.type];

  return (
    <div className={`border rounded-lg p-4 ${config.bg}`}>
      {/* Step Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-semibold text-slate-900">Step {step.order}</span>
            <span className={`text-xs px-2 py-1 rounded-full ${typeLabel.badge}`}>
              {typeLabel.label}
            </span>
          </div>
          <p className="text-slate-700 text-sm">{step.description}</p>
        </div>

        {/* Status Buttons */}
        <div className="flex gap-1 ml-4 flex-shrink-0">
          <button
            onClick={() => onStatusChange("passed")}
            className={`p-2 rounded transition-colors ${
              status === "passed"
                ? "bg-green-200 text-green-700"
                : "bg-white text-slate-400 hover:bg-green-50"
            }`}
            title="Mark as passed"
          >
            <Check size={18} />
          </button>
          <button
            onClick={() => onStatusChange("failed")}
            className={`p-2 rounded transition-colors ${
              status === "failed"
                ? "bg-red-200 text-red-700"
                : "bg-white text-slate-400 hover:bg-red-50"
            }`}
            title="Mark as failed"
          >
            <X size={18} />
          </button>
          <button
            onClick={() => onStatusChange("skipped")}
            className={`p-2 rounded transition-colors ${
              status === "skipped"
                ? "bg-slate-200 text-slate-700"
                : "bg-white text-slate-400 hover:bg-slate-100"
            }`}
            title="Mark as skipped"
          >
            <Minus size={18} />
          </button>
        </div>

        {/* Expand/Collapse */}
        {onToggleExpand && (
          <button onClick={onToggleExpand} className="p-2 text-slate-500 hover:text-slate-700 ml-2">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Expected Outcome:</p>
            <p className="text-sm text-slate-600">{step.expectedOutcome}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes (optional):
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add notes about this step..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
};
