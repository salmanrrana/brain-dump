# Ralph Sandbox - Isolated environment for autonomous coding
# This container provides a safe environment for Ralph to work in
#
# Alpine-based for smaller image size (~50MB base vs ~180MB Debian)
# Note: Alpine uses musl libc instead of glibc

FROM node:20-alpine

# Install essential tools
# --no-cache avoids storing the package index locally (smaller image)
RUN apk add --no-cache \
    git \
    curl \
    bash \
    jq \
    openssh-client

# Install GitHub CLI from official releases
# Alpine doesn't have apt, so we download the binary directly
RUN ARCH=$(uname -m) && \
    case "$ARCH" in \
        x86_64) GH_ARCH="linux_amd64" ;; \
        aarch64) GH_ARCH="linux_arm64" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    GH_VERSION=$(curl -sL https://api.github.com/repos/cli/cli/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | sed 's/^v//') && \
    curl -sL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_${GH_ARCH}.tar.gz" | tar xz && \
    mv gh_${GH_VERSION}_${GH_ARCH}/bin/gh /usr/local/bin/ && \
    rm -rf gh_${GH_VERSION}_${GH_ARCH}

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for safety
# Alpine uses adduser (BusyBox) instead of useradd
# Also create .ssh directory for known_hosts mount
RUN adduser -D -s /bin/bash ralph \
    && mkdir -p /home/ralph/.config \
    && mkdir -p /home/ralph/.ssh \
    && chmod 700 /home/ralph/.ssh \
    && chown -R ralph:ralph /home/ralph

# Set up working directory
WORKDIR /workspace

# Switch to non-root user
USER ralph

# Default command
CMD ["bash"]
