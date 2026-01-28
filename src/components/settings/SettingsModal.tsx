import { useState, useEffect, useRef, useCallback } from "react";
import { X, Bot, GitBranch, Settings, Building2 } from "lucide-react";
import { useForm } from "@tanstack/react-form-start";
import {
  useSettings,
  useUpdateSettings,
  useAvailableTerminals,
  useDockerStatus,
  useBuildSandboxImage,
} from "../../lib/hooks";
import DirectoryPicker from "../DirectoryPicker";
import { TabNav, type Tab } from "./TabNav";
import { GeneralTab } from "./GeneralTab";
import { RalphTab } from "./RalphTab";
import { GitTab } from "./GitTab";
import { EnterpriseTab } from "./EnterpriseTab";
import { settingsFormOpts } from "./settings-form-opts";
import { settingsFormSchema, type SettingsFormData } from "./settings-form-schema";

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
 * Uses TanStack Form for form state management with Zod schema validation.
 * Tab contents are rendered inline with CSS display toggling for state preservation.
 */
export default function SettingsModal({ onClose }: SettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");

  // Fetch current settings and external data
  const { settings, loading: settingsLoading } = useSettings();
  const { availableTerminals, loading: terminalsLoading } = useAvailableTerminals();
  const { dockerStatus, loading: dockerLoading } = useDockerStatus();
  const updateMutation = useUpdateSettings();
  const buildImageMutation = useBuildSandboxImage();

  // Directory picker state (UI-only, not form data)
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);

  // TanStack Form - replaces 11 useState hooks + useEffect sync + hasChanges useMemo
  const form = useForm({
    ...settingsFormOpts,
    defaultValues: {
      terminalEmulator: settings?.terminalEmulator ?? "",
      defaultProjectsDirectory: settings?.defaultProjectsDirectory ?? "",
      defaultWorkingMethod:
        (settings?.defaultWorkingMethod as SettingsFormData["defaultWorkingMethod"]) ?? "auto",
      ralphSandbox: settings?.ralphSandbox ?? false,
      ralphTimeout: settings?.ralphTimeout ?? 3600,
      ralphMaxIterations: settings?.ralphMaxIterations ?? 20,
      dockerRuntime: (settings?.dockerRuntime as SettingsFormData["dockerRuntime"]) ?? "auto",
      autoCreatePr: settings?.autoCreatePr ?? true,
      prTargetBranch: settings?.prTargetBranch ?? "dev",
      conversationLoggingEnabled: settings?.conversationLoggingEnabled ?? true,
      conversationRetentionDays: settings?.conversationRetentionDays ?? 90,
      enableWorktreeSupport: settings?.enableWorktreeSupport ?? false,
      enableContextAwareToolFiltering: settings?.enableContextAwareToolFiltering ?? false,
    },
    validators: {
      onChange: settingsFormSchema,
    },
  });

  // Reset form when settings change (e.g., after query refetch)
  // Note: form instance from useForm is stable - only settings changes trigger reset
  useEffect(() => {
    if (settings) {
      form.reset({
        terminalEmulator: settings.terminalEmulator ?? "",
        defaultProjectsDirectory: settings.defaultProjectsDirectory ?? "",
        defaultWorkingMethod:
          (settings.defaultWorkingMethod as SettingsFormData["defaultWorkingMethod"]) ?? "auto",
        ralphSandbox: settings.ralphSandbox ?? false,
        ralphTimeout: settings.ralphTimeout ?? 3600,
        ralphMaxIterations: settings.ralphMaxIterations ?? 20,
        dockerRuntime: (settings.dockerRuntime as SettingsFormData["dockerRuntime"]) ?? "auto",
        autoCreatePr: settings.autoCreatePr ?? true,
        prTargetBranch: settings.prTargetBranch ?? "dev",
        conversationLoggingEnabled: settings.conversationLoggingEnabled ?? true,
        conversationRetentionDays: settings.conversationRetentionDays ?? 90,
        enableWorktreeSupport: settings.enableWorktreeSupport ?? false,
        enableContextAwareToolFiltering: settings.enableContextAwareToolFiltering ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form instance is stable from useForm
  }, [settings]);

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
    const values = form.state.values;
    updateMutation.mutate(
      {
        terminalEmulator: values.terminalEmulator || null,
        ralphSandbox: values.ralphSandbox,
        ralphTimeout: values.ralphTimeout,
        ralphMaxIterations: values.ralphMaxIterations,
        autoCreatePr: values.autoCreatePr,
        prTargetBranch: values.prTargetBranch || "dev",
        defaultProjectsDirectory: values.defaultProjectsDirectory || null,
        defaultWorkingMethod: values.defaultWorkingMethod,
        conversationLoggingEnabled: values.conversationLoggingEnabled,
        conversationRetentionDays: values.conversationRetentionDays,
        dockerRuntime: values.dockerRuntime === "auto" ? null : values.dockerRuntime,
        enableWorktreeSupport: values.enableWorktreeSupport,
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          // Error is automatically captured in updateMutation.error for display
          // Log for debugging but don't throw - let UI show the error
          console.error("[SettingsModal] Failed to save settings:", err);
        },
      }
    );
  }, [updateMutation, form.state.values, onClose]);

  const handleBuildImage = useCallback(() => {
    buildImageMutation.mutate(undefined, {
      onError: (err) => {
        // Error is automatically captured in buildImageMutation.error for display
        console.error("[SettingsModal] Failed to build sandbox image:", err);
      },
    });
  }, [buildImageMutation]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as SettingsTabId);
  }, []);

  const loading = settingsLoading || terminalsLoading || dockerLoading;

  // Directory picker handlers
  const handleBrowseDirectory = useCallback(() => {
    setShowDirectoryPicker(true);
  }, []);

  const handleDirectorySelect = useCallback(
    (path: string) => {
      form.setFieldValue("defaultProjectsDirectory", path);
    },
    [form]
  );

  // RalphTab build image state for the component
  const buildImageState = {
    isPending: buildImageMutation.isPending,
    isError: buildImageMutation.isError,
    isSuccess: buildImageMutation.isSuccess,
    error: buildImageMutation.error instanceof Error ? buildImageMutation.error : null,
  };

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
                form={form}
                availableTerminals={availableTerminals}
                onBrowseDirectory={handleBrowseDirectory}
              />
              <RalphTab
                isActive={activeTab === "ralph"}
                form={form}
                dockerStatus={dockerStatus}
                buildImageState={buildImageState}
                onBuildImage={handleBuildImage}
              />
              <GitTab isActive={activeTab === "git"} form={form} />
              <EnterpriseTab isActive={activeTab === "enterprise"} form={form} />
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
            <form.Subscribe
              selector={(state) => state.isDirty && state.canSubmit}
              children={(canSave) => (
                <button
                  onClick={handleSave}
                  disabled={isSaving || !canSave}
                  className="px-4 py-2 rounded-lg font-medium transition-all disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] disabled:shadow-none"
                  style={{
                    background:
                      isSaving || !canSave
                        ? undefined
                        : "linear-gradient(135deg, var(--accent-primary), var(--accent-ai))",
                    boxShadow: isSaving || !canSave ? undefined : "0 4px 12px var(--accent-glow)",
                  }}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              )}
            />
          </div>
        </div>
      </div>

      {/* Directory Picker Modal */}
      <DirectoryPicker
        isOpen={showDirectoryPicker}
        initialPath={form.state.values.defaultProjectsDirectory || undefined}
        onSelect={handleDirectorySelect}
        onClose={() => setShowDirectoryPicker(false)}
      />
    </div>
  );
}
