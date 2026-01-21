import { useState, useEffect, useRef, useCallback } from "react";
import { X, Bot, GitBranch, Settings, Building2 } from "lucide-react";
import {
  useSettings,
  useUpdateSettings,
  useAvailableTerminals,
  useDockerStatus,
  useBuildSandboxImage,
} from "../../lib/hooks";
import type { DockerRuntimeSetting } from "../../api/settings";
import DirectoryPicker from "../DirectoryPicker";
import { TabNav, type Tab } from "./TabNav";
import { GeneralTab } from "./GeneralTab";
import { RalphTab } from "./RalphTab";
import { GitTab } from "./GitTab";

// =============================================================================
// TYPES
// =============================================================================

interface SettingsModalProps {
  /** Handler to close the modal */
  onClose: () => void;
}

/** Settings tab identifiers */
type SettingsTabId = "general" | "ralph" | "git" | "enterprise";

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

const SETTINGS_TABS: Tab[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "ralph", label: "Ralph", icon: Bot },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "enterprise", label: "Enterprise", icon: Building2 },
];

// =============================================================================
// SETTINGS MODAL COMPONENT
// =============================================================================

/**
 * SettingsModal - Modal for configuring application settings.
 *
 * Features:
 * - **Tabbed navigation**: 4 tabs using TabNav component (General, Ralph, Git, Enterprise)
 * - **Form state preservation**: Tab switching preserves all form values
 * - **Keyboard accessible**: Escape to close, Tab/Arrow key navigation
 * - **Save/Cancel**: Footer buttons to save changes or cancel
 *
 * Tab contents are rendered inline with CSS display toggling for state preservation.
 */
