import { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Check, Terminal, Bot, GitBranch, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { useSettings, useUpdateSettings, useAvailableTerminals, useDockerStatus, useBuildSandboxImage } from "../lib/hooks";
import { SUPPORTED_TERMINALS } from "../api/settings";

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch current settings
  const { settings, loading: settingsLoading } = useSettings();
  const { availableTerminals, loading: terminalsLoading } = useAvailableTerminals();
  const { dockerStatus, loading: dockerLoading } = useDockerStatus();
  const updateMutation = useUpdateSettings();
  const buildImageMutation = useBuildSandboxImage();

  const [terminalEmulator, setTerminalEmulator] = useState<string>("");
  const [ralphSandbox, setRalphSandbox] = useState(false);
  const [autoCreatePr, setAutoCreatePr] = useState(true);
  const [prTargetBranch, setPrTargetBranch] = useState("dev");
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize state when settings load
  useEffect(() => {
    if (settings) {
      setTerminalEmulator(settings.terminalEmulator ?? "");
      setRalphSandbox(settings.ralphSandbox ?? false);
      setAutoCreatePr(settings.autoCreatePr ?? true);
      setPrTargetBranch(settings.prTargetBranch ?? "dev");
    }
  }, [settings]);

  // Track changes
  useEffect(() => {
    if (settings) {
      const terminalChanged = terminalEmulator !== (settings.terminalEmulator ?? "");
      const sandboxChanged = ralphSandbox !== (settings.ralphSandbox ?? false);
      const prChanged = autoCreatePr !== (settings.autoCreatePr ?? true);
      const branchChanged = prTargetBranch !== (settings.prTargetBranch ?? "dev");
      setHasChanges(terminalChanged || sandboxChanged || prChanged || branchChanged);
    }
  }, [terminalEmulator, ralphSandbox, autoCreatePr, prTargetBranch, settings]);

  const isSaving = updateMutation.isPending;
  const error = updateMutation.error;

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
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

  const handleSave = () => {
    updateMutation.mutate(
      {
        terminalEmulator: terminalEmulator || null,
        ralphSandbox,
        autoCreatePr,
        prTargetBranch: prTargetBranch || "dev",
      },
      { onSuccess: onClose }
    );
  };

  const handleBuildImage = () => {
    buildImageMutation.mutate();
  };

  const isTerminalAvailable = (cmd: string) => {
    return availableTerminals.includes(cmd);
  };

  const loading = settingsLoading || terminalsLoading || dockerLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-100">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-gray-100"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error instanceof Error ? error.message : "An error occurred"}
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-400 py-8">
              Loading settings...
            </div>
          ) : (
            <>
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
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Preferred Terminal Emulator
                  </label>
                  <div className="relative">
                    <select
                      value={terminalEmulator}
                      onChange={(e) => setTerminalEmulator(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                    Used when clicking "Start Work" on a ticket. Auto-detect will
                    try Ghostty first, then fall back to other installed terminals.
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

              {/* Ralph Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Bot size={18} className="text-purple-400" />
                  <h3 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">
                    Ralph (Autonomous Mode)
                  </h3>
                </div>

                {/* Docker Sandbox Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Docker Sandbox
                    </label>
                    <p className="text-xs text-slate-500">
                      Run Ralph in an isolated Docker container for safety
                    </p>
                  </div>
                  <button
                    onClick={() => setRalphSandbox(!ralphSandbox)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      ralphSandbox ? "bg-purple-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        ralphSandbox ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Docker Status */}
                {dockerStatus && (
                  <div className="mt-3 p-3 bg-slate-800/50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      {dockerStatus.dockerAvailable ? (
                        <CheckCircle size={14} className="text-green-400" />
                      ) : (
                        <AlertTriangle size={14} className="text-yellow-400" />
                      )}
                      <span className={dockerStatus.dockerAvailable ? "text-green-400" : "text-yellow-400"}>
                        Docker: {dockerStatus.dockerAvailable ? "Installed" : "Not found"}
                      </span>
                    </div>

                    {!dockerStatus.dockerAvailable && (
                      <div className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-400">
                        <p className="font-medium text-slate-300 mb-1">Install Docker:</p>
                        <p>Visit <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">docs.docker.com/get-docker</a></p>
                      </div>
                    )}

                    {dockerStatus.dockerAvailable && (
                      <>
                        <div className="flex items-center gap-2 text-xs">
                          {dockerStatus.dockerRunning ? (
                            <CheckCircle size={14} className="text-green-400" />
                          ) : (
                            <AlertTriangle size={14} className="text-yellow-400" />
                          )}
                          <span className={dockerStatus.dockerRunning ? "text-green-400" : "text-yellow-400"}>
                            Docker Daemon: {dockerStatus.dockerRunning ? "Running" : "Not running"}
                          </span>
                        </div>

                        {!dockerStatus.dockerRunning && (
                          <div className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-400">
                            <p className="font-medium text-slate-300 mb-1">Start Docker:</p>
                            <ul className="space-y-1 ml-2">
                              <li>• <span className="text-slate-300">Mac/Windows:</span> Open Docker Desktop</li>
                              <li>• <span className="text-slate-300">Linux:</span> <code className="bg-slate-800 px-1 rounded">sudo systemctl start docker</code></li>
                            </ul>
                          </div>
                        )}

                        {dockerStatus.dockerRunning && (
                          <div className="flex items-center gap-2 text-xs">
                            {dockerStatus.imageBuilt ? (
                              <CheckCircle size={14} className="text-green-400" />
                            ) : (
                              <AlertTriangle size={14} className="text-yellow-400" />
                            )}
                            <span className={dockerStatus.imageBuilt ? "text-green-400" : "text-yellow-400"}>
                              Sandbox Image: {dockerStatus.imageBuilt ? "Ready" : "Not built"}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {dockerStatus.dockerRunning && !dockerStatus.imageBuilt && (
                      <>
                        <p className="text-xs text-slate-400 mt-2">
                          The sandbox image will be built automatically when you first launch Ralph with sandbox enabled.
                          Or you can build it now:
                        </p>
                        <button
                          onClick={handleBuildImage}
                          disabled={buildImageMutation.isPending}
                          className="mt-2 w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          {buildImageMutation.isPending ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Building Image (this may take a few minutes)...
                            </>
                          ) : (
                            "Build Sandbox Image Now"
                          )}
                        </button>
                      </>
                    )}
                    {buildImageMutation.isError && (
                      <p className="text-xs text-red-400 mt-1">
                        {buildImageMutation.error instanceof Error ? buildImageMutation.error.message : "Build failed"}
                      </p>
                    )}
                    {buildImageMutation.isSuccess && (
                      <p className="text-xs text-green-400 mt-1">
                        Sandbox image built successfully!
                      </p>
                    )}
                  </div>
                )}

                {!dockerStatus?.dockerAvailable && ralphSandbox && (
                  <p className="mt-2 text-xs text-yellow-400">
                    Docker is required for sandbox mode. Install Docker to use this feature.
                  </p>
                )}
              </div>

              {/* Git / PR Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch size={18} className="text-green-400" />
                  <h3 className="text-sm font-semibold text-gray-100 uppercase tracking-wide">
                    Git & Pull Requests
                  </h3>
                </div>

                {/* Auto-create PR Toggle */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Auto-create Pull Request
                    </label>
                    <p className="text-xs text-slate-500">
                      Create a PR when Claude/Ralph completes work
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoCreatePr(!autoCreatePr)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoCreatePr ? "bg-green-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoCreatePr ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* PR Target Branch */}
                <div className="mt-3">
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    PR Target Branch
                  </label>
                  <input
                    type="text"
                    value={prTargetBranch}
                    onChange={(e) => setPrTargetBranch(e.target.value)}
                    placeholder="dev"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Feature branches will target this branch for PRs (typically "dev" or "main")
                  </p>
                </div>
              </div>
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
    </div>
  );
}
