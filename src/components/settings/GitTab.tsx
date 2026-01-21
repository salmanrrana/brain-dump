import { useState, useMemo } from "react";
import { ChevronDown, GitBranch, GitPullRequest } from "lucide-react";
import {
  sectionHeaderStyles,
  fieldStyles,
  inputStyles,
  statusCardStyles,
  toggleStyles,
} from "./settingsStyles";

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
      hidden={!isActive}
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Section Header */}
        <div className={sectionHeaderStyles.container}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)]">
            <GitPullRequest size={16} className="text-[var(--status-success)]" />
          </div>
          <h3 className={sectionHeaderStyles.title}>Git & Pull Requests</h3>
        </div>

        {/* Auto-create PR Toggle */}
        <div className={toggleStyles.row}>
          <div className={toggleStyles.info}>
            <div className={toggleStyles.label}>Auto-create Pull Request</div>
            <div className={toggleStyles.desc}>Create a PR when Claude/Ralph completes work</div>
          </div>
          <button
            onClick={() => onAutoCreatePrChange(!autoCreatePr)}
            className={toggleStyles.switch(autoCreatePr)}
            role="switch"
            aria-checked={autoCreatePr}
            aria-label="Auto-create Pull Request"
          >
            <span className={toggleStyles.knob(autoCreatePr)} />
          </button>
        </div>

        {/* PR Target Branch */}
        <div>
          <label htmlFor="pr-target-branch" className={fieldStyles.label}>
            Default Target Branch
          </label>
          <input
            id="pr-target-branch"
            type="text"
            value={prTargetBranch}
            onChange={(e) => onPrTargetBranchChange(e.target.value)}
            placeholder="main"
            className={inputStyles.base}
          />
          <p className={fieldStyles.hint}>
            Feature branches will target this branch for PRs (typically "dev" or "main")
          </p>
        </div>

        {/* Branch Naming Pattern */}
        <div>
          <label htmlFor="branch-pattern-select" className={fieldStyles.label}>
            Branch Naming Pattern
          </label>
          <div className="relative">
            <select
              id="branch-pattern-select"
              value={branchPattern}
              onChange={(e) => setBranchPattern(e.target.value as BranchNamingPattern)}
              className={inputStyles.select}
            >
              {BRANCH_PATTERN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} {option.pattern && `(${option.pattern})`}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className={inputStyles.selectArrow} />
          </div>
        </div>

        {/* Custom Pattern Input */}
        {branchPattern === "custom" && (
          <div>
            <label htmlFor="custom-pattern-input" className={fieldStyles.label}>
              Custom Pattern
            </label>
            <input
              id="custom-pattern-input"
              type="text"
              value={customPattern}
              onChange={(e) => setCustomPattern(e.target.value)}
              placeholder="feature/{ticket-id}-{slug}"
              className={inputStyles.base + " font-mono text-sm"}
            />
            <p className={fieldStyles.hint}>
              Use <code className={statusCardStyles.code}>{"{ticket-id}"}</code> for ticket ID and{" "}
              <code className={statusCardStyles.code}>{"{slug}"}</code> for slugified title
            </p>
          </div>
        )}

        {/* Branch Preview */}
        <div className={statusCardStyles.container}>
          <div className="flex items-center gap-2.5 mb-2">
            <GitBranch size={14} className="text-[var(--status-success)]" />
            <p className="text-xs font-semibold text-[var(--text-secondary)]">Preview</p>
          </div>
          <p className="font-mono text-sm text-[var(--status-success)] truncate">{branchPreview}</p>
        </div>
      </div>
    </div>
  );
}

export default GitTab;
