import { ChevronDown, Loader2, AlertTriangle, CheckCircle, Clock, Repeat, Bot } from "lucide-react";
import { DOCKER_RUNTIME_TYPES, type DockerRuntimeSetting } from "../../api/settings";
import {
  sectionHeaderStyles,
  fieldStyles,
  inputStyles,
  statusCardStyles,
  toggleStyles,
  buttonGroupStyles,
} from "./settingsStyles";

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
        {/* Section Header */}
        <div className={sectionHeaderStyles.container}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,#a855f7_15%,transparent)]">
            <Bot size={16} className="text-purple-400" />
          </div>
          <h3 className={sectionHeaderStyles.title}>Ralph (Autonomous Mode)</h3>
        </div>

        {/* Docker Sandbox Toggle */}
        <div className={toggleStyles.row}>
          <div className={toggleStyles.info}>
            <div className={toggleStyles.label}>Prefer Docker Sandbox by Default</div>
            <div className={toggleStyles.desc}>
              When enabled, Docker mode will be pre-selected when starting Ralph. You can always
              choose either mode.
            </div>
          </div>
          <button
            onClick={() => onSandboxChange(!ralphSandbox)}
            className={toggleStyles.switch(ralphSandbox)}
            role="switch"
            aria-checked={ralphSandbox}
            aria-label="Prefer Docker Sandbox by Default"
          >
            <span className={toggleStyles.knob(ralphSandbox)} />
          </button>
        </div>

        {/* Docker Status */}
        {dockerStatus && (
          <div className={statusCardStyles.container + " space-y-2"}>
            <div className={statusCardStyles.row}>
              {dockerStatus.dockerAvailable ? (
                <CheckCircle size={14} className="text-[var(--status-success)]" />
              ) : (
                <AlertTriangle size={14} className="text-[var(--status-warning)]" />
              )}
              <span
                className={
                  dockerStatus.dockerAvailable
                    ? "text-[var(--status-success)]"
                    : "text-[var(--status-warning)]"
                }
              >
                Docker: {dockerStatus.dockerAvailable ? "Installed" : "Not found"}
              </span>
            </div>

            {!dockerStatus.dockerAvailable && (
              <div className={statusCardStyles.hintBox}>
                <p className={statusCardStyles.hintTitle}>Install Docker:</p>
                <p className={statusCardStyles.hintList}>
                  Visit{" "}
                  <a
                    href="https://docs.docker.com/get-docker/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent-ai)] hover:underline"
                  >
                    docs.docker.com/get-docker
                  </a>
                </p>
              </div>
            )}

            {dockerStatus.dockerAvailable && (
              <>
                <div className={statusCardStyles.row}>
                  {dockerStatus.dockerRunning ? (
                    <CheckCircle size={14} className="text-[var(--status-success)]" />
                  ) : (
                    <AlertTriangle size={14} className="text-[var(--status-warning)]" />
                  )}
                  <span
                    className={
                      dockerStatus.dockerRunning
                        ? "text-[var(--status-success)]"
                        : "text-[var(--status-warning)]"
                    }
                  >
                    Docker Daemon: {dockerStatus.dockerRunning ? "Running" : "Not running"}
                  </span>
                </div>

                {!dockerStatus.dockerRunning && (
                  <div className={statusCardStyles.hintBox}>
                    <p className={statusCardStyles.hintTitle}>Start Docker:</p>
                    <div className={statusCardStyles.hintList}>
                      <p>
                        • <strong className="text-[var(--text-secondary)]">Mac/Windows:</strong>{" "}
                        Open Docker Desktop
                      </p>
                      <p>
                        • <strong className="text-[var(--text-secondary)]">Linux:</strong>{" "}
                        <code className={statusCardStyles.code}>sudo systemctl start docker</code>
                      </p>
                    </div>
                  </div>
                )}

                {dockerStatus.dockerRunning && (
                  <div className={statusCardStyles.row}>
                    {dockerStatus.imageBuilt ? (
                      <CheckCircle size={14} className="text-[var(--status-success)]" />
                    ) : (
                      <AlertTriangle size={14} className="text-[var(--status-warning)]" />
                    )}
                    <span
                      className={
                        dockerStatus.imageBuilt
                          ? "text-[var(--status-success)]"
                          : "text-[var(--status-warning)]"
                      }
                    >
                      Sandbox Image: {dockerStatus.imageBuilt ? "Ready" : "Not built"}
                    </span>
                  </div>
                )}
              </>
            )}

            {dockerStatus.dockerRunning && !dockerStatus.imageBuilt && (
              <>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  The sandbox image will be built automatically when you first launch Ralph with
                  sandbox enabled. Or you can build it now:
                </p>
                <button
                  onClick={onBuildImage}
                  disabled={buildImageState.isPending}
                  className="mt-2 w-full px-4 py-2.5 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-ai)] hover:opacity-90 disabled:bg-[var(--bg-tertiary)] disabled:from-transparent disabled:to-transparent disabled:text-[var(--text-tertiary)] rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_var(--accent-glow)]"
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
              <p className="text-xs text-[var(--status-error)] mt-1">
                {buildImageState.error instanceof Error
                  ? buildImageState.error.message
                  : "Build failed"}
              </p>
            )}
            {buildImageState.isSuccess && (
              <p className="text-xs text-[var(--status-success)] mt-1">
                Sandbox image built successfully!
              </p>
            )}
          </div>
        )}

        {!dockerStatus?.dockerAvailable && ralphSandbox && (
          <p className="text-xs text-[var(--status-warning)]">
            Docker is required for sandbox mode. Install Docker to use this feature.
          </p>
        )}

        {/* Docker Runtime Selection */}
        {dockerStatus?.dockerAvailable && (
          <div>
            <label htmlFor="docker-runtime-select" className={fieldStyles.label}>
              Docker Runtime
            </label>
            <div className="relative">
              <select
                id="docker-runtime-select"
                value={dockerRuntime}
                onChange={(e) => onDockerRuntimeChange(e.target.value as DockerRuntimeSetting)}
                className={inputStyles.select}
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
              <ChevronDown size={16} className={inputStyles.selectArrow} />
            </div>

            {/* Show detected runtime status */}
            {dockerStatus.dockerRunning && (
              <div className="mt-2 flex items-center gap-2 text-xs" aria-live="polite">
                {dockerRuntime === "auto" ? (
                  <>
                    <CheckCircle size={14} className="text-[var(--status-success)]" />
                    <span className="text-[var(--status-success)]">
                      Detected: {dockerStatus.runtimeType || "Docker"}
                    </span>
                  </>
                ) : dockerStatus.runtimeType === dockerRuntime ? (
                  <>
                    <CheckCircle size={14} className="text-[var(--status-success)]" />
                    <span className="text-[var(--status-success)]">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-[var(--status-warning)]" />
                    <span className="text-[var(--status-warning)]" role="alert">
                      {dockerRuntime} not detected (using {dockerStatus.runtimeType || "default"})
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Show socket path */}
            {dockerStatus.dockerRunning && dockerStatus.socketPath && (
              <p className="mt-1 text-xs text-[var(--text-tertiary)] font-mono truncate">
                Socket: {dockerStatus.socketPath}
              </p>
            )}

            <p className={fieldStyles.hint}>
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
          <div className="flex items-center gap-2.5 mb-3">
            <Clock size={14} className="text-[var(--text-tertiary)]" />
            <label className={fieldStyles.label + " !mb-0"}>Session Timeout</label>
          </div>
          <div
            className={buttonGroupStyles.container}
            role="group"
            aria-label="Session timeout options"
          >
            {TIMEOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onTimeoutChange(option.value)}
                className={buttonGroupStyles.button(ralphTimeout === option.value)}
                aria-pressed={ralphTimeout === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className={fieldStyles.hint}>
            Ralph session will stop after this duration to prevent runaway processes. Progress is
            saved before timeout.
          </p>
        </div>

        {/* Max Iterations */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <Repeat size={14} className="text-[var(--text-tertiary)]" />
            <label className={fieldStyles.label + " !mb-0"}>Max Iterations</label>
          </div>
          <div
            className={buttonGroupStyles.container}
            role="group"
            aria-label="Max iterations options"
          >
            {ITERATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onMaxIterationsChange(option.value)}
                className={buttonGroupStyles.button(ralphMaxIterations === option.value)}
                aria-pressed={ralphMaxIterations === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className={fieldStyles.hint}>
            Maximum number of autonomous iterations before Ralph stops. Higher values allow more
            work but increase token usage.
          </p>
        </div>
      </div>
    </div>
  );
}

export default RalphTab;
