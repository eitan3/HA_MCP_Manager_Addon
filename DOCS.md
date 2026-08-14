# MCP Manager for Home Assistant

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Web UI Guide](#web-ui-guide)
- [MCP Server Configuration](#mcp-server-configuration)
- [API Key Management](#api-key-management)
- [Authentication](#authentication)
- [SSE Protocol](#sse-protocol)
- [REST API Reference](#rest-api-reference)
- [Architecture](#architecture)
- [Configuration Reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Overview

**MCP Manager** is a Home Assistant addon that serves as an **MCP Gateway** - it installs, manages, and exposes [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers via Server-Sent Events (SSE) for external AI/LLM agents to consume.

### What is MCP?

The Model Context Protocol (MCP) is an open standard that allows AI assistants like Claude, ChatGPT, and custom LLM agents to interact with external tools and data sources in a standardized way. MCP servers expose tools (functions), resources (data), and prompts that AI assistants can use.

### Why MCP Manager?

Running MCP servers typically requires:
- Installing them locally on your machine
- Configuring each AI client to connect to them
- Managing multiple server processes

**MCP Manager** solves these challenges by:
1. **Centralizing MCP servers** - Run all your MCP servers in Home Assistant
2. **Unified SSE endpoint** - Connect AI agents from anywhere using SSE
3. **Web-based management** - Add, configure, and monitor servers through a modern UI
4. **Authentication** - Secure access with API keys or Home Assistant tokens

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    External AI/LLM Agents                                │
│                                                                          │
│  Claude Desktop ─────► homeassistant.local:14725/sse/server-id-1        │
│  Custom Agent ────────► homeassistant.local:14725/sse/server-id-2       │
│  Another Agent ───────► homeassistant.local:14725/sse/server-id-3       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│               Home Assistant - MCP Manager Addon                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Web UI & Management API - Port 14725                            │    │
│  │ - Dashboard, Server Config, API Keys, Settings                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ MCP Server 1: Filesystem (npm, stdio) ──────► SSE Bridge         │   │
│  │ MCP Server 2: SQLite (uvx, stdio) ──────────► SSE Bridge         │   │
│  │ MCP Server 3: Home Assistant (uvx, stdio) ──► SSE Bridge         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Features

### Core Features

- **📦 Easy MCP Server Installation**
  - Install npm-based MCP servers via `npx`
  - Install Python-based MCP servers via `uvx`
  - Automatic dependency management

- **🔄 Server Lifecycle Management**
  - Start, stop, and restart servers from the UI
  - Auto-start servers on addon boot
  - Process monitoring and health checks

- **🌐 SSE Endpoints for AI Agents**
  - Each MCP server gets a dedicated SSE endpoint
  - Standards-compliant MCP over SSE protocol
  - Real-time bidirectional communication

- **🔐 Flexible Authentication**
  - Home Assistant long-lived access tokens
  - Custom API keys with per-server permissions
  - Query parameter authentication for SSE clients

- **🖥️ Modern Web Interface**
  - Dashboard with server status overview
  - Server configuration wizard
  - API key management
  - Real-time log viewing

- **🔌 Home Assistant Integration**
  - Native HA ingress support
  - Access to HA config and share directories
  - Secure access through HA authentication

### Supported MCP Server Types

| Type | Package Manager | Command | Example Packages |
|------|-----------------|---------|------------------|
| npm | Node.js | `npx` | `@modelcontextprotocol/server-filesystem` |
| uvx | Python | `uvx` | `mcp-server-sqlite`, `mcp-server-home-assistant` |

### Supported Transports

| Transport | Description | Use Case |
|-----------|-------------|----------|
| stdio | Standard input/output | Most MCP servers |
| sse | Server-Sent Events | Servers with built-in SSE |

---

## Installation

### Prerequisites

- Home Assistant 2023.1 or later
- Home Assistant Supervisor (HAOS, supervised installation)
- Network access to port 14725 (configurable)

### Method 1: Add-on Store (Recommended)

1. Navigate to **Settings → Add-ons → Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Add the repository URL: `https://github.com/your-repo/ha-addons`
4. Find **MCP Manager** in the store and click **Install**
5. Wait for the installation to complete
6. Click **Start** to launch the addon

### Method 2: Manual Installation

1. Clone or download this repository to your `/addons` folder:
   ```bash
   cd /addons
   git clone https://github.com/your-repo/ha-mcp-manager mcp_manager
   ```

2. Navigate to **Settings → Add-ons → Add-on Store**
3. Click the **⋮** menu → **Check for updates**
4. Find **MCP Manager** under **Local add-ons**
5. Install and start the addon

### Post-Installation

1. After starting, access the Web UI via:
   - **Sidebar**: Click "MCP Manager" in your Home Assistant sidebar
   - **Direct URL**: `http://homeassistant.local:14725`

2. Configure your first MCP server (see [Quick Start](#quick-start))

---

## Quick Start

### Step 1: Access the Web UI

After installation, access MCP Manager through:
- **Home Assistant Sidebar** → MCP Manager
- **Direct URL**: `http://your-ha-ip:14725`

### Step 2: Add Your First MCP Server

1. Click **Servers** in the sidebar
2. Click **Add Server**
3. Fill in the configuration:

**Example: Filesystem MCP Server**
```
Name: Filesystem
Install Type: npm
Package: @modelcontextprotocol/server-filesystem
Transport: stdio
Arguments:
  /config
  /share
```

4. Click **Create**
5. The server will automatically start if "Auto-start" is enabled

### Step 3: Create an API Key

1. Click **API Keys** in the sidebar
2. Click **Create API Key**
3. Enter a name (e.g., "Claude Desktop")
4. Select which servers this key can access
5. Click **Create**
6. **Important**: Copy the generated key immediately - it won't be shown again!

### Step 4: Connect Your AI Agent

Configure your AI agent (e.g., Claude Desktop) to connect via SSE:

**SSE Endpoint:**
```
http://your-ha-ip:14725/sse/<server-id>
```

**Authentication (choose one):**
- Header: `Authorization: Bearer <api-key>`
- Header: `X-API-Key: <api-key>`
- Query: `?api_key=<api-key>`

### Example: Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "url": "http://homeassistant.local:14725/sse/your-server-id",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer ha_mcp_xxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Web UI Guide

### Dashboard

The dashboard provides an overview of your MCP Manager instance:

- **Server Statistics**: Total, running, and stopped servers
- **Addon Uptime**: How long the addon has been running
- **Server Cards**: Quick status and controls for each server

**Actions:**
- Click **Start/Stop** to toggle server state
- Click server name to view details
- Use the **Refresh** button to update status

### Servers Page

Manage your MCP server configurations:

| Column | Description |
|--------|-------------|
| Name | Server display name |
| Transport | Communication protocol (stdio/sse) |
| SSE URL | Endpoint path for AI agents |
| Package | npm/uvx package name |
| Status | Running/Stopped indicator |
| Actions | Start, Stop, Edit, Delete |

**SSE URL**: Click to copy the full URL to clipboard.

### Add/Edit Server

Configure MCP servers with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| Server Name | Yes | Display name for the server |
| Install Type | Yes | `npm` or `uvx` |
| Package Name | Yes | Package to install (e.g., `@modelcontextprotocol/server-filesystem`) |
| Version | No | Package version (default: `latest`) |
| Dependency Constraints | No | uvx only. Pin transitive dependencies, one pip requirement specifier per line (e.g. `mcp<2`) |
| Transport Type | Yes | `stdio` (recommended) or `sse` |
| Command Arguments | No | Arguments passed to the MCP server (one per line) |
| Environment Variables | No | Environment variables in `KEY=VALUE` format |
| Auto-start | No | Start server when addon starts |

### API Keys Page

Manage authentication keys for external AI agents:

- **Create API Key**: Generate new key with server permissions
- **Copy Key**: Copy masked key prefix (full key shown only on creation)
- **Delete Key**: Remove key (immediate revocation)
- **Server Access**: Shows which servers the key can access

**Key Format**: `ha_mcp_` followed by 32 random characters.

### Settings Page

Configure addon behavior:

| Setting | Description |
|---------|-------------|
| Log Level | Verbosity: debug, info, warning, error |
| Auto-start Servers | Start enabled servers when addon boots |
| uvx Dependency Constraints | Requirement specifiers applied to every uvx server (one per line, e.g. `mcp<2`). See [Pinning Dependencies](#pinning-dependencies) |

**Connection Information**: Reference SSE endpoint format and authentication methods.

---

## MCP Server Configuration

### npm Servers (Node.js)

For MCP servers published to npm:

```yaml
Name: Filesystem Server
Install Type: npm
Package: @modelcontextprotocol/server-filesystem
Version: latest
Transport: stdio
Arguments:
  /config
  /share
Environment Variables:
  NODE_ENV=production
```

The addon runs these using `npx -y <package> <args>`.

**Popular npm MCP Servers:**
- `@modelcontextprotocol/server-filesystem` - File system access
- `@modelcontextprotocol/server-github` - GitHub integration
- `@modelcontextprotocol/server-slack` - Slack integration
- `@modelcontextprotocol/server-google-maps` - Google Maps

### uvx Servers (Python)

For Python MCP servers:

```yaml
Name: SQLite Server
Install Type: uvx
Package: mcp-server-sqlite
Version: latest
Transport: stdio
Arguments:
  /config/home-assistant_v2.db
```

The addon runs these using `uvx <package> <args>`.

#### Pinning Dependencies

`uvx` resolves a package's dependencies to the newest compatible release every
time it builds the tool environment, and that environment lives inside the addon
container — so it is rebuilt from scratch whenever the addon is updated or
reinstalled. A Python MCP server that worked yesterday can therefore fail today
because one of its dependencies published a breaking release, even though you
changed nothing.

There are two places to pin them, and they are combined:

| Setting | Scope |
|---------|-------|
| **Settings → uvx Dependency Constraints** | Every uvx server |
| **Server → Dependency Constraints** | That one server |

When a dependency breaks *several* Python servers at once — which is the usual
case, since most of them share the `mcp` SDK — set it globally rather than
editing each server.

Each line is a pip requirement specifier and is passed to uvx as `--with`:

```yaml
Name: Home Assistant TTS
Install Type: uvx
Package: homeassistant-tts-mcp
Version: latest
Dependency Constraints:
  mcp<2
Transport: stdio
```

This runs `uvx --with "mcp<2" homeassistant-tts-mcp`.

> **`mcp` 2.0 (released 2026-07-28) is a breaking change.** `mcp.server.fastmcp`
> was renamed to `mcp.server.mcpserver`, and `FastMCP` to `MCPServer`; the
> low-level `Server` class was reworked at the same time. Python MCP servers that
> have not migrated fail at startup with
> `ModuleNotFoundError: No module named 'mcp.server.fastmcp'` or
> `AttributeError: 'Server' object has no attribute 'list_tools'`. Set
> `mcp<2` in **Settings → uvx Dependency Constraints** to pin all of them at once.
>
> Servers built on the standalone `fastmcp` package (3.x) are unaffected — it
> already requires `mcp<2.0` itself, so the constraint is a no-op for them.

The addon recognises both failure signatures and logs a `HINT:` line naming the
fix, so you don't have to match the traceback to this section yourself.

**Popular Python MCP Servers:**
- `mcp-server-sqlite` - SQLite database access
- `mcp-server-fetch` - HTTP requests
- `mcp-server-home-assistant` - Home Assistant control

### Environment Variables

Pass sensitive data or configuration via environment variables:

```
HOMEASSISTANT_URL=http://homeassistant.local:8123
HOMEASSISTANT_TOKEN=your-long-lived-token
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
DEBUG=true
```

**Security Note**: Environment variables are stored in the addon's config file. For highly sensitive values, consider using Home Assistant secrets or vault solutions.

### Arguments

Pass command-line arguments to MCP servers (one per line):

```
/config
/share
--read-only
--verbose
```

### File System Access

The addon has access to:

| Path | Description |
|------|-------------|
| `/config` | Home Assistant configuration directory |
| `/share` | Shared data directory |
| `/addon_config` | Addon-specific configuration |

Use these paths when configuring MCP servers that need file access.

---

## API Key Management

### Creating API Keys

1. Navigate to **API Keys** page
2. Click **Create API Key**
3. Enter a descriptive name
4. Select server permissions
5. Copy the generated key immediately

**Important**: The full API key is only shown once during creation. Store it securely.

### Key Permissions

Each API key can be restricted to specific MCP servers:
- Select **all servers** for full access
- Select **specific servers** for limited access
- Keys without any server access will be rejected

### Using API Keys

API keys can be provided in multiple ways:

**1. Authorization Header (Recommended):**
```http
Authorization: Bearer ha_mcp_xxxxxxxxxxxxx
```

**2. X-API-Key Header:**
```http
X-API-Key: ha_mcp_xxxxxxxxxxxxx
```

**3. Query Parameter (for SSE):**
```
/sse/server-id?api_key=ha_mcp_xxxxxxxxxxxxx
```

### Key Lifecycle

- **Creation**: Generates unique `ha_mcp_` prefixed key
- **Usage Tracking**: `lastUsed` timestamp updates on each use
- **Deletion**: Immediate revocation, no grace period
- **No Regeneration**: Delete and create new key if compromised

---

## Authentication

MCP Manager supports three authentication methods:

### 1. Home Assistant Ingress (Automatic)

When accessing through the HA sidebar, authentication is automatic:
- User authenticated via Home Assistant
- Full access to all servers
- No additional configuration needed

### 2. Home Assistant Long-Lived Access Token

For external access using HA credentials:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Creating a token:**
1. Go to your Home Assistant profile
2. Scroll to "Long-Lived Access Tokens"
3. Create a new token
4. Use it in the Authorization header

**Permissions**: Full access to all servers.

### 3. MCP Manager API Key

For AI agents and external applications:

```http
Authorization: Bearer ha_mcp_xxxxxxxxxxxxx
```

or

```http
X-API-Key: ha_mcp_xxxxxxxxxxxxx
```

**Permissions**: Limited to assigned servers.

### Authentication Priority

1. **Ingress**: If `X-Ingress-Path` header present, auto-authenticated
2. **API Key**: Checked first if `ha_mcp_` prefix detected
3. **HA Token**: Validated against Home Assistant API
4. **Reject**: 401 Unauthorized if none valid

---

## SSE Protocol

### MCP over SSE

The addon implements the [MCP SSE transport specification](https://spec.modelcontextprotocol.io/specification/basic/transports/#http-with-sse):

1. **Connect**: Client opens SSE connection to `/sse/<server-id>`
2. **Endpoint Event**: Server sends `endpoint` event with POST URL
3. **Send Messages**: Client POSTs JSON-RPC messages to the endpoint
4. **Receive Messages**: Server sends `message` events with responses

### Connection Flow

```mermaid
sequenceDiagram
    participant Client as AI Agent
    participant SSE as MCP Manager
    participant MCP as MCP Server
    
    Client->>SSE: GET /sse/{serverId}
    SSE-->>Client: event: endpoint\ndata: /sse/{serverId}/message
    
    Client->>SSE: POST /sse/{serverId}/message\n{"jsonrpc":"2.0","method":"initialize",...}
    SSE->>MCP: Forward to stdin
    MCP-->>SSE: Response from stdout
    SSE-->>Client: event: message\ndata: {"jsonrpc":"2.0","result":...}
```

### Connecting via SSE

**URL Format:**
```
http://your-ha-ip:14725/sse/<server-id>
```

**With Authentication (query param):**
```
http://your-ha-ip:14725/sse/<server-id>?api_key=ha_mcp_xxx
```

### SSE Events

| Event | Description | Data Format |
|-------|-------------|-------------|
| `endpoint` | POST URL for messages | String URL |
| `message` | JSON-RPC response/notification | JSON object |
| `: keep-alive` | Heartbeat (every 30s) | Empty |

### Sending Messages

POST JSON-RPC messages to the endpoint URL:

```http
POST /sse/<server-id>/message HTTP/1.1
Content-Type: application/json
Authorization: Bearer ha_mcp_xxx

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

**Response modes:**
- **202 Accepted**: Response will arrive via SSE `message` event
- **200 OK**: Direct HTTP response (when no SSE connection active)

### Example: JavaScript Client

```javascript
// Connect to SSE endpoint
const eventSource = new EventSource(
  'http://homeassistant.local:14725/sse/server-id?api_key=ha_mcp_xxx'
);

let messageEndpoint = null;

// Receive endpoint URL
eventSource.addEventListener('endpoint', (event) => {
  messageEndpoint = event.data;
  console.log('Message endpoint:', messageEndpoint);
});

// Receive messages
eventSource.addEventListener('message', (event) => {
  const response = JSON.parse(event.data);
  console.log('Received:', response);
});

// Send a message
async function sendMessage(method, params = {}, id = 1) {
  const response = await fetch(messageEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ha_mcp_xxx'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id
    })
  });
  return response.json();
}

// Example: List tools
await sendMessage('tools/list');
```

### Example: curl

```bash
# Connect and listen for events
curl -N -H "Authorization: Bearer ha_mcp_xxx" \
  http://homeassistant.local:14725/sse/server-id

# Send a message (in another terminal)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ha_mcp_xxx" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  http://homeassistant.local:14725/sse/server-id/message
```

---

## REST API Reference

Base URL: `http://your-ha-ip:14725`

All API endpoints require authentication.

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

### API Information

```http
GET /api
```

**Response:**
```json
{
  "name": "MCP Manager API",
  "version": "1.0.0",
  "endpoints": {
    "servers": "/api/servers",
    "keys": "/api/keys",
    "settings": "/api/settings",
    "sse": "/sse/:serverId"
  }
}
```

### Server Management

#### List All Servers

```http
GET /api/servers
```

**Response:**
```json
[
  {
    "id": "abc-123",
    "name": "Filesystem",
    "enabled": true,
    "install": {
      "type": "npm",
      "package": "@modelcontextprotocol/server-filesystem"
    },
    "transport": "stdio",
    "args": ["/config"],
    "env": {},
    "status": {
      "running": true,
      "startedAt": "2024-01-15T10:00:00.000Z"
    }
  }
]
```

#### Get Server Details

```http
GET /api/servers/:id
```

#### Create Server

```http
POST /api/servers
Content-Type: application/json

{
  "name": "Filesystem",
  "install": {
    "type": "npm",
    "package": "@modelcontextprotocol/server-filesystem"
  },
  "transport": "stdio",
  "args": ["/config", "/share"],
  "env": {},
  "enabled": true
}
```

#### Update Server

```http
PUT /api/servers/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "enabled": false
}
```

#### Delete Server

```http
DELETE /api/servers/:id
```

#### Start Server

```http
POST /api/servers/:id/start
```

**Response:**
```json
{
  "success": true,
  "message": "Server started",
  "status": {
    "running": true,
    "startedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

#### Stop Server

```http
POST /api/servers/:id/stop
```

#### Restart Server

```http
POST /api/servers/:id/restart
```

#### Get Server Logs

```http
GET /api/servers/:id/logs
```

**Response:**
```json
{
  "logs": [
    "[2024-01-15T10:00:00.000Z] Starting: npx -y @modelcontextprotocol/server-filesystem /config",
    "[2024-01-15T10:00:01.000Z] Process spawned successfully",
    "[2024-01-15T10:00:02.000Z] RECV: {\"jsonrpc\":\"2.0\",\"result\":...}"
  ]
}
```

### API Key Management

#### List API Keys

```http
GET /api/keys
```

**Response:**
```json
[
  {
    "id": "key-123",
    "name": "Claude Desktop",
    "key": "ha_mcp_abcd...",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "lastUsed": "2024-01-15T15:30:00.000Z",
    "serverIds": ["server-1", "server-2"]
  }
]
```

**Note**: Keys are masked in list responses. Full key shown only on creation.

#### Create API Key

```http
POST /api/keys
Content-Type: application/json

{
  "name": "My Agent",
  "serverIds": ["server-1", "server-2"]
}
```

**Response:**
```json
{
  "id": "key-456",
  "name": "My Agent",
  "key": "ha_mcp_abcdef123456789...",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "serverIds": ["server-1", "server-2"]
}
```

#### Update API Key

```http
PUT /api/keys/:id
Content-Type: application/json

{
  "name": "Renamed Key",
  "serverIds": ["server-1"]
}
```

#### Delete API Key

```http
DELETE /api/keys/:id
```

#### Regenerate API Key

```http
POST /api/keys/:id/regenerate
```

Creates a new key with the same name and permissions.

### Settings

#### Get Settings

```http
GET /api/settings
```

**Response:**
```json
{
  "log_level": "info",
  "auto_start_servers": true
}
```

#### Update Settings

```http
PUT /api/settings
Content-Type: application/json

{
  "log_level": "debug",
  "auto_start_servers": false
}
```

#### Get Addon Status

```http
GET /api/settings/status
```

**Response:**
```json
{
  "uptime": 3600,
  "version": "1.0.0",
  "serversTotal": 3,
  "serversRunning": 2,
  "memoryUsage": {
    "heapUsed": 50000000,
    "heapTotal": 100000000
  }
}
```

#### Get Addon Info

```http
GET /api/settings/info
```

**Response:**
```json
{
  "name": "MCP Manager",
  "version": "1.0.0",
  "description": "Manage MCP servers for AI assistant integration",
  "features": [
    "Install MCP servers via npm (npx)",
    "Install MCP servers via Python (uvx)",
    "Per-server SSE endpoints",
    "Web UI for configuration",
    "API key authentication",
    "Home Assistant token authentication"
  ],
  "supportedTransports": ["stdio", "sse"],
  "supportedInstallTypes": ["npm", "uvx"]
}
```

### SSE Endpoints

#### Connect to SSE

```http
GET /sse/:serverId
Accept: text/event-stream
Authorization: Bearer <token>
```

Or with query parameter:
```http
GET /sse/:serverId?api_key=ha_mcp_xxx
```

#### Send Message

```http
POST /sse/:serverId/message
Content-Type: application/json
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Manager Addon                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Express App   │────│   Static Files  │                    │
│  │   (Port 14725)  │    │   (Web UI)      │                    │
│  └────────┬────────┘    └─────────────────┘                    │
│           │                                                     │
│  ┌────────┴────────────────────────────────┐                   │
│  │              API Routes                  │                   │
│  ├─────────────┬───────────┬───────────────┤                   │
│  │ /api/servers│ /api/keys │ /api/settings │                   │
│  │ /sse/:id    │           │               │                   │
│  └──────┬──────┴─────┬─────┴───────────────┘                   │
│         │            │                                          │
│  ┌──────┴──────┐ ┌───┴───┐                                     │
│  │ MCP Manager │ │Config │                                     │
│  │             │ │Store  │                                     │
│  └──────┬──────┘ └───┬───┘                                     │
│         │            │                                          │
│         │            └──────► /config/mcp_manager/config.yaml  │
│         │                                                       │
│  ┌──────┴──────────────────────────────────┐                   │
│  │           Child Processes               │                   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │                   │
│  │  │MCP Srv 1 │ │MCP Srv 2 │ │MCP Srv 3 │ │                   │
│  │  │(npx)     │ │(uvx)     │ │(npm)     │ │                   │
│  │  └──────────┘ └──────────┘ └──────────┘ │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Express Application (`src/index.ts`)

The main entry point that:
- Configures middleware (CORS, Helmet, JSON parsing)
- Sets up API routes
- Serves the static Web UI
- Manages the application lifecycle

#### 2. MCP Manager (`src/mcp/manager.ts`)

Handles MCP server lifecycle:
- Spawns child processes for stdio servers
- Manages stdin/stdout communication
- Bridges stdio to SSE connections
- Tracks server status and logs

#### 3. Config Store (`src/services/config-store.ts`)

Persists configuration to YAML:
- Servers configuration
- API keys
- Settings
- Automatic migration support

#### 4. API Routes (`src/api/`)

| File | Purpose |
|------|---------|
| `servers.ts` | Server CRUD and control |
| `keys.ts` | API key management |
| `settings.ts` | Addon settings |
| `auth.ts` | Authentication middleware |
| `sse.ts` | SSE endpoint handling |

#### 5. Web UI (`webui/`)

React application with:
- Material UI components
- React Query for data fetching
- React Router for navigation

### Data Flow

#### Server Start Flow

```
User clicks Start
       │
       ▼
POST /api/servers/:id/start
       │
       ▼
MCPManager.startServer()
       │
       ├── Get server config
       │
       ├── Build command (npx/uvx)
       │
       ├── Spawn child process
       │
       ├── Attach stdout/stderr handlers
       │
       └── Update status
```

#### SSE Message Flow

```
AI Agent connects: GET /sse/:serverId
       │
       ▼
SSE connection established
       │
       ▼
Send "endpoint" event with POST URL
       │
       ▼
AI Agent sends: POST /sse/:serverId/message
       │
       ▼
Forward to MCP server stdin
       │
       ▼
MCP server responds via stdout
       │
       ▼
Parse JSON-RPC response
       │
       ▼
Send "message" event to SSE clients
```

### File Structure

```
HA_MCP_Manager_Addon/
├── config.yaml           # Home Assistant addon config
├── build.yaml            # Build configuration
├── Dockerfile            # Multi-stage Docker build
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript config
│
├── src/                  # Backend source code
│   ├── index.ts          # Entry point
│   ├── api/              # API routes
│   │   ├── auth.ts       # Authentication
│   │   ├── keys.ts       # API key endpoints
│   │   ├── servers.ts    # Server endpoints
│   │   ├── settings.ts   # Settings endpoints
│   │   └── sse.ts        # SSE endpoints
│   ├── mcp/
│   │   └── manager.ts    # MCP server management
│   ├── services/
│   │   ├── config-store.ts  # Config persistence
│   │   └── logger.ts     # Logging
│   └── types/
│       └── index.ts      # TypeScript types
│
├── webui/                # Frontend source code
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx       # Main app component
│       ├── main.tsx      # Entry point
│       ├── api/
│       │   └── client.ts # API client
│       └── components/
│           ├── Dashboard.tsx
│           ├── ServerList.tsx
│           ├── ServerForm.tsx
│           ├── ApiKeyManager.tsx
│           └── Settings.tsx
│
└── rootfs/               # Container filesystem
    └── etc/
        └── cont-init.d/
            └── init.sh   # Initialization script
```

---

## Configuration Reference

### Addon Options (config.yaml)

```yaml
options:
  base_port: 14725
  log_level: "info"
  auto_start_servers: true
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `base_port` | port | 14725 | Web UI and API port |
| `log_level` | list | info | Log verbosity |
| `auto_start_servers` | bool | true | Start enabled servers on boot |

### Internal Configuration File

Location: `/config/mcp_manager/config.yaml`

```yaml
settings:
  log_level: info
  auto_start_servers: true
  # Applied to every uvx server, on top of each server's install.constraints
  uvx_constraints:
    - "mcp<2"

servers:
  - id: "abc-123-def"
    name: "Filesystem Server"
    enabled: true
    install:
      type: npm
      package: "@modelcontextprotocol/server-filesystem"
      version: "latest"
      # uvx only - extra requirement specifiers passed as `uvx --with <spec>`
      constraints: []
    transport: stdio
    args:
      - "/config"
      - "/share"
    env:
      NODE_ENV: production
    createdAt: "2024-01-15T10:00:00.000Z"
    updatedAt: "2024-01-15T10:00:00.000Z"

api_keys:
  - id: "key-123"
    name: "Claude Desktop"
    key: "ha_mcp_xxxxxxxxxxxxx"
    serverIds:
      - "abc-123-def"
    createdAt: "2024-01-15T10:00:00.000Z"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 14725 | Server port |
| `CONFIG_PATH` | /config/mcp_manager | Config directory |
| `LOG_PATH` | /data/logs | Log directory |
| `NODE_ENV` | production | Node environment |
| `SUPERVISOR_TOKEN` | (auto) | HA Supervisor token |

---

## Troubleshooting

### Common Issues

#### Server Won't Start

**Symptoms:**
- Server status shows "Stopped" with error
- Logs show process exit code

**Solutions:**
1. Check the server logs for error messages
2. Verify the package name is correct
3. Ensure required environment variables are set
4. Try running the package manually in the container

**Debug steps:**
```bash
# Access addon container
docker exec -it addon_mcp_manager /bin/bash

# Test npm package
npx -y @modelcontextprotocol/server-filesystem /config

# Test uvx package
uvx mcp-server-sqlite /config/home-assistant_v2.db
```

#### Python Server Fails with `No module named 'mcp.server.fastmcp'`

**Symptoms:**
- Several `uvx` servers that previously worked all exit with code 1 at once
- Logs show a traceback ending in
  `ModuleNotFoundError: No module named 'mcp.server.fastmcp'`, or
  `AttributeError: 'Server' object has no attribute 'list_tools'`
- Often appears right after the addon or Home Assistant is updated

**Cause:**
Updating rebuilds the addon container, which wipes the uv cache. uvx re-resolves
each server's dependencies and picks up `mcp` 2.0+, where `mcp.server.fastmcp`
was renamed to `mcp.server.mcpserver` and the low-level `Server` class was
reworked. Servers that still use the old API break. Nothing about your
configuration changed, which is why it usually hits several servers at once.

**Solution:**
Set `mcp<2` in **Settings → uvx Dependency Constraints** and restart the affected
servers. That covers every Python server in one place; use a server's own
**Dependency Constraints** field only if you need to pin one differently. See
[Pinning Dependencies](#pinning-dependencies). Remove the constraint once
upstream ships releases that support `mcp` 2.x.

**Verifying:**
The addon logs the fully resolved command for every server it starts, so you can
confirm the constraint is actually being applied:

```bash
# Expected in the addon log after setting the constraint
[<server-id>] Starting: uvx --with mcp<2 homeassistant-tts-mcp
```

If that line shows a bare `uvx <package>` with no `--with`, the constraint did
not reach the server - check that you saved the setting and restarted the server
rather than only reloading the page.

#### SSE Connection Fails

**Symptoms:**
- AI agent can't connect
- Connection drops immediately

**Solutions:**
1. Verify the server is running
2. Check authentication (API key or HA token)
3. Ensure port 14725 is accessible
4. Check for firewall blocking

**Test connection:**
```bash
curl -N -H "Authorization: Bearer YOUR_API_KEY" \
  http://homeassistant.local:14725/sse/server-id
```

#### Authentication Errors

**401 Unauthorized:**
- Verify API key is valid
- Check key has access to the server
- Ensure correct header format

**403 Forbidden:**
- API key doesn't have permission for this server
- Add the server to the key's allowed servers

#### Package Installation Fails

**Symptoms:**
- Server fails to start
- Error about missing package

**Solutions:**
1. Check network connectivity from HA
2. Verify package name spelling
3. Check for npm/PyPI availability
4. Try specific version instead of "latest"

### Viewing Logs

**Addon Logs:**
1. Go to Settings → Add-ons → MCP Manager
2. Click the "Log" tab
3. Enable "Show full log"

**Server-Specific Logs:**
1. Go to MCP Manager Web UI
2. Click on a server
3. View logs section

**API Logs:**
```bash
# View addon logs
ha addons logs mcp_manager

# Or via Docker
docker logs addon_mcp_manager
```

### Debug Mode

Enable debug logging:

1. Go to Settings page
2. Set Log Level to "debug"
3. Click Save

Or set in Home Assistant addon config:
```yaml
log_level: debug
```

### Resetting Configuration

To reset to defaults:

1. Stop the addon
2. Delete `/config/mcp_manager/config.yaml`
3. Start the addon (creates fresh config)

Or via SSH:
```bash
rm /config/mcp_manager/config.yaml
ha addons restart mcp_manager
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- Docker (for building addon)

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/eitan3/HA_MCP_Manager_Addon
cd HA_MCP_Manager_Addon

# Install backend dependencies
npm ci

# Install frontend dependencies
cd webui && npm ci && cd ..

# Build backend
npm run build

# Build frontend
cd webui && npm run build && cd ..
```

> **Use `npm ci`, not `npm install`.** Both `package-lock.json` and
> `webui/package-lock.json` are committed, and the Docker build installs from
> them. `npm ci` reproduces exactly that tree; `npm install` may quietly upgrade
> packages and write a new lock file. When you *do* intend to upgrade a
> dependency, run `npm install <pkg>@<version>` and commit the updated lock file
> as part of the change.

### Running Locally

```bash
# Development mode (backend)
npm run dev

# Development mode (frontend)
cd webui && npm run dev

# Production mode
npm start
```

### Building the Addon

```bash
# Build Docker image
docker build -t local/mcp_manager .

# Test locally
docker run -p 14725:14725 -v /path/to/config:/config local/mcp_manager
```

### Project Structure

| Directory | Purpose |
|-----------|---------|
| `src/` | Backend TypeScript source |
| `webui/` | React frontend source |
| `dist/` | Compiled backend (generated) |
| `webui/dist/` | Built frontend (generated) |
| `rootfs/` | Container filesystem overlay |

### Code Style

- TypeScript with strict mode
- ESLint for linting
- Prettier for formatting

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/ha-mcp-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/ha-mcp-manager/discussions)
- **Documentation**: This file (DOCS.md)

---

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [Home Assistant](https://www.home-assistant.io/) - The home automation platform
- [Anthropic](https://www.anthropic.com/) - Creators of MCP
