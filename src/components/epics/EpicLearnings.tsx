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
  Sparkles,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerAutoLearnings, launchEpicAnalysis } from "../../api/epics";
import { queryKeys } from "../../lib/query-keys";
import { useToast } from "../Toast";
import { useSettings } from "../../lib/hooks/settings";

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
    className: "bg-[var(--success-muted)] text-[var(--success)] border-[var(--success)]/30",
    icon: Lightbulb,
  },
  "anti-pattern": {
    label: "Anti-pattern",
    className: "bg-[var(--error-muted)] text-[var(--error)] border-[var(--error)]/30",
    icon: Lightbulb,
  },
  "tool-usage": {
    label: "Tool Usage",
    className: "bg-[var(--info-muted)] text-[var(--info)] border-[var(--info)]/30",
    icon: Wrench,
  },
  workflow: {
    label: "Workflow",
    className:
      "bg-[var(--accent-muted)] text-[var(--accent-primary)] border-[var(--accent-primary)]/30",
    icon: GitBranch,
  },
};

const DEFAULT_CONFIG: LearningConfig = {
  label: "Unknown",
  className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]",
  icon: Lightbulb,
};

const TRUNCATE_LENGTH = 120;

function TruncatedText({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const needsTruncation = text.length > TRUNCATE_LENGTH;

  if (!needsTruncation) {
    return (
      <p
        style={{
          fontSize: "var(--font-size-sm)",
          color: "var(--text-primary)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {text}
      </p>
    );
  }

  return (
    <p
      style={{
        fontSize: "var(--font-size-sm)",
        color: "var(--text-primary)",
        lineHeight: 1.5,
        margin: 0,
      }}
    >
      {expanded ? text : text.slice(0, TRUNCATE_LENGTH) + "..."}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        style={{
          marginLeft: "4px",
          fontSize: "var(--font-size-xs)",
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
        className="hover:text-[var(--text-secondary)]"
      >
        {expanded ? "show less" : "show more"}
      </button>
    </p>
  );
}

const actionButtonBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  borderRadius: "var(--radius-xl)",
  padding: "6px 12px",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-sans)",
  fontWeight: 500,
  cursor: "pointer",
  border: "none",
  transition: "all var(--transition-fast)",
};

export function EpicLearnings({ epicId, learnings = [] }: EpicLearningsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { settings } = useSettings();

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

  const analysisMutation = useMutation({
    mutationFn: () =>
      launchEpicAnalysis({
        data: {
          epicId,
          preferredTerminal: settings?.terminalEmulator ?? null,
        },
      }),
    onSuccess: (result) => {
      if (result.success) {
        showToast("success", result.message);
      } else {
        showToast("error", result.message);
      }
    },
    onError: (err) => {
      showToast(
        "error",
        `Failed to launch analysis: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    },
  });

  const safeLearnings = learnings ?? [];
  const totalLearnings = safeLearnings.reduce(
    (acc, entry) => acc + (entry.learnings?.length ?? 0),
    0
  );
  const isPending = analysisMutation.isPending || refreshMutation.isPending;

  const renderActionButtons = () => (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
      <button
        type="button"
        onClick={() => analysisMutation.mutate()}
        disabled={isPending}
        style={{
          ...actionButtonBase,
          background: "var(--accent-ai)",
          color: "white",
          opacity: isPending ? 0.5 : 1,
        }}
        className="hover:brightness-110"
      >
        {analysisMutation.isPending ? (
          <LoaderCircle size={13} className="animate-spin" />
        ) : (
          <Sparkles size={13} />
        )}
        {analysisMutation.isPending ? "Launching..." : "Analyze with AI"}
      </button>
      <button
        type="button"
        onClick={() => refreshMutation.mutate()}
        disabled={isPending}
        style={{
          ...actionButtonBase,
          background: "var(--bg-card)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-primary)",
          opacity: isPending ? 0.5 : 1,
        }}
        className="hover:bg-[var(--bg-hover)]"
      >
        {refreshMutation.isPending ? (
          <LoaderCircle size={13} className="animate-spin" />
        ) : (
          <RefreshCw size={13} />
        )}
        {refreshMutation.isPending ? "Extracting..." : "Quick Extract"}
      </button>
    </div>
  );

  if (safeLearnings.length === 0) {
    return (
      <div
        style={{
          padding: "var(--spacing-8)",
          textAlign: "center",
          border: "1px dashed var(--border-primary)",
          borderRadius: "var(--radius-xl)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--spacing-4)",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)", margin: 0 }}>
          No learnings captured yet. Complete tickets to accumulate learnings.
        </p>
        {renderActionButtons()}
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-primary)",
        background: "var(--bg-card)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--spacing-4) var(--spacing-5)",
          textAlign: "left",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "background-color var(--transition-fast)",
        }}
        className="hover:bg-[var(--bg-hover)]"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              letterSpacing: "var(--tracking-wider)",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            Learnings
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-primary)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
            }}
          >
            {totalLearnings}
          </span>
        </div>
        {isOpen ? (
          <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
        )}
      </button>

      {isOpen && (
        <div
          style={{
            borderTop: "1px solid var(--border-primary)",
            padding: "var(--spacing-5)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-5)",
          }}
        >
          {safeLearnings.map((entry) => (
            <div
              key={entry.ticketId}
              style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                <FileText size={13} style={{ color: "var(--text-muted)" }} />
                <span
                  style={{
                    fontSize: "var(--font-size-sm)",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {entry.ticketTitle}
                </span>
                {entry.appliedAt && (
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {formatDate(entry.appliedAt)}
                  </span>
                )}
              </div>
              <div
                style={{
                  marginLeft: "var(--spacing-5)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--spacing-2)",
                }}
              >
                {(entry.learnings ?? []).map((learning, idx) => {
                  const config = LEARNING_TYPE_CONFIG[learning.type] ?? DEFAULT_CONFIG;
                  const Icon = config.icon;
                  return (
                    <div
                      key={idx}
                      style={{
                        borderRadius: "var(--radius-xl)",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-primary)",
                        padding: "var(--spacing-3) var(--spacing-4)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-2)",
                          marginBottom: "var(--spacing-2)",
                        }}
                      >
                        <span
                          className={`inline-flex items-center rounded-lg border px-1.5 py-0.5 text-xs font-medium ${config.className}`}
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          <Icon className="mr-1 h-3 w-3" />
                          {config.label}
                        </span>
                      </div>
                      <TruncatedText text={learning.description} />
                      {learning.suggestedUpdate && (
                        <p
                          style={{
                            marginTop: "var(--spacing-2)",
                            fontSize: "var(--font-size-xs)",
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-muted)",
                          }}
                        >
                          Suggested: {learning.suggestedUpdate.file} →{" "}
                          {learning.suggestedUpdate.section}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div
            style={{ borderTop: "1px solid var(--border-primary)", paddingTop: "var(--spacing-4)" }}
          >
            {renderActionButtons()}
          </div>
        </div>
      )}
    </div>
  );
}
