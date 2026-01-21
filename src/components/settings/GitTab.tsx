import { useState, useMemo } from "react";
import { ChevronDown, GitBranch } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

export type BranchNamingPattern = "feature" | "fix" | "custom";

export interface GitTabProps {
  /** Whether this tab is currently visible */
  isActive: boolean;
  /** Current auto-create PR setting */
  autoCreatePr: boolean;
  /** Callback when auto-create PR setting changes */
  onAutoCreatePrChange: (value: boolean) => void;
  /** Current PR target branch */
  prTargetBranch: string;
  /** Callback when PR target branch changes */
  onPrTargetBranchChange: (value: string) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const BRANCH_PATTERN_OPTIONS: { value: BranchNamingPattern; label: string; pattern: string }[] = [
  { value: "feature", label: "Feature", pattern: "feature/{ticket-id}-{slug}" },
  { value: "fix", label: "Fix", pattern: "fix/{ticket-id}-{slug}" },
  { value: "custom", label: "Custom", pattern: "" },
];

// =============================================================================
// GIT TAB COMPONENT
// =============================================================================

/**
 * GitTab - Settings tab for Git integration configuration.
 *
 * Features:
 * - **Auto-create PR toggle**: Enable/disable automatic PR creation
 * - **PR target branch**: Configure default branch for PRs
 * - **Branch naming pattern**: Dropdown for feature/, fix/, or custom patterns
 * - **Custom pattern input**: Text input when custom is selected
 * - **Branch preview**: Live preview of generated branch name
 *
 * Note: Branch naming pattern is stored locally (UI-only for now).
 * Future versions may persist this to settings.
 */
export function GitTab({
  isActive,
  autoCreatePr,
  onAutoCreatePrChange,
  prTargetBranch,
  onPrTargetBranchChange,
}: GitTabProps) {
  // Local state for branch naming pattern (not yet in schema)
  const [branchPattern, setBranchPattern] = useState<BranchNamingPattern>("feature");
  const [customPattern, setCustomPattern] = useState("feature/{ticket-id}-{slug}");

  // Generate preview branch name
  const branchPreview = useMemo(() => {
    const pattern =
      branchPattern === "custom"
        ? customPattern
        : BRANCH_PATTERN_OPTIONS.find((o) => o.value === branchPattern)?.pattern || "";

    return pattern.replace("{ticket-id}", "abc123").replace("{slug}", "add-dark-mode");
  }, [branchPattern, customPattern]);

  return (
    <div
      id="tabpanel-git"
      role="tabpanel"
      aria-labelledby="tab-git"
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Auto-create PR Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Auto-create Pull Request
            </label>
            <p className="text-xs text-slate-500">Create a PR when Claude/Ralph completes work</p>
          </div>
          <button
            onClick={() => onAutoCreatePrChange(!autoCreatePr)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoCreatePr ? "bg-green-600" : "bg-slate-700"
            }`}
            role="switch"
            aria-checked={autoCreatePr}
            aria-label="Auto-create Pull Request"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoCreatePr ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* PR Target Branch */}
        <div>
          <label
            htmlFor="pr-target-branch"
            className="block text-sm font-medium text-slate-400 mb-1"
          >
            Default Target Branch
          </label>
          <input
            id="pr-target-branch"
            type="text"
            value={prTargetBranch}
            onChange={(e) => onPrTargetBranchChange(e.target.value)}
            placeholder="main"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 "
          />
          <p className="mt-1 text-xs text-slate-500">
            Feature branches will target this branch for PRs (typically "dev" or "main")
          </p>
        </div>

        {/* Branch Naming Pattern */}
        <div>
          <label
            htmlFor="branch-pattern-select"
            className="block text-sm font-medium text-slate-400 mb-1"
          >
            Branch Naming Pattern
          </label>
          <div className="relative">
            <select
              id="branch-pattern-select"
              value={branchPattern}
              onChange={(e) => setBranchPattern(e.target.value as BranchNamingPattern)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none "
            >
              {BRANCH_PATTERN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} {option.pattern && `(${option.pattern})`}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
        </div>

        {/* Custom Pattern Input */}
        {branchPattern === "custom" && (
          <div>
            <label
              htmlFor="custom-pattern-input"
              className="block text-sm font-medium text-slate-400 mb-1"
            >
              Custom Pattern
            </label>
            <input
              id="custom-pattern-input"
              type="text"
              value={customPattern}
              onChange={(e) => setCustomPattern(e.target.value)}
              placeholder="feature/{ticket-id}-{slug}"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100  font-mono text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Use <code className="bg-slate-700 px-1 rounded">{"{ticket-id}"}</code> for ticket ID
              and <code className="bg-slate-700 px-1 rounded">{"{slug}"}</code> for slugified title
            </p>
          </div>
        )}

        {/* Branch Preview */}
        <div className="p-3 bg-slate-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch size={14} className="text-green-400" />
            <p className="text-xs font-medium text-slate-400">Preview</p>
          </div>
          <p className="font-mono text-sm text-green-400 truncate">{branchPreview}</p>
        </div>
      </div>
    </div>
  );
}

export default GitTab;
