# Docker Sandbox Configuration (Ralph)

This document describes Docker configuration for Ralph sandbox mode, including port exposure and git push setup.

## Port Exposure for Dev Servers

When running Ralph in Docker sandbox mode, the following port ranges are exposed to allow developers to access dev servers from their host browser:

| Port Range | Purpose | Examples |
|------------|---------|----------|
| 8100-8110 | Frontend dev servers | Vite, Next.js, React, Create React App |
| 8200-8210 | Backend APIs | Express, Fastify, NestJS, Django |
| 8300-8310 | Documentation & Storybook | Storybook, Docusaurus, VitePress |
| 8400-8410 | Databases (debugging) | PostgreSQL GUI, Redis Commander |

### Accessing Dev Servers

When Ralph starts a dev server inside the container, use the exposed port from your host browser:

```bash
# Inside container - Ralph starts Vite on port 8100
pnpm dev --port 8100 --host 0.0.0.0

# On host - access the dev server
open http://localhost:8100
```

**Important**: Dev servers must bind to `0.0.0.0` (not `localhost`) to be accessible from outside the container.

### Port Convention in Practice

When starting servers, use these port conventions:
- First frontend project → 8100
- Second frontend project → 8101
- First backend API → 8200
- Storybook → 8300

---

## Git Push from Container

This section describes how Ralph can push code to GitHub from inside the Docker sandbox container.

## Overview

When running Ralph in sandbox mode (Docker), the container is isolated from the host system. To enable git push, we forward the host's SSH agent socket and known_hosts file into the container.

## How It Works

### SSH Agent Forwarding

The host's SSH agent socket is mounted into the container:

```bash
docker run ... \
  -v $SSH_AUTH_SOCK:/ssh-agent \
  -e SSH_AUTH_SOCK=/ssh-agent \
  ...
```

This allows Ralph to use your existing SSH keys without copying them into the container. The keys never touch the container filesystem - only the socket is shared.

### Known Hosts

The host's `~/.ssh/known_hosts` file is mounted read-only:

```bash
docker run ... \
  -v $HOME/.ssh/known_hosts:/home/ralph/.ssh/known_hosts:ro \
  ...
```

This prevents the "The authenticity of host 'github.com' can't be established" prompt when pushing to GitHub.

### GitHub CLI

The host's GitHub CLI config is also mounted:

```bash
docker run ... \
  -v $HOME/.config/gh:/home/ralph/.config/gh:ro \
  ...
```

This allows Ralph to create PRs using `gh pr create`.

## Expected Workflow

```
Ralph in container:
1. Makes code changes
2. git add && git commit -m "feat: ..."
3. git push -u origin feature/ticket-123
4. gh pr create --title "..." --body "..."
```

## Setup Requirements

### 1. Start SSH Agent

Before launching Ralph in sandbox mode, ensure your SSH agent is running and has your GitHub key loaded:

```bash
# Start SSH agent (if not already running)
eval $(ssh-agent)

# Add your GitHub SSH key
ssh-add ~/.ssh/id_ed25519  # or id_rsa, depending on your key type

# Verify keys are loaded
ssh-add -l
```

### 2. GitHub CLI Authentication

Ensure you're logged into GitHub CLI:

```bash
# Check auth status
gh auth status

# If not logged in
gh auth login
```

### 3. SSH to GitHub

Ensure GitHub is in your known_hosts:

```bash
# Test SSH connection (adds GitHub to known_hosts if not present)
ssh -T git@github.com
```

## Platform Differences

### macOS

On macOS, the SSH agent socket path varies but is typically managed by the system. Common locations:

- `/private/tmp/com.apple.launchd.*/Listeners` (system)
- `/tmp/ssh-*/agent.*` (manually started)

The `SSH_AUTH_SOCK` environment variable points to the correct location.

**macOS Keychain Integration**: If you've added your SSH key to the macOS keychain (`ssh-add --apple-use-keychain`), it will automatically be available after login.

### Linux

On Linux, the SSH agent is typically started manually or via your desktop environment:

```bash
# Manual start
eval $(ssh-agent)
ssh-add ~/.ssh/id_ed25519
```

**Systemd User Service**: Some distributions provide a user-level systemd service for the SSH agent. Check with `systemctl --user status ssh-agent`.

### Docker Desktop vs Native Docker

- **Docker Desktop (macOS/Windows)**: SSH socket forwarding works through Docker's VM layer
- **Native Docker (Linux)**: Direct socket forwarding, no VM layer

Both work with the same mount syntax.

## Error Handling

### SSH Agent Not Running

**Symptom**: Pre-launch warning in terminal:
```
⚠ SSH agent not running - git push may not work
  Start with: eval $(ssh-agent) && ssh-add
```

**Fix**: Start the SSH agent and add your key:
```bash
eval $(ssh-agent)
ssh-add ~/.ssh/id_ed25519
```

### Host Key Verification Failed

**Symptom**: `Host key verification failed` when pushing

**Cause**: GitHub is not in your known_hosts file

**Fix**: Connect to GitHub once to add to known_hosts:
```bash
ssh -T git@github.com
```

### Permission Denied (publickey)

**Symptom**: `Permission denied (publickey)` when pushing

**Possible causes**:
1. SSH key not loaded in agent
2. SSH key not associated with your GitHub account
3. Repository access not granted

**Fixes**:
```bash
# Check if key is loaded
ssh-add -l

# Add key if not loaded
ssh-add ~/.ssh/id_ed25519

# Test GitHub connection
ssh -T git@github.com

# If above fails, ensure key is added to GitHub:
# https://github.com/settings/keys
```

### gh: Not logged in

**Symptom**: `gh: not logged in to any hosts` when creating PR

**Fix**: Authenticate with GitHub CLI:
```bash
gh auth login
```

## Security Considerations

1. **Socket-only access**: Only the SSH agent socket is shared, not the private keys themselves
2. **Read-only mounts**: Config files (known_hosts, gh config) are mounted read-only
3. **Container isolation**: When the container stops, all access is revoked
4. **No key persistence**: Keys never exist on the container filesystem

## Test Cases

| Scenario | Expected Behavior |
|----------|------------------|
| SSH agent running, key loaded | `git push` works, green checkmark at launch |
| SSH agent not running | Warning at launch, `git push` fails with clear error |
| known_hosts exists | No SSH prompts, push succeeds |
| known_hosts missing | SSH prompt on first push, then succeeds |
| gh authenticated | `gh pr create` works |
| gh not authenticated | Clear error with login instructions |
| No repo access | `git push` fails with permission error |

## Troubleshooting

### Debugging SSH Issues

From inside the container (or test locally):

```bash
# Verbose SSH to see what's happening
ssh -vT git@github.com

# Check which key SSH is trying to use
ssh-add -l

# Check SSH agent socket
echo $SSH_AUTH_SOCK
ls -la $SSH_AUTH_SOCK
```

### Verifying Mounts

Check that the mounts are in place:

```bash
# Inside container
ls -la /home/ralph/.ssh/
echo $SSH_AUTH_SOCK
ls -la /ssh-agent
```
