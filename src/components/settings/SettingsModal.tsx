import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { EnterpriseTab } from "./EnterpriseTab";

interface SettingsModalProps {
  /** Handler to close the modal */
  onClose: () => void;
}

/** Settings tab identifiers */
type SettingsTabId = "general" | "ralph" | "git" | "enterprise";

const SETTINGS_TABS: Tab[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "ralph", label: "Ralph", icon: Bot },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "enterprise", label: "Enterprise", icon: Building2 },
];

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
  const [dockerRuntime, setDockerRuntime] = useState<DockerRuntimeSetting>("auto");

  // Form state - Git tab
  const [autoCreatePr, setAutoCreatePr] = useState(true);
  const [prTargetBranch, setPrTargetBranch] = useState("dev");

  // Form state - Enterprise tab
  const [conversationLoggingEnabled, setConversationLoggingEnabled] = useState(true);
  const [conversationRetentionDays, setConversationRetentionDays] = useState(90);

  // Initialize state when settings load
  /* eslint-disable react-hooks/set-state-in-effect -- syncing external data to state */
  useEffect(() => {
    if (settings) {
      setTerminalEmulator(settings.terminalEmulator ?? "");
      setRalphSandbox(settings.ralphSandbox ?? false);
      setRalphTimeout(settings.ralphTimeout ?? 3600);
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

  // Compute change tracking with useMemo (avoids extra re-render from useEffect+setState)
  const hasChanges = useMemo(() => {
    if (!settings) return false;

    return (
      terminalEmulator !== (settings.terminalEmulator ?? "") ||
      ralphSandbox !== (settings.ralphSandbox ?? false) ||
      ralphTimeout !== (settings.ralphTimeout ?? 3600) ||
      autoCreatePr !== (settings.autoCreatePr ?? true) ||
      prTargetBranch !== (settings.prTargetBranch ?? "dev") ||
      defaultProjectsDirectory !== (settings.defaultProjectsDirectory ?? "") ||
      defaultWorkingMethod !== (settings.defaultWorkingMethod ?? "auto") ||
      conversationLoggingEnabled !== (settings.conversationLoggingEnabled ?? true) ||
      conversationRetentionDays !== (settings.conversationRetentionDays ?? 90) ||
      dockerRuntime !== (settings.dockerRuntime ?? "auto")
    );
  }, [
    terminalEmulator,
    ralphSandbox,
    ralphTimeout,
    autoCreatePr,
    prTargetBranch,
    defaultProjectsDirectory,
    defaultWorkingMethod,
    conversationLoggingEnabled,
    conversationRetentionDays,
    dockerRuntime,
    settings,
  ]);

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

  // All tabs are now separate components

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal - with theme-colored glow effect around the modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary), var(--accent-ai))",
                boxShadow: "0 4px 12px var(--accent-glow)",
              }}
            >
              <Settings size={20} className="text-white" aria-hidden="true" />
            </div>
            <h2
              id="settings-modal-title"
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
        <div className="max-h-[520px] overflow-y-auto py-5 px-6">
          {error && (
            <div className="mb-4 p-3 bg-[var(--status-error)]/20 border border-[var(--status-error)]/50 rounded-lg text-[var(--status-error)] text-sm">
              {error instanceof Error ? error.message : "An error occurred"}
            </div>
          )}

          {loading ? (
            <div className="text-center text-[var(--text-secondary)] py-8">Loading settings...</div>
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
              <EnterpriseTab
                isActive={activeTab === "enterprise"}
                conversationLoggingEnabled={conversationLoggingEnabled}
                onLoggingEnabledChange={setConversationLoggingEnabled}
                conversationRetentionDays={conversationRetentionDays}
                onRetentionDaysChange={setConversationRetentionDays}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-primary)]">
          <span className="text-xs text-[var(--text-tertiary)]">Changes will be saved locally</span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="px-4 py-2 rounded-lg font-medium transition-all disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] disabled:shadow-none"
              style={{
                background:
                  isSaving || !hasChanges
                    ? undefined
                    : "linear-gradient(135deg, var(--accent-primary), var(--accent-ai))",
                boxShadow: isSaving || !hasChanges ? undefined : "0 4px 12px var(--accent-glow)",
              }}
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
