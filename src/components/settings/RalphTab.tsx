import { ChevronDown, Loader2, AlertTriangle, CheckCircle, Bot } from "lucide-react";
import { DOCKER_RUNTIME_TYPES, type DockerRuntimeSetting } from "../../api/settings";
import {
  sectionHeaderStyles,
  fieldStyles,
  inputStyles,
  statusCardStyles,
  toggleStyles,
  buttonGroupStyles,
} from "./settingsStyles";
import type { SettingsForm } from "./settings-form-opts";

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
  /** TanStack Form instance for settings */
  form: SettingsForm;
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

const MAX_ITERATIONS_OPTIONS = [
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
 * - **Build image button**: Trigger sandbox image build
 *
 * Uses TanStack Form field render props for form state management.
 */
export function RalphTab({
  isActive,
  form,
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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--accent-ai)_15%,transparent)]">
            <Bot size={16} className="text-[var(--accent-ai)]" />
          </div>
          <h3 className={sectionHeaderStyles.title}>Ralph (Autonomous Mode)</h3>
        </div>

        {/* Docker Sandbox Toggle */}
        <form.Field
          name="ralphSandbox"
          children={(field: { state: { value: boolean }; handleChange: (v: boolean) => void }) => (
            <div className={toggleStyles.row}>
              <div className={toggleStyles.info}>
                <div className={toggleStyles.label}>Prefer Docker Sandbox by Default</div>
                <div className={toggleStyles.desc}>
                  When enabled, Docker mode will be pre-selected when starting Ralph. You can always
                  choose either mode.
                </div>
              </div>
              <button
                onClick={() => field.handleChange(!field.state.value)}
                className={toggleStyles.switch(field.state.value)}
                role="switch"
                aria-checked={field.state.value}
                aria-label="Prefer Docker Sandbox by Default"
              >
                <span className={toggleStyles.knob(field.state.value)} />
              </button>
            </div>
          )}
        />

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

        {/* Warning when sandbox enabled but Docker unavailable */}
        <form.Subscribe
          selector={(state: { values: { ralphSandbox: boolean } }) => state.values.ralphSandbox}
          children={(ralphSandbox: boolean) =>
            !dockerStatus?.dockerAvailable && ralphSandbox ? (
              <p className="text-xs text-[var(--status-warning)]">
                Docker is required for sandbox mode. Install Docker to use this feature.
              </p>
            ) : null
          }
        />

        {/* Docker Runtime Selection */}
        {dockerStatus?.dockerAvailable && (
          <form.Field
            name="dockerRuntime"
            children={(field: {
              state: { value: string };
              handleChange: (v: string) => void;
              handleBlur: () => void;
            }) => (
              <div>
                <label htmlFor="docker-runtime-select" className={fieldStyles.label}>
                  Docker Runtime
                </label>
                <div className="relative">
                  <select
                    id="docker-runtime-select"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as DockerRuntimeSetting)}
                    onBlur={field.handleBlur}
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
                    {field.state.value === "auto" ? (
                      <>
                        <CheckCircle size={14} className="text-[var(--status-success)]" />
                        <span className="text-[var(--status-success)]">
                          Detected: {dockerStatus.runtimeType || "Docker"}
                        </span>
                      </>
                    ) : dockerStatus.runtimeType === field.state.value ? (
                      <>
                        <CheckCircle size={14} className="text-[var(--status-success)]" />
                        <span className="text-[var(--status-success)]">Connected</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} className="text-[var(--status-warning)]" />
                        <span className="text-[var(--status-warning)]" role="alert">
                          {field.state.value} not detected (using{" "}
                          {dockerStatus.runtimeType || "default"})
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
                    <span className="block mt-1 text-[var(--accent-ai)]">
                      Lima detected - perfect for Docker Desktop alternatives!
                    </span>
                  )}
                </p>
              </div>
            )}
          />
        )}

        {/* Session Timeout */}
        <form.Field
          name="ralphTimeout"
          children={(field: { state: { value: number }; handleChange: (v: number) => void }) => (
            <div>
              <label className={fieldStyles.label}>Session Timeout</label>
              <div
                className={buttonGroupStyles.container}
                role="group"
                aria-label="Session timeout options"
              >
                {TIMEOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => field.handleChange(option.value)}
                    className={buttonGroupStyles.button(field.state.value === option.value)}
                    aria-pressed={field.state.value === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className={fieldStyles.hint}>
                Ralph session will stop after this duration to prevent runaway processes. Progress
                is saved before timeout.
              </p>
            </div>
          )}
        />

        {/* Max Iterations */}
        <form.Field
          name="ralphMaxIterations"
          children={(field: { state: { value: number }; handleChange: (v: number) => void }) => (
            <div>
              <label className={fieldStyles.label}>Max Iterations</label>
              <div
                className={buttonGroupStyles.container}
                role="group"
                aria-label="Maximum iterations options"
              >
                {MAX_ITERATIONS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => field.handleChange(option.value)}
                    className={buttonGroupStyles.button(field.state.value === option.value)}
                    aria-pressed={field.state.value === option.value}
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
          )}
        />
      </div>
    </div>
  );
}

export default RalphTab;
