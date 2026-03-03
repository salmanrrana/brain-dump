import React from "react";
import { ChevronDown, ChevronUp, Lightbulb, FileText, Wrench, GitBranch } from "lucide-react";

export interface LearningEntry {
  ticketId: string;
  ticketTitle: string;
  learnings: Array<{
    type: "pattern" | "anti-pattern" | "tool-usage" | "workflow";
    description: string;
    suggestedUpdate?: {
      file: string;
      section: string;
      content: string;
    };
  }>;
  appliedAt: string;
}

export interface EpicLearningsProps {
  learnings: LearningEntry[];
}

const LEARNING_TYPE_CONFIG = {
  pattern: {
    label: "Pattern",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: Lightbulb,
  },
  "anti-pattern": {
    label: "Anti-pattern",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: Lightbulb,
  },
  "tool-usage": {
    label: "Tool Usage",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Wrench,
  },
  workflow: {
    label: "Workflow",
    className: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: GitBranch,
  },
} as const;

export function EpicLearnings({ learnings }: EpicLearningsProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const totalLearnings = learnings.reduce((acc, entry) => acc + entry.learnings.length, 0);

  if (learnings.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
        <p className="text-slate-400">
          No learnings captured yet. Complete tickets in this epic to accumulate learnings.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-300">Learnings</span>
          <span className="inline-flex items-center rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">
            {totalLearnings}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-slate-700 p-4 space-y-4">
          {learnings.map((entry) => (
            <div key={entry.ticketId} className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-sm font-medium text-slate-300">{entry.ticketTitle}</span>
                {entry.appliedAt && (
                  <span className="text-xs text-slate-500">
                    {new Date(entry.appliedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="ml-5 space-y-2">
                {entry.learnings.map((learning, idx) => {
                  const config = LEARNING_TYPE_CONFIG[learning.type];
                  const Icon = config.icon;
                  return (
                    <div key={idx} className="rounded bg-slate-900/50 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${config.className}`}
                        >
                          <Icon className="mr-1 h-3 w-3" />
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">{learning.description}</p>
                      {learning.suggestedUpdate && (
                        <p className="mt-1 text-xs text-slate-500">
                          Suggested update: {learning.suggestedUpdate.file} →{" "}
                          {learning.suggestedUpdate.section}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
