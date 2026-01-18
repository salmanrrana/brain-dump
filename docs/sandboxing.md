# Sandboxing Options

Brain Dump supports three levels of isolation for AI-assisted development. Choose based on your security requirements, team setup, and tooling preferences.

## Quick Comparison

| Feature                  | Native Sandbox                 | Devcontainer                | Ralph Sandbox         |
| ------------------------ | ------------------------------ | --------------------------- | --------------------- |
| **Setup**                | Easiest                        | Medium                      | Already built         |
| **Providers**            | Claude Code only               | All (CC, OpenCode, VS Code) | All                   |
| **Docker Required**      | No                             | Yes                         | Yes                   |
| **Network Isolation**    | Domain allowlist               | Firewall + allowlist        | Firewall + allowlist  |
| **Filesystem Isolation** | OS-level (bubblewrap/Seatbelt) | Full container              | Full container        |
| **Use Case**             | Day-to-day development         | Team standardization        | Autonomous agent work |

## When to Use Which

| Scenario                     | Recommended Option              |
| ---------------------------- | ------------------------------- |
| Quick personal development   | Native Sandbox                  |
| Team with shared environment | Devcontainer                    |
| Running Ralph autonomously   | Ralph Sandbox                   |
| Maximum security needed      | Devcontainer (no Docker socket) |
| No Docker available          | Native Sandbox                  |
| Using OpenCode or VS Code    | Devcontainer                    |

---

## Option 1: Native Sandbox (Claude Code)

Claude Code has built-in OS-level sandboxing that works without Docker.

### How It Works

