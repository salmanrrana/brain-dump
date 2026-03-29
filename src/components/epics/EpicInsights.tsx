import React from "react";
import { Sparkles, Repeat, Puzzle, Bot, FileText, Zap, ChevronDown, ChevronUp } from "lucide-react";

export interface InsightEntry {
  category: "frequent-actions" | "skills" | "plugins" | "agents" | "project-docs";
  title: string;
  description: string;
}

export interface EpicInsightsProps {
  insights: InsightEntry[];
  analyzedAt: string | null;
}

interface CategoryConfig {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>;
  accentColor: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  "frequent-actions": {
    label: "Frequent Actions",
    description: "What you do most often across sessions",
    icon: Repeat,
    accentColor: "var(--warning)",
  },
  skills: {
    label: "Potential Skills",
    description: "Reusable workflows that could become Claude Code skills",
    icon: Zap,
    accentColor: "var(--success)",
  },
  plugins: {
    label: "Potential Plugins",
    description: "Tools or integrations that could become standalone plugins",
    icon: Puzzle,
    accentColor: "var(--info)",
  },
  agents: {
    label: "Potential Agents",
    description: "Autonomous tasks that could run as subagents",
    icon: Bot,
    accentColor: "var(--accent-ai)",
  },
  "project-docs": {
    label: "Project Documentation",
    description: "Patterns and conventions for CLAUDE.md or README",
    icon: FileText,
    accentColor: "var(--accent-primary)",
  },
};

const CATEGORY_ORDER: InsightEntry["category"][] = [
  "frequent-actions",
  "skills",
  "plugins",
  "agents",
  "project-docs",
];

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown";
  return (
    date.toLocaleDateString() +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export function EpicInsights({ insights, analyzedAt }: EpicInsightsProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  if (insights.length === 0) return null;

  const grouped = new Map<string, InsightEntry[]>();
  for (const insight of insights) {
    const existing = grouped.get(insight.category) ?? [];
    existing.push(insight);
    grouped.set(insight.category, existing);
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
          <Sparkles size={14} style={{ color: "var(--accent-ai)" }} />
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
            AI Insights
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
            {insights.length}
          </span>
          {analyzedAt && (
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
                marginLeft: "var(--spacing-1)",
              }}
            >
              {formatDate(analyzedAt)}
            </span>
          )}
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
            gap: "var(--spacing-6)",
          }}
        >
          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => {
            const config = CATEGORY_CONFIG[category]!;
            const items = grouped.get(category)!;
            const Icon = config.icon;

            return (
              <div key={category}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-2)",
                    marginBottom: "var(--spacing-3)",
                  }}
                >
                  <Icon size={14} style={{ color: config.accentColor }} />
                  <span
                    style={{
                      fontSize: "var(--font-size-sm)",
                      fontWeight: 600,
                      color: config.accentColor,
                    }}
                  >
                    {config.label}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {config.description}
                  </span>
                </div>
                <div
                  style={{
                    marginLeft: "var(--spacing-6)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-2)",
                  }}
                >
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        borderRadius: "var(--radius-xl)",
                        border: "1px solid var(--border-primary)",
                        background: "var(--bg-primary)",
                        padding: "var(--spacing-3) var(--spacing-4)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "var(--font-size-sm)",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        {item.title}
                      </p>
                      <p
                        style={{
                          fontSize: "var(--font-size-sm)",
                          color: "var(--text-secondary)",
                          margin: 0,
                          marginTop: "2px",
                          lineHeight: 1.5,
                        }}
                      >
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
