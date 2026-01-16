# Docker Sandbox Guide

A step-by-step guide for using Ralph in Docker sandbox mode.

## Prerequisites

### 1. Docker Installed

Install Docker Desktop or Docker Engine:

- **macOS**: [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- **Linux**: [Docker Engine](https://docs.docker.com/engine/install/)
- **Windows**: [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)

Verify Docker is running:
```bash
docker info
```

### 2. SSH Agent Running

For git push to work from inside the container, you need SSH agent forwarding:

```bash
# Start SSH agent and add your key
eval $(ssh-agent)
ssh-add

# Verify it's working
ssh-add -l
```

**Tip**: Add these lines to your `~/.bashrc` or `~/.zshrc` to start the agent automatically:
```bash
if [ -z "$SSH_AUTH_SOCK" ]; then
    eval $(ssh-agent) > /dev/null
    ssh-add -q
fi
```

### 3. Claude Code Authenticated

Make sure you're logged into Claude Code:
```bash
claude --version  # Should show version without error
```

## Enabling Sandbox Mode

1. Open Brain Dump at http://localhost:4242
2. Click the **Settings** icon (gear) in the sidebar
3. Toggle **"Run Ralph in Docker sandbox"** to ON
4. Click **"Build Sandbox Image"** (first time only, takes ~1 minute)

The settings panel will show:
- ✓ Docker available
- ✓ Docker running
- ✓ Sandbox image built

## Starting Ralph

### On a Single Ticket

1. Click on a ticket in the kanban board
2. Click the **"Start Ralph"** button in the ticket modal
3. A terminal window opens with Ralph running in Docker

### On an Entire Epic

1. Click on an epic in the sidebar
2. Click the dropdown arrow next to "Save Changes"
3. Select **"Start Ralph"**
4. Ralph will work through all incomplete tickets

## Testing Your App

When Ralph starts a dev server, it uses mapped port ranges:

| Your Dev Server | Access URL |
|-----------------|------------|
| Frontend (Vite, Next.js) | http://localhost:8100 |
| Backend (Express, etc.) | http://localhost:8200 |
| Storybook | http://localhost:8300 |

### Checking Running Services

If a ticket is in progress with running services:

1. Open the ticket modal
2. Look for the **"Running Services"** panel at the bottom
3. Click service links to open in browser

Services are discovered from `.ralph-services.json` in your project root.

## Git Operations

### Committing Changes

Ralph commits changes automatically with messages like:
```
feat(ticket-id): description of changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Pushing to Remote

If SSH agent is forwarded correctly, Ralph can push:
```bash
# This works because SSH_AUTH_SOCK is forwarded
git push origin feature/ticket-id
```

### Creating Pull Requests

Ralph uses GitHub CLI (gh) to create PRs:
```bash
gh pr create --title "..." --body "..."
```

Your `~/.config/gh` is mounted read-only so gh auth works.

## Session Management

### Timeout

Sessions have a default 1-hour timeout. Configure in settings.

When timeout is reached:
1. Container stops gracefully (30s grace period)
2. Progress is logged to `plans/progress.txt`
3. You can restart Ralph to continue

### Stopping Ralph Early

Close the terminal window or press `Ctrl+C` to stop.

### Checking Progress

- **Brain Dump UI**: Ticket status updates in real-time
- **progress.txt**: `cat plans/progress.txt` for detailed logs
- **prd.json**: `cat plans/prd.json` to see completion status

## Troubleshooting

### SSH Agent Not Running

**Symptom**: "Permission denied (publickey)" when pushing

**Fix**:
```bash
# On host machine, start SSH agent
eval $(ssh-agent)
ssh-add

# Verify key is loaded
ssh-add -l

# Test GitHub connection
ssh -T git@github.com
```

Then restart Ralph.

### Port Already in Use

**Symptom**: "Address already in use" when starting dev server

**Fix**:
```bash
# Find what's using the port
lsof -i :8100

# Kill the process
kill -9 <PID>
```

Or use a different port from the allocated range (8100-8110).

### Container Out of Memory

**Symptom**: Container crashes or processes are killed

**Fix**:
1. Open Settings in Brain Dump
2. Increase memory limit (requires editing docker run command currently)
3. Or reduce parallel processes in your build

### Image Build Fails

**Symptom**: "Failed to build sandbox image"

**Fix**:
```bash
# Check Docker is running
docker info

# Build manually to see detailed errors
cd /path/to/brain-dump
docker build -t brain-dump-ralph-sandbox:latest -f docker/ralph-sandbox.Dockerfile docker/
```

### Can't Access Dev Server

**Symptom**: localhost:8100 shows nothing

**Fixes**:
1. Check Ralph actually started the server (look at terminal output)
2. Make sure server binds to `0.0.0.0`, not `127.0.0.1`:
   ```bash
   # Wrong - only accessible inside container
   npm run dev  # Usually binds to 127.0.0.1

   # Right - accessible from host
   npm run dev -- --host 0.0.0.0
   ```
3. Check `.ralph-services.json` was created with the correct port

### Host Key Verification Failed

**Symptom**: "Host key verification failed" on git operations

**Fix**: The known_hosts file should be mounted. If not:
```bash
# On host, add GitHub's key
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

Then restart Ralph.

## Tips

### Watching Ralph Work

The terminal shows everything Ralph does. Watch for:
- "Starting iteration X of Y"
- File edits and test runs
- Commit messages
- "All tasks complete!" when done

### Continuing Interrupted Work

If Ralph times out or crashes:
1. Ralph logs progress to `plans/progress.txt`
2. Just restart Ralph - it reads progress.txt and continues
3. Completed tickets are tracked in `plans/prd.json`

### Cleaning Up

Containers are auto-removed (`--rm` flag). If something gets stuck:
```bash
# List all containers
docker ps -a

# Force remove stuck container
docker rm -f ralph-<session-id>
```

## Further Reading

- [Docker Isolation Architecture](./docker-isolation-architecture.md) - How the sandbox works
- [Security Model](./security.md) - What Ralph can and cannot do
- [Git Push Troubleshooting](./docker-git-push.md) - SSH agent details
