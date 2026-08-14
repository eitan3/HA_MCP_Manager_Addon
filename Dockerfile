# MCP Manager Addon - Complete build Dockerfile
# Stage 1: Build stage using Node.js
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files for backend
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Install backend dependencies from the lock file. `npm ci` installs the exact
# tree recorded in package-lock.json, so rebuilding the addon months from now
# produces the same dependency versions as today rather than resolving fresh.
RUN npm ci

# Copy backend source code
COPY src/ ./src/

# Build backend TypeScript
RUN npm run build

# Build frontend
WORKDIR /app/webui
COPY webui/package.json webui/package-lock.json ./
RUN npm ci
COPY webui/ ./
RUN npm run build

# Stage 2: Final production image
FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python MCP servers
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy built backend from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy built frontend from builder
COPY --from=builder /app/webui/dist ./webui

# Copy rootfs files
COPY rootfs/ /

# Create directories
RUN mkdir -p /config/mcp_manager /data/logs

# Set environment variables
ENV NODE_ENV=production
ENV CONFIG_PATH=/config/mcp_manager
ENV LOG_PATH=/data/logs

# Expose the management port (MCP server ports are dynamic)
EXPOSE 14725

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:14725/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
