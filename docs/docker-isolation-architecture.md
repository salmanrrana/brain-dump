# Docker Isolation Architecture

Brain Dump provides an optional Docker sandbox mode for running Ralph (the autonomous coding agent). This document explains how the isolation works and what security boundaries it provides.

## Why Docker Isolation?

When Ralph runs autonomously, it executes code and shell commands without human review. Docker isolation provides:

1. **Filesystem boundaries** - Ralph can only access the current project, not your other repos or system files
2. **Resource limits** - Prevents runaway processes from consuming all system memory or CPU
3. **Network isolation** - Container runs on its own network with limited exposure
4. **Non-root execution** - Ralph runs as an unprivileged user inside the container

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HOST MACHINE                                  │
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────────────────────────────┐ │
│  │   Brain Dump     │     │        Docker Container                  │ │
│  │   (Web UI)       │     │        "ralph-{session-id}"              │ │
│  │                  │     │                                          │ │
│  │  - Launches      │────▶│  ┌──────────────────────────────────┐   │ │
│  │    container     │     │  │  Claude CLI (as user 'ralph')    │   │ │
│  │  - Monitors      │     │  │  - Runs autonomously             │   │ │
│  │    progress      │     │  │  - Reads/writes /workspace       │   │ │
│  └──────────────────┘     │  │  - Can run dev servers           │   │ │
│                           │  └──────────────────────────────────┘   │ │
│                           │                                          │ │
│  Volume Mounts:           │  Resource Limits:                        │ │
│  ├── /project ──────────────▶ /workspace (read/write)               │ │
│  ├── ~/.config/claude-code ─▶ /home/ralph/.config/claude-code (ro)  │ │
│  ├── ~/.gitconfig ──────────▶ /home/ralph/.gitconfig (ro)           │ │
│  ├── ~/.config/gh ──────────▶ /home/ralph/.config/gh (ro)           │ │
│  └── SSH_AUTH_SOCK ─────────▶ /ssh-agent (forwarded)                │ │
│                           │                                          │ │
│  Port Mappings:           │  ┌──────────────────────────────────┐   │ │
│  8100-8110 ◀─────────────────▶ Frontend (Vite, Next.js)         │   │ │
│  8200-8210 ◀─────────────────▶ Backend (Express, Fastify)       │   │ │
│  8300-8310 ◀─────────────────▶ Storybook, docs                  │   │ │
│  8400-8410 ◀─────────────────▶ Databases (debugging)            │   │ │
│                           │  └──────────────────────────────────┘   │ │
│                           └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### Volume Mounts

| Mount | Path in Container | Access | Purpose |
|-------|-------------------|--------|---------|
| Project directory | `/workspace` | Read/Write | Ralph needs to edit code |
| Claude Code auth | `/home/ralph/.config/claude-code` | Read-only | API authentication |
| Git config | `/home/ralph/.gitconfig` | Read-only | Git commits use your identity |
| GitHub CLI config | `/home/ralph/.config/gh` | Read-only | PR creation, issue management |
| SSH agent socket | `/ssh-agent` | Forward | Git push without copying keys |
| SSH known_hosts | `/home/ralph/.ssh/known_hosts` | Read-only | Avoid host verification prompts |

### Resource Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| Memory | 2GB | Prevents OOM on host |
| Memory Swap | 2GB (same as memory) | No swap, fail fast if OOM |
| CPUs | 1.5 cores | Prevents CPU monopolization |
| PIDs | 256 | Prevents fork bombs |
| Stop timeout | 30s | Grace period before SIGKILL |

### Security Options

- **`--security-opt=no-new-privileges:true`** - Prevents privilege escalation inside container
- **Non-root user** - Runs as `ralph` user (UID 1000), not root
- **`--rm` flag** - Container is automatically removed when it exits

### Network

- Container runs on the `ralph-net` Docker network
- Port ranges are mapped for dev server access from host browser
- Container can access the internet (needed for npm install, API calls)

## Security Model

### What Ralph CAN Do

- Read and write files in your project directory
- Run shell commands (build, test, lint, etc.)
- Install npm packages
- Create git commits and branches
- Push to remotes you have SSH access to
- Create pull requests via GitHub CLI
- Start dev servers accessible from your browser

### What Ralph CANNOT Do

- Access files outside the project directory
- Read or modify other projects on your machine
- Access host system files (`/etc`, `/var`, etc.)
- Steal SSH keys (only agent forwarding, keys stay on host)
- Escalate to root privileges
- Consume unlimited memory/CPU
- Run indefinitely (timeout enforced)
- Survive container restart (ephemeral)

### Credentials Handling

| Credential | How Accessed | Security |
|------------|--------------|----------|
| Anthropic API key | Mounted config dir (read-only) | Cannot be modified or exfiltrated easily |
| SSH keys | Agent forwarding only | Keys never enter container |
| GitHub token | Mounted gh config (read-only) | Cannot be modified |
| Git identity | Mounted gitconfig (read-only) | Commits attributed to you |

## Port Conventions

When Ralph starts a dev server, it should use these port ranges:

| Range | Purpose | Examples |
|-------|---------|----------|
| 8100-8110 | Frontend dev servers | Vite, Next.js, Create React App |
| 8200-8210 | Backend servers | Express, Fastify, NestJS |
| 8300-8310 | Documentation | Storybook, Docusaurus |
| 8400-8410 | Databases | Exposed for debugging only |

Ralph writes running services to `.ralph-services.json` in the project root for the Brain Dump UI to discover.

## Session Lifecycle

1. **Start** - Brain Dump launches container with unique session ID
2. **Work** - Ralph iterates through tickets, making changes
3. **Timeout** - Session ends after configured timeout (default: 1 hour)
4. **Cleanup** - Container is automatically removed (`--rm` flag)

Progress is logged to `plans/progress.txt` so the next session can continue where the previous left off.

## Limitations

1. **No GUI apps** - Container is headless, no browser automation
2. **No systemd** - Can't run services that require init system
3. **Alpine-based** - Uses musl libc, some binaries may not work
4. **Shared project mount** - Changes are immediately visible on host
5. **Single project** - Can only work on one project at a time

## Comparison: Sandbox vs Native Mode

| Feature | Sandbox Mode | Native Mode |
|---------|--------------|-------------|
| Filesystem access | Project only | Full system |
| Resource limits | Enforced | None |
| SSH keys | Agent forwarding | Direct access |
| Dev servers | Mapped ports | Any port |
| Performance | ~5% overhead | Native |
| Setup required | Docker installed | None |

## Troubleshooting

See [docker-git-push.md](./docker-git-push.md) for SSH/git issues in sandbox mode.

Common issues:

1. **"Permission denied" on git push** - SSH agent not running. Start with:
   ```bash
   eval $(ssh-agent) && ssh-add
   ```

2. **Container out of memory** - Increase limit in settings or reduce parallel processes

3. **Port already in use** - Another process is using the port range. Check with:
   ```bash
   lsof -i :8100-8110
   ```
