FROM node:20-slim

# Install pnpm and build dependencies for better-sqlite3
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    apt-get update && apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Create data directory
RUN mkdir -p /root/.brain-dump

EXPOSE 4242
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4242

# Run from /app - node_modules with native bindings stays intact
CMD ["node", ".output/server/index.mjs"]
