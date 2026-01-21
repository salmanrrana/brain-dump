import { ChevronDown, Loader2, AlertTriangle, CheckCircle, Clock, Repeat } from "lucide-react";
import { DOCKER_RUNTIME_TYPES, type DockerRuntimeSetting } from "../../api/settings";

// =============================================================================
// TYPES
// =============================================================================

/** Docker status information from the API */
export interface DockerStatus {
  dockerAvailable: boolean;
  dockerRunning: boolean;
  imageBuilt: boolean;
  imageTag: string;
  runtimeType: string | null;
  socketPath: string | null;
}

/** Build image mutation state */
export interface BuildImageState {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
}

export interface RalphTabProps {
  /** Whether this tab is currently visible */
  isActive: boolean;
  /** Current sandbox mode setting */
  ralphSandbox: boolean;
  /** Callback when sandbox setting changes */
  onSandboxChange: (value: boolean) => void;
  /** Current session timeout in seconds */
  ralphTimeout: number;
  /** Callback when timeout changes */
  onTimeoutChange: (value: number) => void;
  /** Current max iterations setting */
  ralphMaxIterations: number;
  /** Callback when max iterations changes */
  onMaxIterationsChange: (value: number) => void;
  /** Current Docker runtime setting */
  dockerRuntime: DockerRuntimeSetting;
  /** Callback when Docker runtime changes */
  onDockerRuntimeChange: (value: DockerRuntimeSetting) => void;
  /** Docker status information */
  dockerStatus: DockerStatus | null;
  /** Build image mutation state */
  buildImageState: BuildImageState;
  /** Callback to trigger image build */
  onBuildImage: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TIMEOUT_OPTIONS = [
  { label: "30m", value: 1800 },
  { label: "1h", value: 3600 },
  { label: "2h", value: 7200 },
  { label: "4h", value: 14400 },
  { label: "8h", value: 28800 },
];

const ITERATION_OPTIONS = [
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
];

// =============================================================================
// RALPH TAB COMPONENT
// =============================================================================

/**
 * RalphTab - Settings tab for Ralph autonomous agent configuration.
 *
 * Features:
 * - **Docker sandbox toggle**: Enable/disable Docker sandbox mode
 * - **Docker status**: Shows installation, daemon, and image status
 * - **Docker runtime selection**: Choose between detected runtimes
 * - **Session timeout**: Button group for timeout duration
 * - **Max iterations**: Button group for iteration limit
 * - **Build image button**: Trigger sandbox image build
 *
 * All values are controlled via props with change callbacks to parent.
 */
export function RalphTab({
  isActive,
  ralphSandbox,
  onSandboxChange,
  ralphTimeout,
  onTimeoutChange,
  ralphMaxIterations,
  onMaxIterationsChange,
  dockerRuntime,
  onDockerRuntimeChange,
  dockerStatus,
  buildImageState,
  onBuildImage,
}: RalphTabProps) {
  return (
    <div
      id="tabpanel-ralph"
      role="tabpanel"
      aria-labelledby="tab-ralph"
      hidden={!isActive}
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Docker Sandbox Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Prefer Docker Sandbox by Default
            </label>
            <p className="text-xs text-slate-500">
              When enabled, Docker mode will be pre-selected when starting Ralph. You can always
              choose either mode.
            </p>
          </div>
          <button
            onClick={() => onSandboxChange(!ralphSandbox)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              ralphSandbox ? "bg-purple-600" : "bg-slate-700"
            }`}
            role="switch"
            aria-checked={ralphSandbox}
            aria-label="Prefer Docker Sandbox by Default"
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
          <div className="p-3 bg-slate-800/50 rounded-lg space-y-2">
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
                <p>
                  Visit{" "}
                  <a
                    href="https://docs.docker.com/get-docker/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    docs.docker.com/get-docker
                  </a>
                </p>
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
                  <span
                    className={dockerStatus.dockerRunning ? "text-green-400" : "text-yellow-400"}
                  >
                    Docker Daemon: {dockerStatus.dockerRunning ? "Running" : "Not running"}
                  </span>
                </div>

                {!dockerStatus.dockerRunning && (
                  <div className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-400">
                    <p className="font-medium text-slate-300 mb-1">Start Docker:</p>
                    <ul className="space-y-1 ml-2">
                      <li>
                        • <span className="text-slate-300">Mac/Windows:</span> Open Docker Desktop
                      </li>
                      <li>
                        • <span className="text-slate-300">Linux:</span>{" "}
                        <code className="bg-slate-800 px-1 rounded">
                          sudo systemctl start docker
                        </code>
                      </li>
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
                    <span
                      className={dockerStatus.imageBuilt ? "text-green-400" : "text-yellow-400"}
                    >
                      Sandbox Image: {dockerStatus.imageBuilt ? "Ready" : "Not built"}
                    </span>
                  </div>
                )}
              </>
            )}

            {dockerStatus.dockerRunning && !dockerStatus.imageBuilt && (
              <>
                <p className="text-xs text-slate-400 mt-2">
                  The sandbox image will be built automatically when you first launch Ralph with
                  sandbox enabled. Or you can build it now:
                </p>
                <button
                  onClick={onBuildImage}
                  disabled={buildImageState.isPending}
                  className="mt-2 w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {buildImageState.isPending ? (
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
            {buildImageState.isError && (
              <p className="text-xs text-red-400 mt-1">
                {buildImageState.error instanceof Error
                  ? buildImageState.error.message
                  : "Build failed"}
              </p>
            )}
            {buildImageState.isSuccess && (
              <p className="text-xs text-green-400 mt-1">Sandbox image built successfully!</p>
            )}
          </div>
        )}

        {!dockerStatus?.dockerAvailable && ralphSandbox && (
          <p className="text-xs text-yellow-400">
            Docker is required for sandbox mode. Install Docker to use this feature.
          </p>
        )}

        {/* Docker Runtime Selection */}
        {dockerStatus?.dockerAvailable && (
          <div>
            <label
              htmlFor="docker-runtime-select"
              className="block text-sm font-medium text-slate-400 mb-1"
            >
              Docker Runtime
            </label>
            <div className="relative">
              <select
                id="docker-runtime-select"
                value={dockerRuntime}
                onChange={(e) => onDockerRuntimeChange(e.target.value as DockerRuntimeSetting)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none "
              >
                {DOCKER_RUNTIME_TYPES.map((runtime) => (
                  <option key={runtime} value={runtime}>
                    {runtime === "auto"
                      ? "Auto-detect (recommended)"
                      : runtime === "docker-desktop"
                        ? "Docker Desktop"
                        : runtime.charAt(0).toUpperCase() + runtime.slice(1)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>

            {/* Show detected runtime status */}
            {dockerStatus.dockerRunning && (
              <div className="mt-2 flex items-center gap-2 text-xs" aria-live="polite">
                {dockerRuntime === "auto" ? (
                  <>
                    <CheckCircle size={14} className="text-green-400" />
                    <span className="text-green-400">
                      Detected: {dockerStatus.runtimeType || "Docker"}
                    </span>
                  </>
                ) : dockerStatus.runtimeType === dockerRuntime ? (
                  <>
                    <CheckCircle size={14} className="text-green-400" />
                    <span className="text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-yellow-400" />
                    <span className="text-yellow-400" role="alert">
                      {dockerRuntime} not detected (using {dockerStatus.runtimeType || "default"})
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Show socket path */}
            {dockerStatus.dockerRunning && dockerStatus.socketPath && (
              <p className="mt-1 text-xs text-slate-500 font-mono truncate">
                Socket: {dockerStatus.socketPath}
              </p>
            )}

            <p className="mt-2 text-xs text-slate-500">
              Select which Docker runtime to use. Auto-detect works for most setups.
              {dockerStatus.runtimeType === "lima" && (
                <span className="block mt-1 text-purple-400">
                  Lima detected - perfect for Docker Desktop alternatives!
                </span>
              )}
            </p>
          </div>
        )}

        {/* Session Timeout */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-slate-400" />
            <label className="block text-sm font-medium text-slate-300">Session Timeout</label>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Session timeout options">
            {TIMEOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onTimeoutChange(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  ralphTimeout === option.value
                    ? "bg-purple-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
                aria-pressed={ralphTimeout === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Ralph session will stop after this duration to prevent runaway processes. Progress is
            saved before timeout.
          </p>
        </div>

        {/* Max Iterations */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Repeat size={14} className="text-slate-400" />
            <label className="block text-sm font-medium text-slate-300">Max Iterations</label>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Max iterations options">
            {ITERATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onMaxIterationsChange(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  ralphMaxIterations === option.value
                    ? "bg-purple-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
                aria-pressed={ralphMaxIterations === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Maximum number of autonomous iterations before Ralph stops. Higher values allow more
            work but increase token usage.
          </p>
        </div>
      </div>
    </div>
  );
}

export default RalphTab;
