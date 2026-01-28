/**
 * Docker sandbox script generation and validation.
 * Handles Ralph execution in isolated Docker containers.
 */

import { execDockerCommand } from "../api/docker-utils";
import { getRalphPrompt } from "./ralph-prompts";

export interface DockerResourceLimits {
  memory: string;
  cpus: string;
  pidsLimit: number;
}

export const DEFAULT_RESOURCE_LIMITS: DockerResourceLimits = {
  memory: "2g",
  cpus: "1.5",
  pidsLimit: 256,
};

export const DEFAULT_TIMEOUT_SECONDS = 3600;

export interface ProjectOriginInfo {
  projectId: string;
  projectName: string;
  epicId?: string | undefined;
  epicTitle?: string | undefined;
}

export function generateRalphScript(
  projectPath: string,
  maxIterations: number = 10,
  useSandbox: boolean = false,
  resourceLimits: DockerResourceLimits = DEFAULT_RESOURCE_LIMITS,
  timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS,
  dockerHostEnv: string | null = null,
  projectOrigin?: ProjectOriginInfo | undefined,
  aiBackend: "claude" | "opencode" = "claude"
): string {
  const imageName = "brain-dump-ralph-sandbox:latest";
  const sandboxHeader = useSandbox ? " (Docker Sandbox)" : "";

  const dockerHostSetup = dockerHostEnv
    ? `
export DOCKER_HOST="${dockerHostEnv}"
echo -e "\\033[1;33m🐳 Docker Host:\\033[0m ${dockerHostEnv}"
`
    : "";
  // Format timeout for display (e.g., "1h", "30m", "1h 30m")
  const timeoutHours = Math.floor(timeoutSeconds / 3600);
  const timeoutMinutes = Math.floor((timeoutSeconds % 3600) / 60);
  const timeoutDisplay =
    timeoutHours > 0 && timeoutMinutes > 0
      ? `${timeoutHours}h ${timeoutMinutes}m`
      : timeoutHours > 0
        ? `${timeoutHours}h`
        : `${timeoutMinutes}m`;
  const containerInfo = useSandbox
    ? `echo -e "\\033[1;33m🐳 Container:\\033[0m ${imageName}"
echo -e "\\033[1;33m📊 Resources:\\033[0m ${resourceLimits.memory} RAM, ${resourceLimits.cpus} CPUs, ${resourceLimits.pidsLimit} max PIDs"
echo -e "\\033[1;33m⏱️  Timeout:\\033[0m ${timeoutDisplay}"`
    : `echo -e "\\033[1;33m⏱️  Timeout:\\033[0m ${timeoutDisplay}"`;

  const dockerImageCheck = useSandbox
    ? `
if ! docker image inspect "${imageName}" > /dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Docker image not found: ${imageName}\\033[0m"
  echo "Please build the sandbox image first in Brain Dump settings."
  exit 1
fi
`
    : "";

  const promptFileSetup = useSandbox
    ? `PROMPT_FILE="$PROJECT_PATH/.ralph-prompt.md"`
    : `PROMPT_FILE=$(mktemp -t ralph-prompt) || { echo -e "\\033[0;31m❌ Failed to create temp file\\033[0m"; exit 1; }`;

  const sshAgentSetup = useSandbox
    ? `
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

KNOWN_HOSTS_MOUNT=""
if [ -f "$HOME/.ssh/known_hosts" ]; then
  echo -e "\\033[0;32m✓ Mounting known_hosts for host verification\\033[0m"
  KNOWN_HOSTS_MOUNT="-v $HOME/.ssh/known_hosts:/home/ralph/.ssh/known_hosts:ro"
fi

EXTRA_MOUNTS=()
CLAUDE_CONFIG_FOUND=false

if [ -f "$HOME/.claude.json" ]; then
  echo -e "\\033[0;32m✓ Mounting Claude auth from ~/.claude.json\\033[0m"
  EXTRA_MOUNTS+=(-v "$HOME/.claude.json:/home/ralph/.claude.json:ro")
  CLAUDE_CONFIG_FOUND=true
fi

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

if [ -d "$HOME/.config/gh" ]; then
  echo -e "\\033[0;32m✓ Mounting GitHub CLI config\\033[0m"
  EXTRA_MOUNTS+=(-v "$HOME/.config/gh:/home/ralph/.config/gh:ro")
fi

ANTHROPIC_API_KEY_ARG=""
if [ -n "\${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "\\033[0;32m✓ Using ANTHROPIC_API_KEY from environment\\033[0m"
  ANTHROPIC_API_KEY_ARG="-e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
elif command -v security >/dev/null 2>&1; then
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

  const stopGracePeriod = 30;

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

  const aiName = aiBackend === "opencode" ? "OpenCode" : "Claude";

  const aiInvocation = useSandbox
    ? `  docker run --rm -it \\
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
    claude --dangerously-skip-permissions /workspace/.ralph-prompt.md`
    : aiBackend === "opencode"
      ? `  opencode "$PROJECT_PATH" --prompt "$(cat "$PROMPT_FILE")"`
      : `  claude --dangerously-skip-permissions --output-format text -p "$(cat "$PROMPT_FILE")"`;

  const iterationLabel = useSandbox ? "(Docker)" : "";
  const endMessage = useSandbox ? "" : `echo "Run again with: $0 <max_iterations>"`;

  const timeoutTrapHandler = useSandbox
    ? `
TIMEOUT_REACHED=false
RALPH_TIMEOUT=${timeoutSeconds}

handle_timeout() {
  TIMEOUT_REACHED=true
  echo ""
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo -e "\\033[0;31m⏰ TIMEOUT: Ralph session exceeded ${timeoutDisplay} limit\\033[0m"
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo ""

  if docker ps -q --filter "name=ralph-\${SESSION_ID}" | grep -q .; then
    echo -e "\\033[0;33m🐳 Stopping Ralph container...\\033[0m"
    docker stop "ralph-\${SESSION_ID}" 2>/dev/null || true
  fi

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

trap handle_timeout ALRM
(sleep $RALPH_TIMEOUT && kill -ALRM $$ 2>/dev/null) &
TIMER_PID=$!

cleanup_on_exit() {
  kill $TIMER_PID 2>/dev/null || true
  rm -f "$PROJECT_PATH/.ralph-services.json" 2>/dev/null || true
}
trap cleanup_on_exit EXIT
`
    : `
TIMEOUT_REACHED=false
RALPH_TIMEOUT=${timeoutSeconds}

handle_timeout() {
  TIMEOUT_REACHED=true
  echo ""
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo -e "\\033[0;31m⏰ TIMEOUT: Ralph session exceeded ${timeoutDisplay} limit\\033[0m"
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo ""

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

trap handle_timeout ALRM
(sleep $RALPH_TIMEOUT && kill -ALRM $$ 2>/dev/null) &
TIMER_PID=$!

cleanup_on_exit() {
  kill $TIMER_PID 2>/dev/null || true
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

cd "$PROJECT_PATH"
${dockerHostSetup}${dockerImageCheck}${sshAgentSetup}
mkdir -p "$PROJECT_PATH/plans"

if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "# Use this to leave notes for the next iteration" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

rotate_progress_file() {
  if [ -f "$PROGRESS_FILE" ]; then
    LINE_COUNT=$(wc -l < "$PROGRESS_FILE" | tr -d ' ')
    if [ "$LINE_COUNT" -gt 500 ]; then
      ARCHIVE_DIR="$PROJECT_PATH/plans/archives"
      mkdir -p "$ARCHIVE_DIR"
      TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
      ARCHIVE_FILE="$ARCHIVE_DIR/progress-$TIMESTAMP.txt"

      LINES_TO_ARCHIVE=$((LINE_COUNT - 100))
      head -n "$LINES_TO_ARCHIVE" "$PROGRESS_FILE" > "$ARCHIVE_FILE"
      tail -n 100 "$PROGRESS_FILE" > "$PROGRESS_FILE.tmp"
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

  ${promptFileSetup}
  cat > "$PROMPT_FILE" << 'RALPH_PROMPT_EOF'
${getRalphPrompt()}
RALPH_PROMPT_EOF

  echo -e "\\033[0;33m⏳ Starting ${aiName}${useSandbox ? " in Docker sandbox" : " (autonomous mode)"}...\\033[0m"
  echo ""

${aiInvocation}
  AI_EXIT_CODE=$?

  rm -f "$PROMPT_FILE"

  echo ""
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"
  echo -e "\\033[0;36m  Iteration $i complete at $(date '+%H:%M:%S')\\033[0m"
  echo -e "\\033[0;36m  Exit code: $AI_EXIT_CODE\\033[0m"
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"

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

async function ensureDockerNetwork(
  networkName: string
): Promise<{ success: true } | { success: false; message: string }> {
  try {
    await execDockerCommand(`network inspect ${networkName}`);
    console.log(`[brain-dump] Docker network "${networkName}" already exists`);
    return { success: true };
  } catch (inspectError) {
    const errorMessage =
      inspectError instanceof Error ? inspectError.message : String(inspectError);

    if (!errorMessage.includes("No such network") && !errorMessage.includes("not found")) {
      console.error(`[brain-dump] Docker network inspect failed:`, errorMessage);
      return {
        success: false,
        message: `Failed to check Docker network "${networkName}": ${errorMessage}. Ensure Docker is running.`,
      };
    }

    try {
      await execDockerCommand(`network create ${networkName}`);
      console.log(`[brain-dump] Created Docker network "${networkName}"`);
      return { success: true };
    } catch (createError) {
      try {
        await execDockerCommand(`network inspect ${networkName}`);
        console.log(
          `[brain-dump] Docker network "${networkName}" exists (created by another process)`
        );
        return { success: true };
      } catch {
        return {
          success: false,
          message: `Failed to create Docker network "${networkName}": ${createError instanceof Error ? createError.message : "Unknown error"}`,
        };
      }
    }
  }
}

export async function validateDockerSetup(): Promise<
  { success: true; warnings?: string[] } | { success: false; message: string }
> {
  const { existsSync } = await import("fs");
  const { join } = await import("path");
  const warnings: string[] = [];

  try {
    await execDockerCommand("info");
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Docker is not accessible: ${errorDetail}. Please ensure Docker is running and you have permission to access the Docker socket.`,
    };
  }

  const networkResult = await ensureDockerNetwork("ralph-net");
  if (!networkResult.success) {
    return networkResult;
  }

  try {
    await execDockerCommand("image inspect brain-dump-ralph-sandbox:latest");
  } catch {
    console.log("[brain-dump] Building sandbox image...");
    const dockerfilePath = join(process.cwd(), "docker", "ralph-sandbox.Dockerfile");
    const contextPath = join(process.cwd(), "docker");

    if (!existsSync(dockerfilePath)) {
      return {
        success: false,
        message: "Dockerfile not found. Please ensure brain-dump is installed correctly.",
      };
    }

    try {
      await execDockerCommand(
        `build -t brain-dump-ralph-sandbox:latest -f "${dockerfilePath}" "${contextPath}"`,
        { timeout: 300000 }
      );
      console.log("[brain-dump] Sandbox image built successfully");
    } catch (buildError) {
      return {
        success: false,
        message: `Failed to build sandbox image: ${buildError instanceof Error ? buildError.message : "Unknown error"}`,
      };
    }
  }

  const sshAuthSock = process.env.SSH_AUTH_SOCK;
  if (!sshAuthSock || !existsSync(sshAuthSock)) {
    warnings.push(
      "SSH agent not running - git push may not work from container. Start with: eval $(ssh-agent) && ssh-add"
    );
    console.log("[brain-dump] Warning: SSH agent not detected");
  } else {
    console.log("[brain-dump] SSH agent detected at:", sshAuthSock);
  }

  if (warnings.length > 0) {
    return { success: true, warnings };
  }
  return { success: true };
}
