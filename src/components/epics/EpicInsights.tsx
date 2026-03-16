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
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  bgClass: string;
  borderClass: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  "frequent-actions": {
    label: "Frequent Actions",
    description: "What you do most often across sessions",
    icon: Repeat,
    accentClass: "text-amber-400",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/20",
  },
  skills: {
    label: "Potential Skills",
    description: "Reusable workflows that could become Claude Code skills",
    icon: Zap,
    accentClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/20",
  },
  plugins: {
    label: "Potential Plugins",
    description: "Tools or integrations that could become standalone plugins",
    icon: Puzzle,
    accentClass: "text-blue-400",
    bgClass: "bg-blue-500/10",
    borderClass: "border-blue-500/20",
  },
  agents: {
    label: "Potential Agents",
    description: "Autonomous tasks that could run as subagents",
    icon: Bot,
    accentClass: "text-purple-400",
    bgClass: "bg-purple-500/10",
    borderClass: "border-purple-500/20",
  },
  "project-docs": {
    label: "Project Documentation",
    description: "Patterns and conventions for CLAUDE.md or README",
    icon: FileText,
    accentClass: "text-cyan-400",
    bgClass: "bg-cyan-500/10",
    borderClass: "border-cyan-500/20",
  },
};

// Render order
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

  // Group by category
  const grouped = new Map<string, InsightEntry[]>();
  for (const insight of insights) {
    const existing = grouped.get(insight.category) ?? [];
    existing.push(insight);
    grouped.set(insight.category, existing);
  }

  return (
    <div className="rounded-lg border border-purple-500/20 bg-gradient-to-br from-slate-800/80 to-purple-900/10">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">AI Insights</span>
          <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
            {insights.length}
          </span>
          {analyzedAt && (
            <span className="text-xs text-slate-500 ml-2">Analyzed {formatDate(analyzedAt)}</span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-purple-500/20 p-4 space-y-5">
          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((category) => {
            const config = CATEGORY_CONFIG[category]!;
            const items = grouped.get(category)!;
            const Icon = config.icon;

            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${config.accentClass}`} />
                  <span className={`text-sm font-medium ${config.accentClass}`}>
                    {config.label}
                  </span>
                  <span className="text-xs text-slate-500">{config.description}</span>
                </div>
                <div className="space-y-2 ml-6">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-md border ${config.borderClass} ${config.bgClass} p-3`}
                    >
                      <p className={`text-sm font-medium ${config.accentClass}`}>{item.title}</p>
                      <p className="text-sm text-slate-300 mt-0.5">{item.description}</p>
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
