# Brain Dump Development Container
# Based on: https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile
#
# Key differences from Anthropic reference:
# - Uses pnpm (via corepack) instead of npm
# - Includes build tools for better-sqlite3 (python3, make, g++)
# - Does NOT pre-install Claude Code (user authenticates in container)

FROM node:20

ARG TZ
ENV TZ="$TZ"

ARG PNPM_VERSION=9

# Enable corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Install development tools, build dependencies, and firewall utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Build tools for better-sqlite3 native compilation
    python3 \
    make \
    g++ \
    # Development utilities
    less \
    git \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    unzip \
    gnupg2 \
    gh \
    curl \
    # Firewall tools for network isolation
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    aggregate \
    jq \
    # Editors
    nano \
    vim \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure node user has access to global directories
ARG USERNAME=node
RUN mkdir -p /usr/local/share/pnpm-global && \
    chown -R node:node /usr/local/share/pnpm-global

# Persist bash history between container restarts
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R $USERNAME /commandhistory

# Environment indicator for devcontainer detection
ENV DEVCONTAINER=true

# Create workspace and config directories
RUN mkdir -p /workspace /home/node/.claude && \
    chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

# Install git-delta for better diffs
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
    wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
    rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Switch to non-root user for security
USER node

# Configure pnpm global directory
ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Shell configuration
ENV SHELL=/bin/bash
ENV EDITOR=nano
ENV VISUAL=nano

# Install zsh with powerline10k theme for better terminal experience
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
    -p git \
    -p fzf \
    -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
    -a "source /usr/share/doc/fzf/examples/completion.zsh" \
    -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    -x

# Copy and set up firewall script with sudo access
# The script will be run as postStartCommand to enforce network isolation
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
    echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
    chmod 0440 /etc/sudoers.d/node-firewall
USER node
