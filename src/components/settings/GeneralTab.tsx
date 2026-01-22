import { ChevronDown, Terminal, FolderPlus, Folder } from "lucide-react";
import { SUPPORTED_TERMINALS } from "../../api/settings";
import { sectionHeaderStyles, fieldStyles, inputStyles } from "./settingsStyles";
import type { SettingsForm, StringFieldRenderProps } from "./settings-form-opts";

// =============================================================================
// TYPES
// =============================================================================

export interface GeneralTabProps {
  /** Whether this tab is currently visible */
  isActive: boolean;
  /** TanStack Form instance for settings */
  form: SettingsForm;
  /** List of available terminals on the system */
  availableTerminals: string[];
  /** Callback to open directory picker */
  onBrowseDirectory: () => void;
}

// =============================================================================
// GENERAL TAB COMPONENT
// =============================================================================

/**
 * GeneralTab - Settings tab for general application configuration.
 *
 * Features:
 * - **Projects directory**: Browse button to select default directory for new projects
 * - **Terminal emulator**: Dropdown with detected terminals marked as installed
 * - **Working method**: Default environment for new projects (auto, claude-code, vscode, opencode)
 *
 * Uses TanStack Form field render props for form state management.
 * Note: Theme/Appearance settings have been moved to EnterpriseTab.
 */
export function GeneralTab({
  isActive,
  form,
  availableTerminals,
  onBrowseDirectory,
}: GeneralTabProps) {
  const isTerminalAvailable = (cmd: string) => availableTerminals.includes(cmd);

  return (
    <div
      id="tabpanel-general"
      role="tabpanel"
      aria-labelledby="tab-general"
      hidden={!isActive}
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Projects Section */}
        <div>
          <div className={sectionHeaderStyles.container}>
            <div className={sectionHeaderStyles.iconBox("var(--accent-primary)")}>
              <FolderPlus size={16} className="text-[var(--accent-primary)]" />
            </div>
            <h3 className={sectionHeaderStyles.title}>Projects</h3>
          </div>

          <form.Field
            name="defaultProjectsDirectory"
            children={(field: StringFieldRenderProps) => (
              <div>
                <label className={fieldStyles.label}>Default Projects Directory</label>
                <button
                  onClick={onBrowseDirectory}
                  aria-label="Select default projects directory"
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-left hover:border-[var(--accent-primary)] transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] flex-shrink-0">
                    <Folder size={16} className="text-[var(--accent-primary)]" />
                  </div>
                  {field.state.value ? (
                    <span className="text-[var(--text-primary)] truncate font-mono text-sm">
                      {field.state.value}
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)] text-sm">
                      Click to select a directory...
                    </span>
                  )}
                </button>
                {field.state.value && (
                  <button
                    onClick={() => field.handleChange("")}
                    className="mt-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    Clear selection
                  </button>
                )}
                <p className={fieldStyles.hint}>
                  New projects created via "Start from Scratch" will be placed in this directory.
                  Leave empty to choose each time.
                </p>
              </div>
            )}
          />

          {/* Default Working Method */}
          <form.Field
            name="defaultWorkingMethod"
            children={(field: StringFieldRenderProps) => (
              <div className="mt-4">
                <label htmlFor="working-method-select" className={fieldStyles.label}>
                  Default Environment
                </label>
                <div className="relative">
                  <select
                    id="working-method-select"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(
                        e.target.value as "auto" | "claude-code" | "vscode" | "opencode"
                      )
                    }
                    onBlur={field.handleBlur}
                    className={inputStyles.select}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="claude-code">Claude Code (Recommended)</option>
                    <option value="vscode">VS Code</option>
                    <option value="opencode">OpenCode</option>
                  </select>
                  <ChevronDown size={16} className={inputStyles.selectArrow} />
                </div>
                <p className={fieldStyles.hint}>
                  Default working environment for new projects. Can be overridden per-project.
                </p>
              </div>
            )}
          />
        </div>

        {/* Terminal Section */}
        <div>
          <div className={sectionHeaderStyles.container}>
            <div className={sectionHeaderStyles.iconBox("var(--accent-ai)")}>
              <Terminal size={16} className="text-[var(--accent-ai)]" />
            </div>
            <h3 className={sectionHeaderStyles.title}>Terminal</h3>
          </div>

          {/* Terminal Emulator Selection */}
          <form.Field
            name="terminalEmulator"
            children={(field: StringFieldRenderProps) => (
              <div>
                <label htmlFor="terminal-emulator-select" className={fieldStyles.label}>
                  Preferred Terminal Emulator
                </label>
                <div className="relative">
                  <select
                    id="terminal-emulator-select"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className={inputStyles.select}
                  >
                    {SUPPORTED_TERMINALS.map((terminal) => (
                      <option key={terminal.value} value={terminal.value}>
                        {terminal.label}
                        {terminal.value && isTerminalAvailable(terminal.value)
                          ? " (installed)"
                          : terminal.value
                            ? " (not detected)"
                            : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className={inputStyles.selectArrow} />
                </div>
                <p className={fieldStyles.hint}>
                  Used when clicking "Start Work" on a ticket. Auto-detect will try Ghostty first,
                  then fall back to other installed terminals.
                </p>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default GeneralTab;
