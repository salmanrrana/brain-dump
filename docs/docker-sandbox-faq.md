# Docker Sandbox FAQ

Frequently asked questions about Brain Dump's Docker sandbox mode.

## General

### Why use Docker isolation?

Docker isolation protects your system when Ralph runs autonomously. Without it, Ralph has access to your entire filesystem, all your credentials, and unlimited resources. With sandbox mode:

- Ralph can only access the current project
- SSH keys stay on your machine (agent forwarding)
- Resource limits prevent runaway processes
- Changes are easier to audit and revert

**Bottom line**: Use sandbox mode when you want extra safety, especially for untrusted projects or long-running sessions.

### Does it slow things down?

Slightly. Docker adds about 5% overhead for most operations. The main impact is:

- **Container startup**: ~2-3 seconds per session
- **File I/O**: Negligible on Linux, slightly slower on macOS
- **Network**: Same as host

For most workflows, you won't notice the difference.

### What if I don't have Docker installed?

Brain Dump works fine without Docker. Just leave "Run Ralph in Docker sandbox" toggled OFF in settings. Ralph will run natively with full system access.

You can install Docker later and switch to sandbox mode anytime.

## Access & Permissions

### Can Ralph access my other projects?

**No** (in sandbox mode). Only the current project directory is mounted. Ralph cannot see:

- Other projects in your workspace
- Your home directory
- System files
- Other users' files

The container's `/workspace` maps only to your current project.

### Can Ralph access the internet?

**Yes**. The container has internet access for:

- Installing npm/pip packages
- Making API calls (Anthropic, GitHub)
- Cloning git repositories
- Downloading dependencies

To restrict internet access, you'd need to create a custom network configuration.

### What credentials does Ralph have access to?

| Credential | Access | How |
|------------|--------|-----|
| Anthropic API key | Yes | Mounted config (read-only) |
| SSH keys | No* | Agent forwarding only |
| GitHub token | Yes | Mounted gh config (read-only) |
| Git identity | Yes | Mounted gitconfig (read-only) |

*SSH agent forwarding means your keys never enter the container—only the SSH agent socket is shared.

### Can Ralph push to GitHub?

**Yes**, if you have SSH agent running. Ralph uses your SSH agent to authenticate git operations:

```bash
# Make sure this is running before starting Ralph
eval $(ssh-agent)
ssh-add
```

See [docker-git-push.md](./docker-git-push.md) for details.

### Can Ralph create pull requests?

**Yes**. Your GitHub CLI config (`~/.config/gh`) is mounted read-only, so `gh pr create` works inside the container.

## Dev Servers & Testing

### How do I test my app's UI?

When Ralph starts a dev server, it uses mapped ports. Access them from your browser:

| Dev Server | URL |
|------------|-----|
| Frontend (Vite, Next.js) | http://localhost:8100 |
| Backend (Express, etc.) | http://localhost:8200 |
| Storybook | http://localhost:8300 |

The ticket modal shows a "Running Services" panel when servers are active.

### What ports are available?

| Range | Purpose |
|-------|---------|
| 8100-8110 | Frontend dev servers |
| 8200-8210 | Backend servers |
| 8300-8310 | Documentation (Storybook, etc.) |
| 8400-8410 | Databases (debugging) |

Ralph should bind to `0.0.0.0` (not `127.0.0.1`) for the port mapping to work.

## Session Management

### How do I stop Ralph if it's stuck?

1. **Close the terminal window** - Container stops immediately
2. **Press Ctrl+C** - Sends interrupt signal
3. **Docker command** - `docker stop ralph-*`
4. **Kill from UI** - Close the ticket modal

The container is removed automatically when stopped (`--rm` flag).

### What's the timeout for?

Ralph sessions have a default 1-hour timeout to prevent:

- Forgotten sessions running indefinitely
- Resource consumption from stuck processes
- Unexpected API costs

Configure timeout in Settings. When reached, Ralph saves progress to `plans/progress.txt` and exits cleanly.

### How do I continue interrupted work?

Just start Ralph again. It reads:

1. `plans/prd.json` - Which tickets are done
2. `plans/progress.txt` - Notes from previous sessions

Ralph picks up where it left off.

## Technical

### Can I use Podman instead of Docker?

**Experimentally**. Podman is largely compatible with Docker. You can try:

```bash
alias docker=podman
```

However, we haven't tested all features with Podman. Known differences:

- rootless mode may affect volume permissions
- network handling varies slightly
- Some Docker-specific flags may not work

### What base image does the sandbox use?

Alpine Linux with Node.js 20. The image includes:

- Node.js 20 (npm included)
- git
- curl
- bash
- jq
- GitHub CLI (gh)
- Claude CLI

Size: ~150MB

### Can I customize the Docker image?

Yes. Edit `docker/ralph-sandbox.Dockerfile` and rebuild:

```bash
docker build -t brain-dump-ralph-sandbox:latest -f docker/ralph-sandbox.Dockerfile docker/
```

Common customizations:

- Add Python: `RUN apk add python3 py3-pip`
- Add build tools: `RUN apk add build-base`
- Pre-install packages

### Why Alpine instead of Debian/Ubuntu?

Smaller image size (~150MB vs ~400MB). Faster to download and build.

Tradeoff: Alpine uses musl libc. Some binaries compiled for glibc won't work. If you hit compatibility issues, you can modify the Dockerfile to use `node:20` instead of `node:20-alpine`.

## Troubleshooting

### "Permission denied" on git push

SSH agent not running. Fix:

```bash
eval $(ssh-agent)
ssh-add
ssh-add -l  # Verify key is loaded
```

Then restart Ralph.

### "Address already in use"

Another process is using the port. Find and stop it:

```bash
lsof -i :8100
kill -9 <PID>
```

### Container keeps getting killed

Out of memory. Options:

1. Reduce parallel processes in your build
2. Increase memory limit (requires code change currently)
3. Use native mode instead

### Dev server not accessible

Make sure the server binds to `0.0.0.0`:

```bash
# Wrong
npm run dev

# Right
npm run dev -- --host 0.0.0.0
```

## Further Reading

- [Docker Isolation Architecture](./docker-isolation-architecture.md) - How the sandbox works
- [Docker Sandbox Guide](./docker-sandbox-guide.md) - Step-by-step usage
- [Security Model](./security.md) - Detailed security analysis
- [Git Push Troubleshooting](./docker-git-push.md) - SSH agent details
