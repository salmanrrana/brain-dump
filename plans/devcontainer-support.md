# Sandboxing & Devcontainer Support Plan

## Executive Summary

Brain Dump needs to support **three levels of isolation** for AI-assisted development:

| Level                | Method                 | Complexity | Use Case               |
| -------------------- | ---------------------- | ---------- | ---------------------- |
| **1. Native**        | Claude Code `/sandbox` | Easiest    | Day-to-day development |
| **2. Devcontainer**  | Docker + VS Code       | Medium     | Team standardization   |
| **3. Ralph Sandbox** | Custom Docker          | Existing   | Autonomous agent work  |

**Recommendation**: Implement all three, let users choose based on needs.

---

## Current State Analysis

### What Brain Dump Has Today

| File                              | Purpose                        | Status     |
| --------------------------------- | ------------------------------ | ---------- |
| `Dockerfile`                      | Production web app (port 4242) | Keep       |
| `docker/ralph-sandbox.Dockerfile` | Ralph autonomous work          | Keep       |
| `.devcontainer/`                  | Dev environment                | **Create** |
| Native sandbox config             | Claude Code sandboxing         | **Create** |

### What Install Scripts Support Today

```
./install.sh --claude     # Claude Code MCP + plugins
./install.sh --vscode     # VS Code MCP + agents + skills
./install.sh --opencode   # OpenCode MCP + agents
./install.sh --docker     # Ralph sandbox image
```

**Missing**: `--sandbox` and `--devcontainer` options

---

## Sandboxing Options Deep Dive

### Option 1: Native Sandboxing (Claude Code Built-in)

**How it works**: Claude Code has built-in OS-level sandboxing using:

