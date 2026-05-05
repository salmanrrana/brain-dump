import { getRalphPrompt, type RalphPromptProfile } from "./ralph-prompts";
import type { ConcreteLaunchModelSelection } from "../lib/launch-model-catalog";

// ============================================================================
// TYPES
// ============================================================================

export type RalphAiBackend = "claude" | "opencode" | "codex" | "cursor-agent" | "pi";

// Resource limit configuration for Docker sandbox
export interface DockerResourceLimits {
  memory: string; // e.g., "2g" for 2GB
  cpus: string; // e.g., "1.5" for 1.5 cores
  pidsLimit: number; // e.g., 256
}

// Project origin info for Docker label tracking
export interface ProjectOriginInfo {
  projectId: string;
  projectName: string;
  epicId?: string | undefined;
  epicTitle?: string | undefined;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_RESOURCE_LIMITS: DockerResourceLimits = {
  memory: "2g",
  cpus: "1.5",
  pidsLimit: 256,
};

const RALPH_ENV_EXPORTS = `export RALPH_SESSION=1`;

function escapeForBashDoubleQuote(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/!/g, "\\!");
}

function buildLaunchModelEnvExports(
  modelSelection: ConcreteLaunchModelSelection | undefined
): string {
  if (!modelSelection) {
    return "";
  }

  return `export BRAIN_DUMP_LAUNCH_MODEL_PROVIDER="${escapeForBashDoubleQuote(modelSelection.provider)}"
export BRAIN_DUMP_LAUNCH_MODEL="${escapeForBashDoubleQuote(modelSelection.modelName)}"`;
}

// Configuration for each AI backend's CLI integration.
// Add new backends here instead of extending ternary chains throughout the file.
interface AiBackendConfig {
  displayName: string;
  preflightCheck: string;
  invocation: string;
}

