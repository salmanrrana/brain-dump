# Ralph Sandbox - Isolated environment for autonomous coding
# This container provides a safe environment for Ralph to work in

FROM node:20-bookworm-slim

# Install essential tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for safety
# Also create .ssh directory for known_hosts mount
RUN useradd -m -s /bin/bash ralph \
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