- **Linux**: [bubblewrap](https://github.com/containers/bubblewrap)
- **macOS**: Seatbelt sandbox

**Enable with**: `/sandbox` command in Claude Code

**Capabilities**:

```
┌─────────────────────────────────────────────────────────────┐
│  FILESYSTEM                                                  │
│  ├─ Read/Write: CWD and subdirectories ✅                   │
│  ├─ Read-only: Rest of system ✅                            │
│  └─ Blocked: Writes outside CWD ❌                          │
├─────────────────────────────────────────────────────────────┤
│  NETWORK                                                     │
│  ├─ Allowed: Approved domains only ✅                       │
│  ├─ Blocked: Unapproved domains ❌                          │
│  └─ Prompts: New domain requests trigger approval           │
└─────────────────────────────────────────────────────────────┘
```

**Configuration** (`~/.claude/settings.json`):

```json
{
  "sandbox": {
    "network": {
      "httpProxyPort": 8080,
      "socksProxyPort": 8081
    }
  }
}
```

**Pros**:

- No Docker required
- Works immediately
- OS-level enforcement (hard to bypass)
- Open source: `npx @anthropic-ai/sandbox-runtime`

**Cons**:

- Claude Code only (not OpenCode/VS Code)
- Some tools incompatible (watchman, docker commands)

---

### Option 2: Devcontainer (Docker + VS Code)

**How it works**: Full Docker container with network firewall.

**Structure**:

```
.devcontainer/
├── devcontainer.json    # VS Code/OpenCode compatible
├── Dockerfile           # Node 20 + pnpm + build tools
└── init-firewall.sh     # Network allowlist enforcement
```

**Capabilities**:

```
┌─────────────────────────────────────────────────────────────┐
│  ISOLATION                                                   │
│  ├─ Filesystem: Full container isolation                    │
│  ├─ Network: iptables firewall + ipset allowlist           │
│  └─ Process: Separate PID namespace                         │
├─────────────────────────────────────────────────────────────┤
│  ALLOWED DOMAINS (firewall)                                  │
│  ├─ registry.npmjs.org (packages)                           │
│  ├─ api.github.com + GitHub IPs (git)                       │
│  ├─ api.anthropic.com (Claude API)                          │
│  ├─ statsig.anthropic.com (telemetry)                       │
│  └─ marketplace.visualstudio.com (extensions)               │
├─────────────────────────────────────────────────────────────┤
│  BLOCKED                                                     │
│  └─ Everything else (verified by curl to example.com)       │
└─────────────────────────────────────────────────────────────┘
```

**Pros**:

- Works with Claude Code, OpenCode, AND VS Code
- Team standardization (everyone same environment)
- `--dangerously-skip-permissions` safe to use
- Firewall-enforced network isolation

**Cons**:

- Requires Docker
- More setup complexity
- Performance overhead (minimal)

---

### Option 3: Ralph Sandbox (Existing)

**What it is**: Alpine-based container specifically for Ralph autonomous work.

**Already implemented**: `docker/ralph-sandbox.Dockerfile`

**Use case**: When Ralph needs to work autonomously without human supervision.

---

## Implementation Plan

### Phase 1: Native Sandbox Support

**Goal**: Make it easy for Claude Code users to enable native sandboxing.

#### 1.1 Create sandbox configuration

Create `.claude/sandbox-config.json`:

```json
{
  "allowedDomains": [
    "registry.npmjs.org",
    "api.github.com",
    "github.com",
    "api.anthropic.com",
    "statsig.anthropic.com"
  ],
  "filesystem": {
    "readOnly": ["~/.config", "~/.gitconfig"],
    "denied": ["~/.ssh/id_*", "~/.aws/credentials"]
  }
}
```

#### 1.2 Update install.sh with `--sandbox` option

```bash
# New option
./install.sh --sandbox    # Configure native sandboxing for Claude Code
```

**What it does**:

1. Checks if Claude Code is installed
2. Creates/updates `~/.claude/settings.json` with sandbox config
3. Prints instructions for `/sandbox` command

---

### Phase 2: Devcontainer Support

**Goal**: Create a standardized dev environment that works with all providers.

#### 2.1 Create `.devcontainer/devcontainer.json`

```json
{
  "name": "Brain Dump Dev",
  "build": {
    "dockerfile": "Dockerfile",
    "args": {
      "TZ": "${localEnv:TZ:America/Los_Angeles}",
      "PNPM_VERSION": "9"
    }
  },
  "runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"],
  "customizations": {
    "vscode": {
      "extensions": [
        "anthropic.claude-code",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss"
      ]
    }
  },
  "mounts": [
    "source=brain-dump-pnpm-store,target=/home/node/.local/share/pnpm,type=volume",
    "source=brain-dump-bashhistory,target=/commandhistory,type=volume",
    "source=brain-dump-claude-config,target=/home/node/.claude,type=volume"
  ],
  "containerEnv": {
    "NODE_OPTIONS": "--max-old-space-size=4096",
    "PNPM_HOME": "/home/node/.local/share/pnpm"
  },
  "postStartCommand": "sudo /usr/local/bin/init-firewall.sh",
  "postCreateCommand": "pnpm install",
  "forwardPorts": [4242],
  "remoteUser": "node"
}
```

#### 2.2 Create `.devcontainer/Dockerfile`

```dockerfile
FROM node:20

ARG TZ
ENV TZ="$TZ"

ARG PNPM_VERSION=9

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Install dev tools + native build deps + firewall tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build tools for better-sqlite3
    python3 make g++ \
    # Dev utilities
    git curl less procps sudo fzf zsh man-db unzip gnupg2 gh \
    # Firewall tools
    iptables ipset iproute2 dnsutils aggregate jq \
    # Editors
    nano vim \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Setup node user permissions
ARG USERNAME=node
RUN mkdir -p /usr/local/share/pnpm-global && \
    chown -R node:node /usr/local/share/pnpm-global

# Persist bash history
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R $USERNAME /commandhistory

ENV DEVCONTAINER=true

# Create workspace and config directories
RUN mkdir -p /workspace /home/node/.claude && \
    chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

# Setup non-root user
USER node

ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV SHELL=/bin/bash

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
    echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
    chmod 0440 /etc/sudoers.d/node-firewall
USER node
```

#### 2.3 Create `.devcontainer/init-firewall.sh`

Adapt Anthropic's script with Brain Dump specifics (see Appendix A).

#### 2.4 Update install.sh with `--devcontainer` option

```bash
# New option
./install.sh --devcontainer    # Verify devcontainer setup
```

**What it does**:

1. Verifies `.devcontainer/` directory exists
2. Checks Docker is installed and running
3. Checks VS Code Remote-Containers extension (if VS Code installed)
4. Provides instructions for opening in container

---

### Phase 3: Update uninstall.sh

Add corresponding removal options:

- `--sandbox` - Remove sandbox configuration
- `--devcontainer` - Remove devcontainer volumes

---

## Install Script Integration

### Updated install.sh Options

```bash
# IDE Integration (existing)
./install.sh --claude         # Claude Code MCP + plugins + skills
./install.sh --vscode         # VS Code MCP + agents + skills
./install.sh --opencode       # OpenCode MCP + agents + skills

# Sandboxing (new)
./install.sh --sandbox        # Configure native Claude Code sandboxing
./install.sh --devcontainer   # Verify/setup devcontainer environment

# Docker (existing)
./install.sh --docker         # Build Ralph sandbox image

# Combined
./install.sh --all            # All IDEs + sandbox config
./install.sh --claude --sandbox   # Claude Code with native sandboxing
```

### Per-Provider Integration

| Provider        | Native Sandbox | Devcontainer | Notes             |
| --------------- | -------------- | ------------ | ----------------- |
| **Claude Code** | ✅ `/sandbox`  | ✅ Works     | Native is simpler |
| **OpenCode**    | ❌ N/A         | ✅ Works     | Devcontainer only |
| **VS Code**     | ❌ N/A         | ✅ Works     | Devcontainer only |

---

## Security Considerations

### Native Sandbox Limitations (from Anthropic docs)

1. **Network filtering**: Domain-based only, no traffic inspection
2. **Domain fronting**: Possible bypass via CDN domain fronting
3. **Unix sockets**: `allowUnixSockets` can grant dangerous access (e.g., Docker socket)
4. **Filesystem escalation**: Avoid write access to `$PATH` directories

### Devcontainer Limitations

1. **Docker socket**: If mounted, grants full host access
2. **Trusted repos only**: Don't use with untrusted code
3. **Credential exposure**: Mounted volumes may contain secrets

### Recommendations

| Use Case             | Recommended Approach            |
| -------------------- | ------------------------------- |
| Daily development    | Native sandbox (`/sandbox`)     |
| Team standardization | Devcontainer                    |
| Autonomous agents    | Ralph sandbox + Docker          |
| Maximum security     | Devcontainer + no Docker socket |

---

## Design Decisions

### SQLite Database Mounting

**Decision**: Mount from host (bind mount), NOT isolated volume.

**Rationale**:

- Developers want to see real data while working in the container
- Avoids data duplication between host and container
- Changes made in container are immediately visible on host
- Consistent with how the app runs outside container

**Implementation**:

```json
// In devcontainer.json mounts
"source=${localWorkspaceFolder}/../.brain-dump,target=/home/node/.brain-dump,type=bind"
```

**Note**: On macOS, the XDG path is `~/Library/Application Support/brain-dump/`

---

## Verification Checklist

### Native Sandbox

- [ ] `/sandbox` command works
- [ ] Network restrictions enforced
- [ ] Filesystem restrictions enforced
- [ ] `pnpm dev` works

### Devcontainer

- [ ] Opens in VS Code Remote-Containers
- [ ] `pnpm install` succeeds
- [ ] `pnpm dev` works (port 4242 forwarded)
- [ ] `pnpm check` passes
- [ ] Firewall blocks `curl https://example.com`
- [ ] Firewall allows `curl https://api.github.com`
- [ ] Claude Code authenticates inside container
- [ ] Data persists between restarts

---

## References

- [Claude Code Sandboxing Docs](https://code.claude.com/docs/en/sandboxing)
- [Claude Code Devcontainer Docs](https://code.claude.com/docs/en/devcontainer)
- [Anthropic Sandbox Runtime (OSS)](https://github.com/anthropic-experimental/sandbox-runtime)
- [Anthropic Devcontainer Reference](https://github.com/anthropics/claude-code/tree/main/.devcontainer)
- [OpenCode Devcontainers Plugin](https://github.com/athal7/opencode-devcontainers)
- [VS Code Devcontainer Spec](https://containers.dev/implementors/json_reference/)

---

## Appendix A: init-firewall.sh

See `https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer/init-firewall.sh` for the full reference implementation. Key additions for Brain Dump:

```bash
# Brain Dump specific domains (in addition to Anthropic's defaults)
# None required - localhost traffic stays within container
```