const AI_BACKEND_CONFIGS: Record<RalphAiBackend, AiBackendConfig> = {
  claude: {
    displayName: "Claude",
    preflightCheck: `
if ! command -v claude >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Claude CLI not found in PATH\\033[0m"
  exit 1
fi
`,
    invocation: `  # Run Claude in print mode (-p) so it exits after completion
  # This allows the bash loop to continue to the next iteration
  claude --dangerously-skip-permissions --output-format text -p "$(cat "$PROMPT_FILE")"`,
  },
  opencode: {
    displayName: "OpenCode",
    // The Ralph loop requires a headless, non-interactive OpenCode entrypoint
    // that exits after one iteration. OpenCode's \`run\` subcommand is the
    // documented one-shot/headless mode (parity with \`claude -p\` and
    // \`codex exec\`); the bare \`opencode "<path>" --prompt "..."\` form
    // launches the interactive TUI with the prompt pre-filled, which never
    // returns control to the parent shell and breaks the loop.
    // Refs: https://opencode.ai/docs/cli/
    preflightCheck: `
if ! command -v opencode >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ OpenCode CLI not found in PATH\\033[0m"
  echo "Install OpenCode: https://opencode.ai"
  exit 1
fi

# Probe for the 'run' subcommand — it is the non-interactive entrypoint
# Ralph relies on. Older OpenCode builds without 'run' leave us in TUI mode
# and silently break the outer bash loop.
if ! opencode run --help >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Installed OpenCode CLI is missing the 'run' subcommand\\033[0m"
  echo -e "\\033[0;33m  Ralph requires 'opencode run' for non-interactive headless runs.\\033[0m"
  echo -e "\\033[0;33m  Upgrade OpenCode: https://opencode.ai\\033[0m"
  exit 1
fi
`,
    invocation: `  export OPENCODE=1
  # Run OpenCode non-interactively via 'run' so it exits after one iteration,
  # letting the outer bash loop advance to the next ticket in the same
  # terminal window. This mirrors the 'claude -p' / 'cursor-agent -p' /
  # 'codex exec' pattern used for the other backends.
  OPENCODE_MODEL_ARGS=()
  if [ -n "\${BRAIN_DUMP_LAUNCH_MODEL_PROVIDER:-}" ] && [ -n "\${BRAIN_DUMP_LAUNCH_MODEL:-}" ]; then
    OPENCODE_MODEL_ARGS+=(--model "\${BRAIN_DUMP_LAUNCH_MODEL_PROVIDER}/\${BRAIN_DUMP_LAUNCH_MODEL}")
  fi
  opencode run "\${OPENCODE_MODEL_ARGS[@]}" "$(cat "$PROMPT_FILE")"`,
  },
  codex: {
    displayName: "Codex",
    // The Ralph loop requires a headless, non-interactive Codex entrypoint that
    // exits after one iteration AND does not prompt for approvals. Codex's
    // \`exec\` subcommand is the non-interactive entrypoint; the combined
    // \`--dangerously-bypass-approvals-and-sandbox\` flag disables BOTH the
    // approval prompts AND the filesystem sandbox, matching Claude's
    // \`--dangerously-skip-permissions\` posture. Running Codex under its
    // sandbox during Ralph recreates the permission-prompt nightmare we are
    // eliminating (git/pnpm/MCP access outside the workspace would fail).
    // Refs: https://developers.openai.com/codex/config-advanced
    preflightCheck: `
if ! command -v codex >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Codex CLI not found in PATH\\033[0m"
  exit 1
fi

# Use 'codex exec --help' exit status as the real capability probe for the
# subcommand (grepping 'codex --help' output for the word 'exec' would match
# arbitrary prose). Capture output so we can scan it for the bypass flag.
if ! CODEX_EXEC_HELP_OUTPUT="$(codex exec --help 2>&1)"; then
  echo -e "\\033[0;31m❌ Installed Codex CLI is missing the 'exec' subcommand\\033[0m"
  echo -e "\\033[0;33m  Ralph requires 'codex exec' for non-interactive headless runs.\\033[0m"
  echo -e "\\033[0;33m  Upgrade Codex: https://developers.openai.com/codex/config-advanced\\033[0m"
  exit 1
fi

if ! printf '%s\\n' "$CODEX_EXEC_HELP_OUTPUT" | grep -q -- "--dangerously-bypass-approvals-and-sandbox"; then
  echo -e "\\033[0;31m❌ Installed Codex CLI is missing --dangerously-bypass-approvals-and-sandbox\\033[0m"
  echo -e "\\033[0;33m  Ralph requires this flag so Codex runs without approval prompts\\033[0m"
  echo -e "\\033[0;33m  and without the filesystem sandbox (parity with Claude's posture).\\033[0m"
  echo -e "\\033[0;33m  Upgrade Codex: https://developers.openai.com/codex/config-advanced\\033[0m"
  exit 1
fi
`,
    invocation: `  export CODEX=1
  # Run Codex non-interactively via 'exec' so it exits after one iteration,
  # letting the outer bash loop advance to the next ticket in the same
  # terminal window. --dangerously-bypass-approvals-and-sandbox disables both
  # approval prompts AND Codex's filesystem sandbox (parity with Claude's
  # --dangerously-skip-permissions posture). We intentionally do NOT run
  # Codex under its sandbox during Ralph; see docs/environments/codex.md.
  CODEX_MODEL_ARGS=()
  if [ -n "\${BRAIN_DUMP_LAUNCH_MODEL:-}" ]; then
    CODEX_MODEL_ARGS+=(--model "\${BRAIN_DUMP_LAUNCH_MODEL}")
  fi
  codex exec "\${CODEX_MODEL_ARGS[@]}" --dangerously-bypass-approvals-and-sandbox "$(cat "$PROMPT_FILE")"`,
  },
  "cursor-agent": {
    displayName: "Cursor Agent",
    preflightCheck: `
CURSOR_AGENT_BIN=""
if command -v agent >/dev/null 2>&1 && agent --help 2>&1 | grep -qi "Cursor Agent"; then
  CURSOR_AGENT_BIN="agent"
elif [ -x "$HOME/.local/bin/agent" ] && "$HOME/.local/bin/agent" --help 2>&1 | grep -qi "Cursor Agent"; then
  CURSOR_AGENT_BIN="$HOME/.local/bin/agent"
elif command -v cursor-agent >/dev/null 2>&1 && cursor-agent --help 2>&1 | grep -qi "Cursor Agent"; then
  CURSOR_AGENT_BIN="cursor-agent"
fi

if [ -z "$CURSOR_AGENT_BIN" ]; then
  echo -e "\\033[0;31m❌ Cursor Agent CLI not found in PATH\\033[0m"
  echo "Install: curl https://cursor.com/install -fsS | bash"
  exit 1
fi
`,
    invocation: `  export CURSOR_AGENT=1
  # Run Cursor Agent in headless mode with prompt
  CURSOR_AGENT_MODEL_ARGS=()
  if [ -n "\${BRAIN_DUMP_LAUNCH_MODEL:-}" ]; then
    CURSOR_AGENT_MODEL_ARGS+=(--model "\${BRAIN_DUMP_LAUNCH_MODEL}")
  fi
  "$CURSOR_AGENT_BIN" --force --approve-mcps --trust "\${CURSOR_AGENT_MODEL_ARGS[@]}" -p "$(cat "$PROMPT_FILE")"`,
  },
  pi: {
    displayName: "Pi",
    preflightCheck: `
if ! command -v pi >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Pi CLI not found in PATH\\033[0m"
  echo -e "\\033[0;33m  Install Pi CLI and ensure the 'pi' command is available before launching Ralph.\\033[0m"
  exit 1
fi

if ! PI_HELP_OUTPUT="$(pi --help 2>&1)"; then
  echo -e "\\033[0;31m❌ Unable to inspect Pi CLI help output\\033[0m"
  echo -e "\\033[0;33m  Ralph requires a Pi CLI build with non-interactive prompt support.\\033[0m"
  exit 1
fi

if ! printf '%s\\n' "$PI_HELP_OUTPUT" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
  echo -e "\\033[0;31m❌ Installed Pi CLI is missing prompt/headless support\\033[0m"
  echo -e "\\033[0;33m  Ralph requires 'pi -p' or 'pi --prompt' so each iteration can run non-interactively.\\033[0m"
  echo -e "\\033[0;33m  Upgrade Pi CLI or use a provider with a headless launcher.\\033[0m"
  exit 1
fi
`,
    invocation: `  export PI=1
  export BRAIN_DUMP_PROVIDER=pi
  export BRAIN_DUMP_RALPH_PROVIDER=pi
  # Run Pi non-interactively so the outer Ralph loop regains control after each iteration.
  pi -p "$(cat "$PROMPT_FILE")"`,
  },
};

