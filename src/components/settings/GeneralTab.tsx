import { ChevronDown, Check, Terminal, FolderPlus, Folder } from "lucide-react";
import { SUPPORTED_TERMINALS } from "../../api/settings";

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
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Projects Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FolderPlus size={18} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">
              Projects
            </h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Default Projects Directory
            </label>
            <button
              onClick={onBrowseDirectory}
              className="w-full flex items-center gap-3 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-left hover:border-slate-600  transition-colors"
            >
              <Folder size={18} className="text-amber-400 flex-shrink-0" />
              {defaultProjectsDirectory ? (
                <span className="text-gray-100 truncate font-mono text-sm">
                  {defaultProjectsDirectory}
                </span>
              ) : (
                <span className="text-slate-500 text-sm">Click to select a directory...</span>
              )}
            </button>
            {defaultProjectsDirectory && (
              <button
                onClick={() => onDirectoryChange("")}
                className="mt-2 text-xs text-slate-400 hover:text-slate-300"
              >
                Clear selection
              </button>
            )}
            <p className="mt-2 text-xs text-slate-500">
              New projects created via "Start from Scratch" will be placed in this directory. Leave
              empty to choose each time.
            </p>
          </div>

          {/* Default Working Method */}
          <div className="mt-4">
            <label
              htmlFor="working-method-select"
              className="block text-sm font-medium text-slate-400 mb-1"
            >
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
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none "
              >
                <option value="auto">Auto-detect</option>
                <option value="claude-code">Claude Code</option>
                <option value="vscode">VS Code</option>
                <option value="opencode">OpenCode</option>
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Default working environment for new projects. Can be overridden per-project.
            </p>
          </div>
        </div>

        {/* Terminal Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={18} className="text-cyan-400" />
            <h3 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">
              Terminal
            </h3>
          </div>

          {/* Terminal Emulator Selection */}
          <div>
            <label
              htmlFor="terminal-emulator-select"
              className="block text-sm font-medium text-slate-400 mb-1"
            >
              Preferred Terminal Emulator
            </label>
            <div className="relative">
              <select
                id="terminal-emulator-select"
                value={terminalEmulator}
                onChange={(e) => onTerminalChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none "
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
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Used when clicking "Start Work" on a ticket. Auto-detect will try Ghostty first, then
              fall back to other installed terminals.
            </p>
          </div>

          {/* Available Terminals Info */}
          {availableTerminals.length > 0 && (
            <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs font-medium text-slate-400 mb-2">
                Detected terminals on your system:
              </p>
              <div className="flex flex-wrap gap-2">
                {availableTerminals.map((terminal) => (
                  <span
                    key={terminal}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-xs text-slate-300"
                  >
                    <Check size={12} className="text-green-400" />
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
