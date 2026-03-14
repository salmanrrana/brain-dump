import { useState } from "react";
import { MessageSquareWarning, Bug, Lightbulb, HelpCircle, ExternalLink } from "lucide-react";
import { Modal } from "../components-v2/ui/Modal";

const GITHUB_REPO = "salmanrrana/brain-dump";

type FeedbackType = "bug" | "feature" | "question";

const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: typeof Bug; template: string }[] =
  [
    {
      value: "bug",
      label: "Bug Report",
      icon: Bug,
      template: [
        "## What happened?",
        "",
        "",
        "",
        "## Steps to reproduce",
        "",
        "1. ",
        "",
        "## Expected behavior",
        "",
        "",
      ].join("\n"),
    },
    {
      value: "feature",
      label: "Feature Request",
      icon: Lightbulb,
      template: ["## What would you like?", "", "", "", "## Why is this useful?", "", ""].join(
        "\n"
      ),
    },
    {
      value: "question",
      label: "Question",
      icon: HelpCircle,
      template: "",
    },
  ];

const LABELS: Record<FeedbackType, string> = {
  bug: "bug",
  feature: "enhancement",
  question: "question",
};

function buildGitHubIssueUrl(type: FeedbackType, title: string, body: string): string {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (body) params.set("body", body);
  params.set("labels", LABELS[type]);
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(FEEDBACK_TYPES[0]?.template ?? "");

  const handleTypeChange = (type: FeedbackType) => {
    setFeedbackType(type);
    const template = FEEDBACK_TYPES.find((t) => t.value === type)?.template ?? "";
    setBody(template);
  };

  const handleSubmit = () => {
    const url = buildGitHubIssueUrl(feedbackType, title, body);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const canSubmit = title.trim().length > 0;

  return (
    <Modal isOpen={true} onClose={onClose} size="lg" aria-label="Send feedback">
      <Modal.Header icon={MessageSquareWarning} title="Send Feedback" onClose={onClose} />
      <Modal.Body>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
          {/* Feedback type selector */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)" as unknown as number,
                color: "var(--text-secondary)",
                marginBottom: "var(--spacing-2)",
              }}
            >
              Type
            </label>
            <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
              {FEEDBACK_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTypeChange(value)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "var(--spacing-2)",
                    padding: "var(--spacing-2) var(--spacing-3)",
                    borderRadius: "var(--radius-lg)",
                    border: `1px solid ${feedbackType === value ? "var(--accent-primary)" : "var(--border-secondary)"}`,
                    backgroundColor:
                      feedbackType === value ? "var(--bg-hover)" : "var(--bg-tertiary)",
                    color:
                      feedbackType === value ? "var(--accent-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: "var(--font-weight-medium)" as unknown as number,
                    transition:
                      "border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast)",
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="feedback-title"
              style={{
                display: "block",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)" as unknown as number,
                color: "var(--text-secondary)",
                marginBottom: "var(--spacing-2)",
              }}
            >
              Title
            </label>
            <input
              id="feedback-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of your feedback"
              style={{
                width: "100%",
                padding: "var(--spacing-2) var(--spacing-3)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-secondary)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: "var(--font-size-sm)",
                outline: "none",
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="feedback-body"
              style={{
                display: "block",
                fontSize: "var(--font-size-sm)",
                fontWeight: "var(--font-weight-medium)" as unknown as number,
                color: "var(--text-secondary)",
                marginBottom: "var(--spacing-2)",
              }}
            >
              Description
            </label>
            <textarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell us more..."
              rows={8}
              style={{
                width: "100%",
                padding: "var(--spacing-2) var(--spacing-3)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-secondary)",
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: "var(--font-size-sm)",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Info text */}
          <p
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-tertiary)",
              margin: 0,
            }}
          >
            This will open a new GitHub issue in a new tab. You can review and edit before
            submitting.
          </p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "var(--spacing-2) var(--spacing-4)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-secondary)",
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "var(--font-size-sm)",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-2)",
            padding: "var(--spacing-2) var(--spacing-4)",
            borderRadius: "var(--radius-lg)",
            border: "none",
            background: canSubmit ? "var(--gradient-accent)" : "var(--bg-tertiary)",
            color: canSubmit ? "white" : "var(--text-tertiary)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)" as unknown as number,
          }}
        >
          <ExternalLink size={14} aria-hidden="true" />
          Open on GitHub
        </button>
      </Modal.Footer>
    </Modal>
  );
}