// Default timeout for Ralph session (1 hour in seconds)
export const DEFAULT_TIMEOUT_SECONDS = 3600;

// ============================================================================
// SCRIPT GENERATION
// ============================================================================

// Generate the Ralph bash script (unified for both native and Docker)
export function generateRalphScript(
  projectPath: string,
  maxIterations: number = 10,
  useSandbox: boolean = false,
  resourceLimits: DockerResourceLimits = DEFAULT_RESOURCE_LIMITS,
  timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS,
  dockerHostEnv: string | null = null,
  projectOrigin?: ProjectOriginInfo | undefined,
  aiBackend: RalphAiBackend = "claude",
  promptProfile: RalphPromptProfile = { type: "implementation" },
  modelSelection?: ConcreteLaunchModelSelection
): string {
  const imageName = "brain-dump-ralph-sandbox:latest";
  const sandboxHeader = useSandbox ? " (Docker Sandbox)" : "";

  // Docker host setup - export DOCKER_HOST if using non-default socket
  const dockerHostSetup = dockerHostEnv
    ? `
# Docker socket configuration (Lima/Colima/Rancher/Podman)
export DOCKER_HOST="${dockerHostEnv}"
echo -e "\\033[1;33m🐳 Docker Host:\\033[0m ${dockerHostEnv}"
`
    : "";
  // Format timeout for display (e.g., "1h", "30m", "1h 30m")
  const timeoutHours = Math.floor(timeoutSeconds / 3600);
  const timeoutMinutes = Math.floor((timeoutSeconds % 3600) / 60);
  let timeoutDisplay = `${timeoutMinutes}m`;
  if (timeoutHours > 0 && timeoutMinutes > 0) {
    timeoutDisplay = `${timeoutHours}h ${timeoutMinutes}m`;
  } else if (timeoutHours > 0) {
    timeoutDisplay = `${timeoutHours}h`;
  }
  const containerInfo = useSandbox
    ? `echo -e "\\033[1;33m🐳 Container:\\033[0m ${imageName}"
echo -e "\\033[1;33m📊 Resources:\\033[0m ${resourceLimits.memory} RAM, ${resourceLimits.cpus} CPUs, ${resourceLimits.pidsLimit} max PIDs"
echo -e "\\033[1;33m⏱️  Timeout:\\033[0m ${timeoutDisplay}"`
    : `echo -e "\\033[1;33m⏱️  Timeout:\\033[0m ${timeoutDisplay}"`;

  // Docker image check (only for sandbox mode)
  const dockerImageCheck = useSandbox
    ? `
# Check if Docker image exists
if ! docker image inspect "${imageName}" > /dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Docker image not found: ${imageName}\\033[0m"
  echo "Please build the sandbox image first in Brain Dump settings."
  exit 1
fi
`
    : "";

  // Different prompt file location for sandbox vs native.
  // Native mode uses a portable mktemp strategy that works on GNU/Linux and BSD/macOS.
  const promptFileSetup = useSandbox
    ? `PROMPT_FILE="$PROJECT_PATH/.ralph-prompt.md"`
    : `PROMPT_FILE=""
  PROMPT_FILE=$(mktemp "\${TMPDIR:-/tmp}/ralph-prompt.XXXXXX" 2>/dev/null || true)
  if [ -z "$PROMPT_FILE" ]; then
    PROMPT_FILE=$(mktemp -t ralph-prompt.XXXXXX 2>/dev/null || true)
  fi
  if [ -z "$PROMPT_FILE" ]; then
    echo -e "\\033[0;31m❌ Failed to create temp file\\033[0m"
    exit 1
  fi`;

  // Validate required local AI CLI is installed for native mode.
  const aiPreflightCheck = useSandbox ? "" : AI_BACKEND_CONFIGS[aiBackend].preflightCheck;
  const launchModelEnvExports = buildLaunchModelEnvExports(modelSelection);

  // SSH setup for Docker sandbox mode
  // This allows git push from inside container using host's SSH keys
  // Note: Lima/Colima on macOS runs Docker in a VM, so we can't directly mount the macOS SSH socket
  const sshAgentSetup = useSandbox
    ? `
# SSH agent forwarding (if available)
# Note: With Lima/Colima, the macOS SSH socket isn't accessible from the Docker VM
SSH_MOUNT_ARGS=""
USING_VM_DOCKER=false

# Detect if Docker is running via Lima/Colima VM
if [ -n "\${DOCKER_HOST:-}" ]; then
  case "$DOCKER_HOST" in
    */.lima/*|*/.colima/*)
      USING_VM_DOCKER=true
      ;;
  esac
fi

if [ "$USING_VM_DOCKER" = "true" ]; then
  echo -e "\\033[0;33m⚠ Docker via Lima/Colima detected - SSH agent forwarding not available\\033[0m"
  echo -e "\\033[0;33m  Git SSH operations will use container's own SSH config\\033[0m"
  echo -e "\\033[0;33m  For SSH pushes, configure SSH keys inside the container or use HTTPS\\033[0m"
elif [ -n "$SSH_AUTH_SOCK" ] && [ -S "$SSH_AUTH_SOCK" ]; then
  echo -e "\\033[0;32m✓ SSH agent detected, enabling forwarding\\033[0m"
  SSH_MOUNT_ARGS="-v $SSH_AUTH_SOCK:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent"
else
  echo -e "\\033[0;33m⚠ SSH agent not running - git push may not work\\033[0m"
  echo -e "\\033[0;33m  Start with: eval \\$(ssh-agent) && ssh-add\\033[0m"
fi

# Mount known_hosts to avoid SSH host verification prompts (this should work with Lima too)
KNOWN_HOSTS_MOUNT=""
if [ -f "$HOME/.ssh/known_hosts" ]; then
  echo -e "\\033[0;32m✓ Mounting known_hosts for host verification\\033[0m"
  KNOWN_HOSTS_MOUNT="-v $HOME/.ssh/known_hosts:/home/ralph/.ssh/known_hosts:ro"
fi

# Claude Code config mounts (location varies by platform)
# IMPORTANT: Only mount the auth file (~/.claude.json), NOT the ~/.claude/ directory
# Claude needs to write to ~/.claude/ for session data, statsig, todos, debug logs
# If we mount it as read-only, Claude fails with EROFS errors
# By only mounting ~/.claude.json, Claude can authenticate but create its own session data
EXTRA_MOUNTS=()
CLAUDE_CONFIG_FOUND=false

# Mount only the auth token file, not the entire directory
if [ -f "$HOME/.claude.json" ]; then
  echo -e "\\033[0;32m✓ Mounting Claude auth from ~/.claude.json\\033[0m"
  EXTRA_MOUNTS+=(-v "$HOME/.claude.json:/home/ralph/.claude.json:ro")
  CLAUDE_CONFIG_FOUND=true
fi

# Fallback for XDG-style config on Linux - mount settings.json only if it exists
if [ "$CLAUDE_CONFIG_FOUND" = "false" ]; then
  if [ -f "$HOME/.config/claude-code/settings.json" ]; then
    echo -e "\\033[0;32m✓ Mounting Claude settings from ~/.config/claude-code/settings.json\\033[0m"
    EXTRA_MOUNTS+=(-v "$HOME/.config/claude-code/settings.json:/home/ralph/.config/claude-code/settings.json:ro")
    CLAUDE_CONFIG_FOUND=true
  fi
fi

if [ "$CLAUDE_CONFIG_FOUND" = "false" ]; then
  echo -e "\\033[0;31m❌ Claude auth not found - container may not be authenticated\\033[0m"
  echo -e "\\033[0;33m  Expected: ~/.claude.json or ~/.config/claude-code/settings.json\\033[0m"
fi

# GitHub CLI config mount (optional)
if [ -d "$HOME/.config/gh" ]; then
  echo -e "\\033[0;32m✓ Mounting GitHub CLI config\\033[0m"
  EXTRA_MOUNTS+=(-v "$HOME/.config/gh:/home/ralph/.config/gh:ro")
fi

# API key handling for Docker container
# Claude stores API key in macOS keychain, which isn't accessible from Docker
# We need to extract it and pass via environment variable
ANTHROPIC_API_KEY_ARG=""
if [ -n "\${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "\\033[0;32m✓ Using ANTHROPIC_API_KEY from environment\\033[0m"
  ANTHROPIC_API_KEY_ARG="-e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
elif command -v security >/dev/null 2>&1; then
  # macOS: Try to get API key from keychain
  KEYCHAIN_KEY=$(security find-generic-password -s "Claude" -a "$(whoami)" -w 2>/dev/null || true)
  if [ -n "$KEYCHAIN_KEY" ]; then
    echo -e "\\033[0;32m✓ Retrieved Claude API key from macOS keychain\\033[0m"
    ANTHROPIC_API_KEY_ARG="-e ANTHROPIC_API_KEY=$KEYCHAIN_KEY"
  else
    echo -e "\\033[0;33m⚠ Could not retrieve Claude API key from keychain\\033[0m"
    echo -e "\\033[0;33m  You may need to set ANTHROPIC_API_KEY environment variable\\033[0m"
    echo -e "\\033[0;33m  Or run: claude login (to add key to keychain)\\033[0m"
  fi
else
  echo -e "\\033[0;33m⚠ No API key found - set ANTHROPIC_API_KEY environment variable\\033[0m"
fi
`
    : "";

  // Grace period for container to stop cleanly (30 seconds)
  const stopGracePeriod = 30;

  // Build Docker labels for project origin tracking
  // These labels allow the UI to display "Started by: [Project] ([Epic])"
  const projectLabels = projectOrigin
    ? `--label "brain-dump.project-id=${projectOrigin.projectId}" \\
    --label "brain-dump.project-name=${projectOrigin.projectName.replace(/"/g, '\\"')}"${
      projectOrigin.epicId
        ? ` \\
    --label "brain-dump.epic-id=${projectOrigin.epicId}" \\
    --label "brain-dump.epic-title=${(projectOrigin.epicTitle ?? "").replace(/"/g, '\\"')}"`
        : ""
    } \\`
    : "";

  // AI backend display name
  const aiName = AI_BACKEND_CONFIGS[aiBackend].displayName;
  const claudeNativeModelArgument =
    aiBackend === "claude" && modelSelection ? ` --model "$BRAIN_DUMP_LAUNCH_MODEL"` : "";
  const claudeDockerModelArgument =
    aiBackend === "claude" && modelSelection
      ? ` \\
    --model "${escapeForBashDoubleQuote(modelSelection.modelName)}"`
      : "";
  const nativeAiInvocation =
    aiBackend === "claude"
      ? `  # Run Claude in print mode (-p) so it exits after completion
  # This allows the bash loop to continue to the next iteration
  claude --dangerously-skip-permissions${claudeNativeModelArgument} --output-format text -p "$(cat "$PROMPT_FILE")"`
      : AI_BACKEND_CONFIGS[aiBackend].invocation;

  // Generate the AI invocation command based on backend choice.
  // Sandbox mode always uses the Docker wrapper; native mode uses the backend config.
  const aiInvocation = useSandbox
    ? `  # Run ${aiName} in Docker container
  # Claude Code auth is passed via mounted config (platform-dependent location)
  # SSH agent is forwarded if available (allows git push from container)
  # known_hosts is mounted read-only to avoid SSH host verification prompts
  # Port ranges exposed for dev servers:
  #   8100-8110: Frontend (Vite, Next.js, React)
  #   8200-8210: Backend (Express, Fastify)
  #   8300-8310: Storybook, docs
  #   8400-8410: Databases (exposed for debugging)
  # Resource limits:
  #   memory: ${resourceLimits.memory} (prevents OOM on host)
  #   cpus: ${resourceLimits.cpus} (prevents CPU monopolization)
  #   pids-limit: ${resourceLimits.pidsLimit} (prevents fork bombs)
  # Security:
  #   no-new-privileges: prevents privilege escalation inside container
  # Timeout:
  #   stop-timeout: ${stopGracePeriod}s (grace period before SIGKILL)
  # Labels:
  #   brain-dump.project-id/project-name: Tracks which project started this container
  #   brain-dump.epic-id/epic-title: Tracks which epic (if applicable)
  docker run --rm -it \\
    --name "ralph-\${SESSION_ID}" \\
    --network ralph-net \\
    --memory=${resourceLimits.memory} \\
    --memory-swap=${resourceLimits.memory} \\
    --cpus=${resourceLimits.cpus} \\
    --pids-limit=${resourceLimits.pidsLimit} \\
    --stop-timeout=${stopGracePeriod} \\
    --security-opt=no-new-privileges:true \\
    ${projectLabels}
    -p 8100-8110:8100-8110 \\
    -p 8200-8210:8200-8210 \\
    -p 8300-8310:8300-8310 \\
    -p 8400-8410:8400-8410 \\
    -v "$PROJECT_PATH:/workspace" \\
    -v "$HOME/.gitconfig:/home/ralph/.gitconfig:ro" \\
    "\${EXTRA_MOUNTS[@]}" \\
    $SSH_MOUNT_ARGS \\
    $KNOWN_HOSTS_MOUNT \\
    $ANTHROPIC_API_KEY_ARG \\
    -w /workspace \\
    "${imageName}" \\
    claude --dangerously-skip-permissions${claudeDockerModelArgument} /workspace/.ralph-prompt.md`
    : nativeAiInvocation;

  const iterationLabel = useSandbox ? "(Docker)" : "";
  const endMessage = useSandbox ? "" : `echo "Run again with: $0 <max_iterations>"`;

  // Timeout trap handler - cleans up container and saves progress note
  const timeoutTrapHandler = useSandbox
    ? `