export default function SettingsModal({ onClose }: SettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");

  // Fetch current settings
  const { settings, loading: settingsLoading } = useSettings();
  const { availableTerminals, loading: terminalsLoading } = useAvailableTerminals();
  const { dockerStatus, loading: dockerLoading } = useDockerStatus();
  const updateMutation = useUpdateSettings();
  const buildImageMutation = useBuildSandboxImage();

  // Form state - General tab
  const [terminalEmulator, setTerminalEmulator] = useState<string>("");
  const [defaultProjectsDirectory, setDefaultProjectsDirectory] = useState("");
  const [defaultWorkingMethod, setDefaultWorkingMethod] = useState<
    "auto" | "claude-code" | "vscode" | "opencode"
  >("auto");
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);

  // Form state - Ralph tab
  const [ralphSandbox, setRalphSandbox] = useState(false);
  const [ralphTimeout, setRalphTimeout] = useState(3600);
  const [ralphMaxIterations, setRalphMaxIterations] = useState(10);
  const [dockerRuntime, setDockerRuntime] = useState<DockerRuntimeSetting>("auto");

  // Form state - Git tab
  const [autoCreatePr, setAutoCreatePr] = useState(true);
  const [prTargetBranch, setPrTargetBranch] = useState("dev");

  // Form state - Enterprise tab
  const [conversationLoggingEnabled, setConversationLoggingEnabled] = useState(true);
  const [conversationRetentionDays, setConversationRetentionDays] = useState(90);

  // Change tracking
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize state when settings load
  /* eslint-disable react-hooks/set-state-in-effect -- syncing external data to state */
  useEffect(() => {
    if (settings) {
      setTerminalEmulator(settings.terminalEmulator ?? "");
      setRalphSandbox(settings.ralphSandbox ?? false);
      setRalphTimeout(settings.ralphTimeout ?? 3600);
      setRalphMaxIterations(settings.ralphMaxIterations ?? 10);
      setAutoCreatePr(settings.autoCreatePr ?? true);
      setPrTargetBranch(settings.prTargetBranch ?? "dev");
      setDefaultProjectsDirectory(settings.defaultProjectsDirectory ?? "");
      setDefaultWorkingMethod(
        (settings.defaultWorkingMethod as "auto" | "claude-code" | "vscode" | "opencode") ?? "auto"
      );
      setConversationLoggingEnabled(settings.conversationLoggingEnabled ?? true);
      setConversationRetentionDays(settings.conversationRetentionDays ?? 90);
      setDockerRuntime((settings.dockerRuntime as DockerRuntimeSetting) ?? "auto");
    }
  }, [settings]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Track changes
  /* eslint-disable react-hooks/set-state-in-effect -- derived state from form values */
  useEffect(() => {
    if (settings) {
      const terminalChanged = terminalEmulator !== (settings.terminalEmulator ?? "");
      const sandboxChanged = ralphSandbox !== (settings.ralphSandbox ?? false);
      const timeoutChanged = ralphTimeout !== (settings.ralphTimeout ?? 3600);
      const iterationsChanged = ralphMaxIterations !== (settings.ralphMaxIterations ?? 10);
      const prChanged = autoCreatePr !== (settings.autoCreatePr ?? true);
      const branchChanged = prTargetBranch !== (settings.prTargetBranch ?? "dev");
      const dirChanged = defaultProjectsDirectory !== (settings.defaultProjectsDirectory ?? "");
      const workingMethodChanged =
        defaultWorkingMethod !== (settings.defaultWorkingMethod ?? "auto");
      const loggingEnabledChanged =
        conversationLoggingEnabled !== (settings.conversationLoggingEnabled ?? true);
      const retentionChanged =
        conversationRetentionDays !== (settings.conversationRetentionDays ?? 90);
      const currentDbRuntime = settings.dockerRuntime ?? "auto";
      const dockerRuntimeChanged = dockerRuntime !== currentDbRuntime;
      setHasChanges(
        terminalChanged ||
          sandboxChanged ||
          timeoutChanged ||
          iterationsChanged ||
          prChanged ||
          branchChanged ||
          dirChanged ||
          workingMethodChanged ||
          loggingEnabledChanged ||
          retentionChanged ||
          dockerRuntimeChanged
      );
    }
  }, [
    terminalEmulator,
    ralphSandbox,
    ralphTimeout,
    ralphMaxIterations,
    autoCreatePr,
    prTargetBranch,
    defaultProjectsDirectory,
    defaultWorkingMethod,
    conversationLoggingEnabled,
    conversationRetentionDays,
    dockerRuntime,
    settings,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isSaving = updateMutation.isPending;
  const error = updateMutation.error;

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);
    firstElement?.focus();

    return () => document.removeEventListener("keydown", handleTabKey);
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate(
      {
        terminalEmulator: terminalEmulator || null,
        ralphSandbox,
        ralphTimeout,
        ralphMaxIterations,
        autoCreatePr,
        prTargetBranch: prTargetBranch || "dev",
        defaultProjectsDirectory: defaultProjectsDirectory || null,
        defaultWorkingMethod,
        conversationLoggingEnabled,
        conversationRetentionDays,
        dockerRuntime: dockerRuntime === "auto" ? null : dockerRuntime,
      },
      { onSuccess: onClose }
    );
  }, [
    updateMutation,
    terminalEmulator,
    ralphSandbox,
    ralphTimeout,
    ralphMaxIterations,
    autoCreatePr,
    prTargetBranch,
    defaultProjectsDirectory,
    defaultWorkingMethod,
    conversationLoggingEnabled,
    conversationRetentionDays,
    dockerRuntime,
    onClose,
  ]);

  const handleBuildImage = useCallback(() => {
    buildImageMutation.mutate();
  }, [buildImageMutation]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as SettingsTabId);
  }, []);

  const loading = settingsLoading || terminalsLoading || dockerLoading;

  // =============================================================================
  // RENDER HELPERS - TAB PANELS
  // =============================================================================

  // GeneralTab is now a separate component - handlers for it:
  const handleBrowseDirectory = useCallback(() => {
    setShowDirectoryPicker(true);
  }, []);

  // RalphTab build image state for the component
  const buildImageState = {
    isPending: buildImageMutation.isPending,
    isError: buildImageMutation.isError,
    isSuccess: buildImageMutation.isSuccess,
    error: buildImageMutation.error instanceof Error ? buildImageMutation.error : null,
  };

  // GitTab is now a separate component

  const renderEnterpriseTab = () => (
    <div
      id="tabpanel-enterprise"
      role="tabpanel"
      aria-labelledby="tab-enterprise"
      style={{ display: activeTab === "enterprise" ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Enable Logging Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Enable Conversation Logging
            </label>
            <p className="text-xs text-slate-500">
              Record AI conversations for compliance auditing
            </p>
          </div>
          <button
            onClick={() => setConversationLoggingEnabled(!conversationLoggingEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              conversationLoggingEnabled ? "bg-amber-600" : "bg-slate-700"
            }`}
            role="switch"
            aria-checked={conversationLoggingEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                conversationLoggingEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Retention Period */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">
            Retention Period (days)
          </label>
          <input
            type="number"
            min={7}
            max={365}
            value={conversationRetentionDays}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value)) {
                setConversationRetentionDays(Math.max(7, Math.min(365, value)));
              }
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            disabled={!conversationLoggingEnabled}
          />
          <p className="mt-1 text-xs text-slate-500">
            Conversation logs older than this will be archived (7-365 days)
          </p>
        </div>

        {conversationLoggingEnabled && (
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <p className="text-xs text-slate-400">
              <span className="text-amber-400 font-medium">Enterprise feature:</span> Conversation
              logging creates an audit trail of all AI interactions for SOC2, GDPR, and ISO 27001
              compliance.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 id="settings-modal-title" className="text-lg font-semibold text-gray-100">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-gray-100"
            aria-label="Close settings modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 pt-4">
          <TabNav tabs={SETTINGS_TABS} activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error instanceof Error ? error.message : "An error occurred"}
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-400 py-8">Loading settings...</div>
          ) : (
            <>
              {/* Tab Panels - all rendered but only one visible at a time for state preservation */}
              <GeneralTab
                isActive={activeTab === "general"}
                terminalEmulator={terminalEmulator}
                onTerminalChange={setTerminalEmulator}
                defaultProjectsDirectory={defaultProjectsDirectory}
                onDirectoryChange={setDefaultProjectsDirectory}
                defaultWorkingMethod={defaultWorkingMethod}
                onWorkingMethodChange={setDefaultWorkingMethod}
                availableTerminals={availableTerminals}
                onBrowseDirectory={handleBrowseDirectory}
              />
              <RalphTab
                isActive={activeTab === "ralph"}
                ralphSandbox={ralphSandbox}
                onSandboxChange={setRalphSandbox}
                ralphTimeout={ralphTimeout}
                onTimeoutChange={setRalphTimeout}
                ralphMaxIterations={ralphMaxIterations}
                onMaxIterationsChange={setRalphMaxIterations}
                dockerRuntime={dockerRuntime}
                onDockerRuntimeChange={setDockerRuntime}
                dockerStatus={dockerStatus}
                buildImageState={buildImageState}
                onBuildImage={handleBuildImage}
              />
              <GitTab
                isActive={activeTab === "git"}
                autoCreatePr={autoCreatePr}
                onAutoCreatePrChange={setAutoCreatePr}
                prTargetBranch={prTargetBranch}
                onPrTargetBranchChange={setPrTargetBranch}
              />
              {renderEnterpriseTab()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-slate-800">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Directory Picker Modal */}
      <DirectoryPicker
        isOpen={showDirectoryPicker}
        initialPath={defaultProjectsDirectory || undefined}
        onSelect={(path) => setDefaultProjectsDirectory(path)}
        onClose={() => setShowDirectoryPicker(false)}
      />
    </div>
  );
}
