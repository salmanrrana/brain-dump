import React from "react";
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  FileText,
  Wrench,
  GitBranch,
  RefreshCw,
  LoaderCircle,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerAutoLearnings } from "../../api/epics";
import { queryKeys } from "../../lib/query-keys";
import { useToast } from "../Toast";

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
  epicId: string;
  learnings: LearningEntry[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

interface LearningConfig {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}

const LEARNING_TYPE_CONFIG: Record<string, LearningConfig> = {
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
};

const DEFAULT_CONFIG: LearningConfig = {
  label: "Unknown",
  className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  icon: Lightbulb,
};

export function EpicLearnings({ epicId, learnings = [] }: EpicLearningsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const refreshMutation = useMutation({
    mutationFn: () => triggerAutoLearnings({ data: { epicId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.epicDetail(epicId) });
      if (result.ticketsProcessed > 0) {
        showToast(
          "success",
          `Extracted ${result.totalLearningsExtracted} learnings from ${result.ticketsProcessed} ticket${result.ticketsProcessed === 1 ? "" : "s"}`
        );
      } else {
        showToast("info", "No new learnings to extract. All tickets already have learnings.");
      }
    },
    onError: (err) => {
      showToast(
        "error",
        `Failed to refresh learnings: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    },
  });

  const safeLearnings = learnings ?? [];
  const totalLearnings = safeLearnings.reduce(
    (acc, entry) => acc + (entry.learnings?.length ?? 0),
    0
  );

  if (safeLearnings.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center">
        <p className="text-slate-400">
          No learnings captured yet. Complete tickets in this epic to accumulate learnings.
        </p>
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          {refreshMutation.isPending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {refreshMutation.isPending ? "Extracting..." : "Refresh Learnings"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
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
          {safeLearnings.map((entry) => (
            <div key={entry.ticketId} className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-sm font-medium text-slate-300">{entry.ticketTitle}</span>
                {entry.appliedAt && (
                  <span className="text-xs text-slate-500">{formatDate(entry.appliedAt)}</span>
                )}
              </div>
              <div className="ml-5 space-y-2">
                {(entry.learnings ?? []).map((learning, idx) => {
                  const config = LEARNING_TYPE_CONFIG[learning.type] ?? DEFAULT_CONFIG;
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

          <div className="border-t border-slate-700 pt-3">
            <button
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              {refreshMutation.isPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {refreshMutation.isPending ? "Extracting..." : "Refresh Learnings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