# Timeout handling for graceful shutdown
TIMEOUT_REACHED=false
RALPH_TIMEOUT=${timeoutSeconds}

handle_timeout() {
  TIMEOUT_REACHED=true
  echo ""
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo -e "\\033[0;31m⏰ TIMEOUT: Ralph session exceeded ${timeoutDisplay} limit\\033[0m"
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo ""

  # Stop Docker container if running
  if docker ps -q --filter "name=ralph-\${SESSION_ID}" | grep -q .; then
    echo -e "\\033[0;33m🐳 Stopping Ralph container...\\033[0m"
    docker stop "ralph-\${SESSION_ID}" 2>/dev/null || true
  fi

  # Log timeout to progress file
  echo "" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "### $(date '+%Y-%m-%d %H:%M:%S') - Session Timeout" >> "$PROGRESS_FILE"
  echo "- **Reason:** Timeout reached (${timeoutDisplay} limit)" >> "$PROGRESS_FILE"
  echo "- **Status:** Session terminated, work may be incomplete" >> "$PROGRESS_FILE"
  echo "- **Action:** Review progress and restart if needed" >> "$PROGRESS_FILE"

  echo -e "\\033[0;33m📝 Timeout logged to progress.txt\\033[0m"
  exit 124
}

# Set up alarm signal handler
trap handle_timeout ALRM