- **Linux**: Uses [bubblewrap](https://github.com/containers/bubblewrap) for container-like isolation
- **macOS**: Uses Apple's Seatbelt sandbox

### Enabling

In Claude Code, run:

```
/sandbox
```

Or use the install script:

```bash
./install.sh --sandbox
```

This configures `~/.claude/settings.json` with:

```json
{
  "sandbox": {
    "enabled": true
  }
}
```

### What It Protects Against

```
FILESYSTEM
├─ Read/Write: Current directory and subdirectories ✓
├─ Read-only: Rest of system ✓
└─ Blocked: Writes outside current directory ✗

NETWORK
├─ Allowed: Approved domains only ✓
├─ Blocked: Unapproved domains ✗
└─ Prompts: New domain requests trigger approval
```

### Allowed Domains (Default)

- `registry.npmjs.org` - npm packages
- `api.github.com`, `github.com` - Git operations
- `api.anthropic.com` - Claude API
- `statsig.anthropic.com` - Telemetry

### Configuration Options

Edit `~/.claude/settings.json`:

```json
{
  "sandbox": {
    "enabled": true,
    "network": {
      "httpProxyPort": 8080,
      "socksProxyPort": 8081
    }
  }
}
```

### Limitations

1. **Claude Code only** - Not available in OpenCode or VS Code
2. **Tool incompatibility** - Some tools don't work:
   - `watchman` (file watching)
   - `docker` commands (container-in-container issues)
3. **Domain-based only** - No traffic inspection (domain fronting possible)

### References

- [Claude Code Sandboxing Docs](https://code.claude.com/docs/en/sandboxing)
- [Sandbox Runtime (Open Source)](https://github.com/anthropic-experimental/sandbox-runtime)

---

## Option 2: Devcontainer (Docker + VS Code)

A full Docker container with network firewall. Works with Claude Code, OpenCode, and VS Code.

### Prerequisites

1. **Docker** installed and running
   - [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
   - [Docker Engine for Linux](https://docs.docker.com/engine/install/)

2. **VS Code** with Remote-Containers extension (optional but recommended)
   ```bash
   code --install-extension ms-vscode-remote.remote-containers
   ```

### Opening in Container

**VS Code** (recommended):

1. Open the project folder
2. Press `F1` and run: "Dev Containers: Reopen in Container"
3. Wait for container to build (first time only)

**CLI** (without VS Code):

```bash
# Install devcontainer CLI
npm install -g @devcontainers/cli

# Start container
devcontainer up --workspace-folder .

# Open shell in container
devcontainer exec --workspace-folder . bash
```

**Install Script Helper**:

```bash
./install.sh --devcontainer
```

This verifies your setup and provides guidance.

### What the Firewall Allows

The `init-firewall.sh` script creates an allowlist using iptables/ipset:

| Domain                                 | Purpose            |
| -------------------------------------- | ------------------ |
| `registry.npmjs.org`                   | npm packages       |
| `api.github.com` + GitHub IPs          | Git operations     |
| `api.anthropic.com`                    | Claude API         |
| `statsig.anthropic.com`, `statsig.com` | Telemetry          |
| `sentry.io`                            | Error tracking     |
| `marketplace.visualstudio.com`         | VS Code extensions |
| `vscode.blob.core.windows.net`         | VS Code downloads  |
| `update.code.visualstudio.com`         | VS Code updates    |

Everything else is **blocked** with immediate rejection (not timeout).

### Firewall Verification

Inside the container:

```bash
# This should FAIL (blocked)
curl https://example.com
# Error: Network is unreachable

# This should SUCCEED (allowed)
curl https://api.github.com/zen
# "Some wisdom quote..."
```

### Data Persistence

| Data            | Storage Type         | Persists?              |
| --------------- | -------------------- | ---------------------- |
| pnpm packages   | Named volume         | Yes                    |
| Bash history    | Named volume         | Yes                    |
| Claude config   | Named volume         | Yes                    |
| SQLite database | Bind mount from host | Yes (shared with host) |

**Important**: The SQLite database is bind-mounted from your host machine. Changes in the container are immediately visible on the host.

**macOS**: Uses `~/Library/Application Support/brain-dump/`
**Linux**: Set `BRAIN_DUMP_HOST_DATA_DIR=~/.local/share/brain-dump` before opening

### Container Ports

| Service        | Container Port | Host Port |
| -------------- | -------------- | --------- |
| Brain Dump Web | 4242           | 4242      |

### Troubleshooting

#### Container Won't Start

```bash
# Check Docker is running
docker info

# Check for port conflicts
lsof -i :4242

# Rebuild container
docker build -t brain-dump-dev -f .devcontainer/Dockerfile .devcontainer/
```

#### pnpm Install Fails

Usually a network issue:

```bash
# Verify npm registry is reachable
curl https://registry.npmjs.org

# If blocked, firewall script may have failed
sudo /usr/local/bin/init-firewall.sh
```

#### Database Not Visible

Check bind mount path:

```bash
# Inside container
ls -la /home/node/.brain-dump/

# If empty, check host path exists
# macOS: ~/Library/Application Support/brain-dump/
# Linux: ~/.local/share/brain-dump/
```

#### Extensions Not Installing

The container needs to reach VS Code's extension marketplace:

```bash
curl https://marketplace.visualstudio.com
```

If blocked, the firewall script may need updating.

### References

**Claude Code:**

- [Claude Code Devcontainer Docs](https://code.claude.com/docs/en/devcontainer)
- [Anthropic Reference Implementation](https://github.com/anthropics/claude-code/tree/main/.devcontainer)

**VS Code Dev Containers:**

- [Dev Containers Overview](https://code.visualstudio.com/docs/devcontainers/containers) - Core concepts and architecture
- [Dev Containers Tutorial](https://code.visualstudio.com/docs/devcontainers/tutorial) - Step-by-step getting started
- [Attach to Running Container](https://code.visualstudio.com/docs/devcontainers/attach-container) - Connect to existing containers
- [Create a Dev Container](https://code.visualstudio.com/docs/devcontainers/create-dev-container) - Customize your configuration
- [Advanced Containers](https://code.visualstudio.com/remote/advancedcontainers/overview) - Port forwarding, volumes, networking
- [devcontainer.json Reference](https://containers.dev/implementors/json_reference/) - Full configuration spec
- [Dev Container CLI](https://code.visualstudio.com/docs/devcontainers/devcontainer-cli) - Command-line usage
- [Tips and Tricks](https://code.visualstudio.com/docs/devcontainers/tips-and-tricks) - Performance and workflow tips
- [FAQ](https://code.visualstudio.com/docs/devcontainers/faq) - Common questions and answers

---

## Option 3: Ralph Sandbox

A purpose-built Docker container for Ralph's autonomous agent work.

### When to Use

- Running Ralph on tickets/epics autonomously
- You want network isolation without devcontainer complexity
- You need resource limits (CPU, memory)

### Enabling

1. Open Brain Dump at http://localhost:4242
2. Click **Settings** (gear icon)
3. Toggle **"Run Ralph in Docker sandbox"** to ON
4. Click **"Build Sandbox Image"** (first time only)

Or via install script:

```bash
./install.sh --docker
```

### Starting Ralph in Sandbox

**On a Ticket**:

1. Open a ticket modal
2. Click "Start Ralph"
3. Terminal opens with Ralph in Docker

**On an Epic**:

1. Click epic in sidebar
2. Select "Start Ralph" from dropdown

### What's Different from Devcontainer

| Feature             | Devcontainer     | Ralph Sandbox        |
| ------------------- | ---------------- | -------------------- |
| Base image          | node:20 (Debian) | Alpine               |
| Purpose             | Development      | Autonomous execution |
| VS Code integration | Yes              | No                   |
| Resource limits     | No               | Yes (configurable)   |
| Session timeout     | No               | Yes (default 1 hour) |

### Resource Limits

Default limits:

- **Memory**: 4GB
- **CPU**: 2 cores
- **Timeout**: 1 hour

Configure in Settings or via environment variables.

### Port Mapping

Ralph containers use a different port range:

| Service                  | Host Port |
| ------------------------ | --------- |
| Frontend (Vite, Next.js) | 8100      |
| Backend (Express)        | 8200      |
| Storybook                | 8300      |

### SSH Agent Forwarding

For git push to work:

```bash
# Start SSH agent
eval $(ssh-agent)
ssh-add

# Verify key is loaded
ssh-add -l

# Test GitHub connection
ssh -T git@github.com
```

Ralph mounts `SSH_AUTH_SOCK` for forwarding.

### Detailed Documentation

- [Docker Sandbox Guide](./docker-sandbox-guide.md) - Full usage guide
- [Docker Isolation Architecture](./docker-isolation-architecture.md) - How it works
- [Git Push Troubleshooting](./docker-git-push.md) - SSH issues

---

## Security Considerations

### Native Sandbox Limitations

1. **Domain fronting**: Possible bypass via CDN domain fronting
2. **Unix sockets**: If `allowUnixSockets` is enabled, grants dangerous access (e.g., Docker socket)
3. **Path escalation**: Avoid write access to `$PATH` directories

### Devcontainer Limitations

1. **Docker socket**: If mounted, grants full host access - avoid in production
2. **Trusted repos only**: Don't use with untrusted code
3. **Credential exposure**: Mounted volumes may contain secrets
4. **Container escape**: Rare but possible with kernel exploits

### Ralph Sandbox Limitations

1. **SSH key exposure**: SSH agent is forwarded - don't run untrusted code
2. **Resource exhaustion**: Without limits, can affect host system
3. **Network access**: Still has access to allowed domains

### Best Practices

1. **Never mount Docker socket** unless absolutely necessary
2. **Use read-only mounts** for credentials (`~/.config/gh:ro`)
3. **Set resource limits** for autonomous agents
4. **Review before merge** - Even sandboxed AI output needs human review
5. **Rotate credentials** regularly when used in containers

---

## Quick Reference

### Install Script Options

```bash
# Configure native sandboxing
./install.sh --sandbox

# Verify devcontainer setup
./install.sh --devcontainer

# Build Ralph sandbox image
./install.sh --docker

# All together
./install.sh --claude --sandbox  # Claude Code with native sandbox
```

### Uninstall Options

```bash
# Remove sandbox configuration
./uninstall.sh --sandbox

# Remove devcontainer volumes
./uninstall.sh --devcontainer

# Both
./uninstall.sh --all
```

### Environment Variables

| Variable                   | Purpose                   | Default                                            |
| -------------------------- | ------------------------- | -------------------------------------------------- |
| `BRAIN_DUMP_HOST_DATA_DIR` | Database location on host | `~/Library/Application Support/brain-dump` (macOS) |
| `DOCKER_HOST`              | Custom Docker socket      | Auto-detected                                      |
| `SSH_AUTH_SOCK`            | SSH agent socket          | Auto-detected                                      |

---

## Further Reading

- [Claude Code Setup](./claude-code-setup.md)
- [Security Model](./security.md)
- [Docker Sandbox FAQ](./docker-sandbox-faq.md)
