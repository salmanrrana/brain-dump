# Security Model

This document describes the security model for Brain Dump's Docker sandbox mode, intended for security reviewers and enterprises evaluating the tool.

## Threat Model

### What We Protect Against

Brain Dump's sandbox mode is designed to protect against:

1. **Project isolation breach** - AI accessing files outside the current project
2. **Credential theft** - AI exfiltrating SSH keys, API tokens, or other secrets
3. **Resource exhaustion** - Runaway processes consuming all system resources
4. **Privilege escalation** - AI gaining elevated permissions on the host
5. **Persistent compromise** - Malicious changes surviving session end

### What We Don't Protect Against

The sandbox is NOT designed to protect against:

1. **Malicious code in the project** - If the project already contains malware, the sandbox won't stop it
2. **Network-based attacks** - Container has internet access for package installation
3. **Side-channel attacks** - No protection against speculative execution vulnerabilities
4. **Supply chain attacks** - npm/pip packages are installed from public registries

## Isolation Mechanisms

### Filesystem Isolation

| Boundary | How Enforced | Verification |
|----------|--------------|--------------|
| Project only | Single volume mount at `/workspace` | `docker inspect` shows only project mounted |
| Read-only configs | `:ro` flag on credential mounts | Cannot modify ~/.config/* |
| No host access | No mounts to /etc, /var, $HOME | `ls /` shows only container filesystem |

**Technical details**:
- Project directory mounted at `/workspace` (read/write)
- `~/.config/claude-code` mounted read-only (API auth)
- `~/.gitconfig` mounted read-only (git identity)
- `~/.config/gh` mounted read-only (GitHub CLI)
- `~/.ssh/known_hosts` mounted read-only (host verification)

### Credential Handling

| Credential | Method | Risk Mitigation |
|------------|--------|-----------------|
| SSH keys | Agent forwarding | Keys never enter container |
| Anthropic API key | Mounted config (ro) | Cannot modify, harder to exfiltrate |
| GitHub token | Mounted gh config (ro) | Cannot modify |
| Git author | Mounted gitconfig (ro) | All commits attributed to user |

**SSH Agent Forwarding** (recommended approach):
- Socket is forwarded via `SSH_AUTH_SOCK`
- Private keys remain on host machine
- Agent handles signing operations
- Container only receives signed results

### Resource Limits

| Resource | Default Limit | Purpose |
|----------|---------------|---------|
| Memory | 2 GB | Prevents OOM killer on host |
| Swap | 2 GB (same) | No swap, fail fast on OOM |
| CPUs | 1.5 cores | Prevents CPU monopolization |
| PIDs | 256 | Prevents fork bombs |
| Timeout | 1 hour | Prevents indefinite execution |

### Security Options

```bash
--security-opt=no-new-privileges:true
```

This prevents:
- setuid/setgid binaries from escalating privileges
- Processes from gaining new capabilities
- Container escape via privilege escalation

### User Isolation

Container runs as non-root user `ralph` (UID 1000):
- Cannot install system packages
- Cannot modify system configuration
- Cannot access other users' files

## Capabilities Summary

### What the AI CAN Do

| Action | How | Audit Trail |
|--------|-----|-------------|
| Read project files | `/workspace` mount | Git diff shows changes |
| Write project files | `/workspace` mount | Git commits track all changes |
| Run shell commands | bash in container | Terminal output logged |
| Install packages | npm/pip in container | package.json/requirements.txt changes |
| Run tests | Project test commands | Test output in terminal |
| Commit to git | Mounted gitconfig | All commits in git log |
| Push to remote | SSH agent forwarding | Push logs on remote |
| Create PRs | GitHub CLI | PR visible on GitHub |
| Start dev servers | Mapped ports 8100-8410 | Services tracked in .ralph-services.json |

### What the AI CANNOT Do

| Action | Why Not | Enforcement |
|--------|---------|-------------|
| Access other projects | Single mount | Docker volume isolation |
| Read SSH keys | Agent forwarding only | Keys not mounted |
| Modify credentials | Read-only mounts | `:ro` flag |
| Run as root | USER directive | Dockerfile sets non-root user |
| Escape container | no-new-privileges | Security option |
| Run indefinitely | Timeout | Shell script enforces |
| Consume all RAM | Memory limit | Docker cgroup |
| Fork bomb | PID limit | Docker cgroup |
| Access host network | Bridge network | Default Docker networking |
| Persist after exit | --rm flag | Container auto-removed |

## Audit Trail

### Git History

All file changes are tracked in git:
```bash
git log --oneline --all    # See all commits
git diff HEAD~5            # See recent changes
git blame <file>           # See who changed what
```

Ralph commits include:
```
feat(ticket-id): description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Brain Dump Logs

- **Ticket comments** - Work summaries posted to each ticket
- **progress.txt** - Detailed session logs
- **prd.json** - Task completion tracking

### Terminal Output

Terminal window shows all commands executed and their output.

## Recommendations for Additional Hardening

### Network Restrictions

For stricter isolation, add network restrictions:

```bash
# Create isolated network with no external access
docker network create --internal ralph-isolated

# Or use network=none for complete isolation
# (breaks npm install, API calls)
docker run --network=none ...
```

### Read-Only Filesystem

For even stricter control:

```bash
docker run --read-only \
  --tmpfs /tmp \
  --tmpfs /home/ralph/.npm \
  ...
```

Note: This may break package installation.

### Resource Limits

Adjust based on your security requirements:

```bash
# More restrictive
--memory=1g
--cpus=1
--pids-limit=100

# Time limit (in settings)
ralphTimeout: 1800  # 30 minutes
```

### AppArmor/SELinux

On Linux hosts, Docker automatically applies AppArmor profiles. For custom policies:

```bash
docker run --security-opt apparmor=my-profile ...
```

### Seccomp

Restrict system calls:

```bash
docker run --security-opt seccomp=profile.json ...
```

### Audit Logging

Enable Docker audit logging:

```bash
# /etc/audit/rules.d/docker.rules
-w /usr/bin/docker -p wa -k docker
-w /var/lib/docker -p wa -k docker
-w /etc/docker -p wa -k docker
```

## Comparison with Alternatives

| Approach | Isolation Level | Usability | Overhead |
|----------|----------------|-----------|----------|
| No sandbox (native) | None | Best | None |
| Docker sandbox | Container-level | Good | ~5% |
| VM sandbox | Hardware-level | Lower | ~20% |
| Remote execution | Network-level | Lowest | Variable |

Brain Dump chose Docker sandbox as the best balance of security and usability for autonomous AI coding.

## Known Limitations

1. **Network access** - Container can reach the internet. Needed for package installation and API calls.

2. **Shared project directory** - Changes are immediately visible on host. This is by design for real-time feedback.

3. **Alpine-based image** - Uses musl libc. Some binaries compiled for glibc may not work.

4. **Git history** - AI can amend/rebase commits within the session. Review before merging.

5. **Mounted configs** - While read-only, sensitive data like API keys are accessible to the AI for legitimate use.

## Incident Response

If you suspect a security issue:

1. **Stop the container**: Close terminal or `docker stop ralph-*`
2. **Review changes**: `git diff`, `git log`
3. **Revert if needed**: `git reset --hard origin/main`
4. **Check credentials**: Rotate API keys if concerned
5. **Report**: Open issue at github.com/anthropics/brain-dump

## Questions?

For security questions not covered here, please open an issue or contact the maintainers.