# Start background timer that will send ALRM after timeout
(sleep $RALPH_TIMEOUT && kill -ALRM $$ 2>/dev/null) &
TIMER_PID=$!

# Clean up timer and services file on exit
cleanup_on_exit() {
  kill $TIMER_PID 2>/dev/null || true
  # Remove .ralph-services.json to prevent stale data in UI
  rm -f "$PROJECT_PATH/.ralph-services.json" 2>/dev/null || true
}
trap cleanup_on_exit EXIT
`
    : `
# Timeout handling for graceful shutdown
TIMEOUT_REACHED=false
RALPH_TIMEOUT=${timeoutSeconds}

handle_timeout() {
  TIMEOUT_REACHED=true
  echo ""
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo -e "\\033[0;31m⏰ TIMEOUT: Ralph session exceeded ${timeoutDisplay} limit\\033[0m"
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo ""

  # Log timeout to progress file
  echo "" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "### $(date '+%Y-%m-%d %H:%M:%S') - Session Timeout" >> "$PROGRESS_FILE"
  echo "- **Reason:** Timeout reached (${timeoutDisplay} limit)" >> "$PROGRESS_FILE"
  echo "- **Status:** Session terminated, work may be incomplete" >> "$PROGRESS_FILE"
  echo "- **Action:** Review progress and restart if needed" >> "$PROGRESS_FILE"

  echo -e "\\033[0;33m📝 Timeout logged to progress.txt\\033[0m"
  exit 124
}

