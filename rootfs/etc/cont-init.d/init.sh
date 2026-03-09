#!/usr/bin/with bash
# Init script for MCP Manager addon
set -e

echo "Initializing MCP Manager addon..."

# Create necessary directories
mkdir -p /config/mcp_manager
mkdir -p /data/logs

# Set permissions
chmod -R 755 /config/mcp_manager
chmod -R 755 /data/logs

echo "MCP Manager addon initialized."
