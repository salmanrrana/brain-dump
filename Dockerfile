FROM node:20-slim

# Install pnpm and build dependencies for better-sqlite3
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate && \
    apt-get update && apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The root prepare hook installs and builds the MCP server, whose imports reach
# into core and src. Copy the source before installing so that build can run.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Create data directory
RUN mkdir -p /root/.brain-dump

EXPOSE 4242
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4242

# Run from /app - node_modules with native bindings stays intact
CMD ["node", ".output/server/index.mjs"]