# Set up alarm signal handler
trap handle_timeout ALRM

# Start background timer that will send ALRM after timeout
(sleep $RALPH_TIMEOUT && kill -ALRM $$ 2>/dev/null) &
TIMER_PID=$!

# Clean up timer and services file on normal exit
cleanup_on_exit() {
  kill $TIMER_PID 2>/dev/null || true
  # Remove .ralph-services.json to prevent stale data in UI
  rm -f "$PROJECT_PATH/.ralph-services.json" 2>/dev/null || true
}
trap cleanup_on_exit EXIT
`;

  return `#!/bin/bash
set -e

MAX_ITERATIONS=\${1:-${maxIterations}}
PROJECT_PATH="${projectPath}"
PRD_FILE="$PROJECT_PATH/plans/prd.json"
PROGRESS_FILE="$PROJECT_PATH/plans/progress.txt"
SESSION_ID="$(date +%s)-$$"
MAX_RETRIES=3
CONSECUTIVE_FAILURES=0
MAX_CONSECUTIVE_FAILURES=5
LAST_INCOMPLETE_COUNT=-1
NO_PROGRESS_COUNT=0
MAX_NO_PROGRESS=3

cd "$PROJECT_PATH"
${RALPH_ENV_EXPORTS}
${launchModelEnvExports}
${dockerHostSetup}${dockerImageCheck}${sshAgentSetup}${aiPreflightCheck}
# Ensure plans directory exists
mkdir -p "$PROJECT_PATH/plans"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "# Use this to leave notes for the next iteration" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

