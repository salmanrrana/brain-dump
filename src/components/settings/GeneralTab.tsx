import { ChevronDown, Check, Terminal, FolderPlus, Folder, Palette } from "lucide-react";
import { SUPPORTED_TERMINALS } from "../../api/settings";
import { ThemeSwitcher } from "../../components-v2/ui/ThemeSwitcher";
import { sectionHeaderStyles, fieldStyles, inputStyles, statusCardStyles } from "./settingsStyles";

// =============================================================================
// TYPES
// =============================================================================

export interface GeneralTabProps {
  /** Whether this tab is currently visible */
  isActive: boolean;
  /** Current terminal emulator setting */
  terminalEmulator: string;
  /** Callback when terminal changes */
  onTerminalChange: (value: string) => void;
  /** Current default projects directory */
  defaultProjectsDirectory: string;
  /** Callback when directory changes */
  onDirectoryChange: (value: string) => void;
  /** Current default working method */
  defaultWorkingMethod: "auto" | "claude-code" | "vscode" | "opencode";
  /** Callback when working method changes */
  onWorkingMethodChange: (value: "auto" | "claude-code" | "vscode" | "opencode") => void;
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
 * All values are controlled via props with change callbacks to parent.
 */
export function GeneralTab({
  isActive,
  terminalEmulator,
  onTerminalChange,
  defaultProjectsDirectory,
  onDirectoryChange,
  defaultWorkingMethod,
  onWorkingMethodChange,
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
        {/* Appearance Section */}
        <div>
          <div className={sectionHeaderStyles.container}>
            <div className={sectionHeaderStyles.iconBox("var(--accent-ai)")}>
              <Palette size={16} className="text-[var(--accent-ai)]" />
            </div>
            <h3 className={sectionHeaderStyles.title}>Appearance</h3>
          </div>

          <div>
            <label className={fieldStyles.label}>Theme</label>
            <div className="flex items-center gap-4">
              <ThemeSwitcher />
              <span className="text-xs text-[var(--text-tertiary)]">
                Click a color to switch themes
              </span>
            </div>
            <p className={fieldStyles.hint}>
              Choose between Ember (orange), Mint (green), or Solar (gold) accent colors. Your
              preference is saved automatically.
            </p>
          </div>
        </div>

        {/* Projects Section */}
        <div>
          <div className={sectionHeaderStyles.container}>
            <div className={sectionHeaderStyles.iconBox("var(--accent-primary)")}>
              <FolderPlus size={16} className="text-[var(--accent-primary)]" />
            </div>
            <h3 className={sectionHeaderStyles.title}>Projects</h3>
          </div>

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
              {defaultProjectsDirectory ? (
                <span className="text-[var(--text-primary)] truncate font-mono text-sm">
                  {defaultProjectsDirectory}
                </span>
              ) : (
                <span className="text-[var(--text-tertiary)] text-sm">
                  Click to select a directory...
                </span>
              )}
            </button>
            {defaultProjectsDirectory && (
              <button
                onClick={() => onDirectoryChange("")}
                className="mt-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] transition-colors"
              >
                Clear selection
              </button>
            )}
            <p className={fieldStyles.hint}>
              New projects created via "Start from Scratch" will be placed in this directory. Leave
              empty to choose each time.
            </p>
          </div>

          {/* Default Working Method */}
          <div className="mt-4">
            <label htmlFor="working-method-select" className={fieldStyles.label}>
              Default Environment
            </label>
            <div className="relative">
              <select
                id="working-method-select"
                value={defaultWorkingMethod}
                onChange={(e) =>
                  onWorkingMethodChange(
                    e.target.value as "auto" | "claude-code" | "vscode" | "opencode"
                  )
                }
                className={inputStyles.select}
              >
                <option value="auto">Auto-detect</option>
                <option value="claude-code">Claude Code</option>
                <option value="vscode">VS Code</option>
                <option value="opencode">OpenCode</option>
              </select>
              <ChevronDown size={16} className={inputStyles.selectArrow} />
            </div>
            <p className={fieldStyles.hint}>
              Default working environment for new projects. Can be overridden per-project.
            </p>
          </div>
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
          <div>
            <label htmlFor="terminal-emulator-select" className={fieldStyles.label}>
              Preferred Terminal Emulator
            </label>
            <div className="relative">
              <select
                id="terminal-emulator-select"
                value={terminalEmulator}
                onChange={(e) => onTerminalChange(e.target.value)}
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
              Used when clicking "Start Work" on a ticket. Auto-detect will try Ghostty first, then
              fall back to other installed terminals.
            </p>
          </div>

          {/* Available Terminals Info */}
          {availableTerminals.length > 0 && (
            <div className={statusCardStyles.container}>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-3">
                Detected terminals on your system:
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTerminals.map((terminal) => (
                  <span
                    key={terminal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-xs text-[var(--text-secondary)]"
                  >
                    <Check size={12} className="text-[var(--status-success)]" />
                    {terminal}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GeneralTab;
