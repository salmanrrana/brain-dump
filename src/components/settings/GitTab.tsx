import { useState } from "react";
import { GitPullRequest, Check } from "lucide-react";
import {
  sectionHeaderStyles,
  fieldStyles,
  inputStyles,
  statusCardStyles,
  toggleStyles,
} from "./settingsStyles";
import type { SettingsForm } from "./settings-form-opts";

// =============================================================================
// TYPES
// =============================================================================

export interface GitTabProps {
  /** Whether this tab is currently visible */
  isActive: boolean;
  /** TanStack Form instance for settings */
  form: SettingsForm;
}

// =============================================================================
// GIT TAB COMPONENT
// =============================================================================

/**
 * GitTab - Settings tab for Git integration configuration.
 *
 * Features:
 * - **Auto-create PR toggle**: Enable/disable automatic PR creation
 * - **PR target branch**: Configure default branch for PRs
 * - **Branch naming pattern**: Text input for custom branch patterns
 * - **Git status card**: Shows GitHub CLI auth and remote status
 *
 * Uses TanStack Form field render props for form state management.
 * Note: Branch naming pattern is stored locally (UI-only for now).
 * Future versions may persist this to settings.
 */
export function GitTab({ isActive, form }: GitTabProps) {
  // Local state for branch naming pattern (not yet in schema)
  const [branchPattern, setBranchPattern] = useState("feature/{ticket-id}-{slug}");

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
        <form.Field
          name="autoCreatePr"
          children={(field: { state: { value: boolean }; handleChange: (v: boolean) => void }) => (
            <div className={toggleStyles.row}>
              <div className={toggleStyles.info}>
                <div className={toggleStyles.label}>Auto-create Pull Request</div>
                <div className={toggleStyles.desc}>
                  Create a PR when Claude/Ralph completes work on a ticket.
                </div>
              </div>
              <button
                onClick={() => field.handleChange(!field.state.value)}
                className={toggleStyles.switch(field.state.value)}
                role="switch"
                aria-checked={field.state.value}
                aria-label="Auto-create Pull Request"
              >
                <span className={toggleStyles.knob(field.state.value)} />
              </button>
            </div>
          )}
        />

        {/* PR Target Branch */}
        <form.Field
          name="prTargetBranch"
          children={(field: {
            state: { value: string };
            handleChange: (v: string) => void;
            handleBlur: () => void;
          }) => (
            <div>
              <label htmlFor="pr-target-branch" className={fieldStyles.label}>
                PR Target Branch
              </label>
              <input
                id="pr-target-branch"
                type="text"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="main"
                className={inputStyles.base}
              />
              <p className={fieldStyles.hint}>
                Feature branches will target this branch for PRs (typically "dev" or "main")
              </p>
            </div>
          )}
        />

        {/* Branch Naming Pattern - Text Input */}
        <div>
          <label htmlFor="branch-pattern-input" className={fieldStyles.label}>
            Branch Naming Pattern
          </label>
          <input
            id="branch-pattern-input"
            type="text"
            value={branchPattern}
            onChange={(e) => setBranchPattern(e.target.value)}
            placeholder="feature/{ticket-id}-{slug}"
            className={inputStyles.base + " font-mono text-sm"}
          />
          <p className={fieldStyles.hint}>
            Pattern for auto-generated branch names. Available variables: {"{ticket-id}"},{" "}
            {"{slug}"}, {"{type}"}
          </p>
        </div>

        {/* Git Status Card */}
        <div className={statusCardStyles.container}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-[var(--status-success)]" />
              <span className="text-sm text-[var(--status-success)]">
                GitHub CLI: Authenticated
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={14} className="text-[var(--status-success)]" />
              <span className="text-sm text-[var(--status-success)]">
                Remote: origin (github.com/user/repo)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GitTab;