# Rotate progress file if it exceeds 500 lines
rotate_progress_file() {
  if [ -f "$PROGRESS_FILE" ]; then
    LINE_COUNT=$(wc -l < "$PROGRESS_FILE" | tr -d ' ')
    if [ "$LINE_COUNT" -gt 500 ]; then
      ARCHIVE_DIR="$PROJECT_PATH/plans/archives"
      mkdir -p "$ARCHIVE_DIR"
      TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
      ARCHIVE_FILE="$ARCHIVE_DIR/progress-$TIMESTAMP.txt"

      # Keep last 100 lines in active file, archive the rest
      LINES_TO_ARCHIVE=$((LINE_COUNT - 100))
      head -n "$LINES_TO_ARCHIVE" "$PROGRESS_FILE" > "$ARCHIVE_FILE"
      tail -n 100 "$PROGRESS_FILE" > "$PROGRESS_FILE.tmp"

      # Add header to rotated file
      {
        echo "# Ralph Progress Log"
        echo "# Previous entries archived to: archives/progress-$TIMESTAMP.txt"
        echo ""
        cat "$PROGRESS_FILE.tmp"
      } > "$PROGRESS_FILE"
      rm -f "$PROGRESS_FILE.tmp"

      echo -e "\\033[0;33m📦 Archived $(echo $LINES_TO_ARCHIVE) lines to archives/progress-$TIMESTAMP.txt\\033[0m"
    fi
  fi
}

# Run rotation before starting
rotate_progress_file
${timeoutTrapHandler}

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Ralph Mode${sandboxHeader}\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📁 Project:\\033[0m $PROJECT_PATH"
${containerInfo}
echo -e "\\033[1;33m📋 PRD:\\033[0m $PRD_FILE"
echo -e "\\033[1;33m🔄 Max Iterations:\\033[0m $MAX_ITERATIONS"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo -e "\\033[0;35m═══════════════════════════════════════════════════════════\\033[0m"
  echo -e "\\033[0;35m  Ralph Iteration $i of $MAX_ITERATIONS ${iterationLabel}\\033[0m"
  echo -e "\\033[0;35m  Started at $(date '+%Y-%m-%d %H:%M:%S')\\033[0m"
  echo -e "\\033[0;35m═══════════════════════════════════════════════════════════\\033[0m"
  echo ""

  # Create prompt file for this iteration
  ${promptFileSetup}
  cat > "$PROMPT_FILE" << 'RALPH_PROMPT_EOF'
${getRalphPrompt(promptProfile)}
RALPH_PROMPT_EOF

  # Validate prompt file is non-empty before passing to Claude
  if [ ! -s "$PROMPT_FILE" ]; then
    echo -e "\\033[0;31m❌ Prompt file is empty or missing. Skipping iteration.\\033[0m"
    echo "[$(date -Iseconds)] ERROR: Empty prompt file at iteration $i" >> "$PROGRESS_FILE"
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    rm -f "$PROMPT_FILE"
    if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
      echo -e "\\033[0;31m❌ Too many consecutive failures ($CONSECUTIVE_FAILURES). Stopping Ralph.\\033[0m"
      echo "[$(date -Iseconds)] ABORTED: $CONSECUTIVE_FAILURES consecutive failures" >> "$PROGRESS_FILE"
      exit 1
    fi
    sleep 2
    continue
  fi

  echo -e "\\033[0;33m⏳ Starting ${aiName}${useSandbox ? " in Docker sandbox" : " (autonomous mode)"}...\\033[0m"
  echo ""

  # Retry loop for Claude invocation (handles transient "No messages returned" errors)
  AI_EXIT_CODE=1
  AI_INTERRUPTED=false
  for RETRY in $(seq 1 $MAX_RETRIES); do
    set +e
${aiInvocation}
    AI_EXIT_CODE=$?
    set -e

    if [ $AI_EXIT_CODE -eq 130 ] || [ $AI_EXIT_CODE -eq 143 ]; then
      echo ""
      echo -e "\\033[0;33m⏹️  ${aiName} interrupted by user. Skipping retries for this iteration.\\033[0m"
      echo "[$(date -Iseconds)] INTERRUPTED: ${aiName} exited with code $AI_EXIT_CODE" >> "$PROGRESS_FILE"
      AI_INTERRUPTED=true
      break
    fi

    if [ $AI_EXIT_CODE -eq 0 ]; then
      break
    fi

    if [ $RETRY -lt $MAX_RETRIES ]; then
      BACKOFF=$((RETRY * 5))
      echo ""
      echo -e "\\033[0;31m⚠️  ${aiName} exited with code $AI_EXIT_CODE (attempt $RETRY/$MAX_RETRIES)\\033[0m"
      echo -e "\\033[0;33m⏳ Retrying in \${BACKOFF}s...\\033[0m"
      sleep $BACKOFF
    fi
  done

  rm -f "$PROMPT_FILE"

  echo ""
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"
  echo -e "\\033[0;36m  Iteration $i complete at $(date '+%H:%M:%S')\\033[0m"
  echo -e "\\033[0;36m  Exit code: $AI_EXIT_CODE\\033[0m"
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"

  if [ "$AI_INTERRUPTED" = "true" ]; then
    CONSECUTIVE_FAILURES=0
    echo -e "\\033[0;33m⏭️  Continuing to next iteration after user interrupt.\\033[0m"
    sleep 1
    continue
  fi

  # Track consecutive failures to detect persistent issues
  if [ $AI_EXIT_CODE -ne 0 ]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo -e "\\033[0;31m⚠️  Consecutive failures: $CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES\\033[0m"
    echo "[$(date -Iseconds)] FAILURE: Iteration $i failed after $MAX_RETRIES retries (exit code: $AI_EXIT_CODE)" >> "$PROGRESS_FILE"

    if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
      echo ""
      echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      echo -e "\\033[0;31m❌ $MAX_CONSECUTIVE_FAILURES consecutive failures. Ralph is stopping.\\033[0m"
      echo -e "\\033[0;31m   This usually means ${aiName} CLI cannot start properly.\\033[0m"
      echo -e "\\033[0;31m   Check: API key, network, MCP server, or run the CLI with --help\\033[0m"
      echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      echo "[$(date -Iseconds)] ABORTED: $CONSECUTIVE_FAILURES consecutive failures" >> "$PROGRESS_FILE"
      exit 1
    fi
  else
    # Reset on success
    CONSECUTIVE_FAILURES=0
  fi

  # Check if all tasks in PRD are complete (all have passes:true)
  if [ -f "$PRD_FILE" ]; then
    INCOMPLETE=$(grep -c '"passes": false' "$PRD_FILE" 2>/dev/null || echo "0")
    TOTAL=$(grep -c '"passes":' "$PRD_FILE" 2>/dev/null || echo "0")
    COMPLETE=$((TOTAL - INCOMPLETE))

    echo ""
    echo -e "\\033[0;36m📊 Progress: $COMPLETE/$TOTAL tasks complete\\033[0m"

    if [ "$INCOMPLETE" = "0" ] && [ "$TOTAL" != "0" ]; then
      echo ""
      echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      echo -e "\\033[0;32m✅ All tasks complete! Ralph is done.\\033[0m"
      echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      exit 0
    fi

    # Detect stuck state: if incomplete count hasn't changed for MAX_NO_PROGRESS iterations,
    # all tickets are likely in human_review or blocked. Stop looping.
    if [ "$INCOMPLETE" = "$LAST_INCOMPLETE_COUNT" ] && [ $AI_EXIT_CODE -eq 0 ]; then
      NO_PROGRESS_COUNT=$((NO_PROGRESS_COUNT + 1))
      if [ $NO_PROGRESS_COUNT -ge $MAX_NO_PROGRESS ]; then
        echo ""
        echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
        echo -e "\\033[0;33m⏸️  No progress for $MAX_NO_PROGRESS iterations ($INCOMPLETE tickets still incomplete).\\033[0m"
        echo -e "\\033[0;33m   Tickets are likely in human_review or blocked.\\033[0m"
        echo -e "\\033[0;33m   Ralph is stopping to avoid wasting iterations.\\033[0m"
        echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
        echo "[$(date -Iseconds)] STALLED: No progress for $MAX_NO_PROGRESS iterations. $INCOMPLETE/$TOTAL incomplete." >> "$PROGRESS_FILE"
        exit 0
      fi
    else
      NO_PROGRESS_COUNT=0
    fi
    LAST_INCOMPLETE_COUNT="$INCOMPLETE"
  fi

  echo ""
  echo -e "\\033[0;33m🔄 Moving to next iteration...\\033[0m"
  sleep 2
done

echo ""
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;33m⚠️  Max iterations reached. Some tasks may remain.\\033[0m"
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""
${endMessage}
exec bash
`;
}
