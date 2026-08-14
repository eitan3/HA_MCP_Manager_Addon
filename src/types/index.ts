// MCP Manager Type Definitions

// ============================================================================
// MCP Server Types
// ============================================================================

export type TransportType = 'stdio' | 'sse';
export type InstallType = 'npm' | 'uvx';

export interface MCPServerInstall {
  type: InstallType;
  package: string;
  version?: string;           // Configured/requested version (user-specified)
  installedVersion?: string;  // Actual installed version (auto-detected)
  constraints?: string[];     // uvx only: extra requirement specifiers to pin
                              // transitive dependencies, e.g. ['mcp<2']
}

export interface MCPServerConfig {
  id: string;
  name: string;
  enabled?: boolean;
  install: MCPServerInstall;
  transport: TransportType;
  args?: string[];
  env?: Record<string, string>;
  internal_port?: number; // For SSE transport servers
  status?: MCPServerStatus;
  logs?: string[];
  pid?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MCPServerStatus {
  running: boolean;
  startedAt?: string;
  error?: string;
  lastActivity?: string;
}

// ============================================================================
// Version Tracking Types
// ============================================================================

export interface VersionInfo {
  installedVersion: string | null;  // Currently installed version
  latestVersion: string | null;     // Latest available in registry
  availableVersions: string[];      // List of available versions for update dialog
  lastChecked: string;              // ISO timestamp of last check
  isOutdated: boolean;              // true if installed < latest
  checkError?: string;              // Error message if check failed
}

export interface ServerVersionInfo extends VersionInfo {
  serverId: string;
  packageName: string;
  installType: InstallType;
}

// ============================================================================
// API Key Types
// ============================================================================

export interface APIKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
  serverIds: string[];
}

// ============================================================================
// Settings Types
// ============================================================================

export interface Settings {
  logLevel: 'debug' | 'info' | 'warning' | 'error';
  autoStartServers: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Config {
  settings: Settings;
  servers: MCPServerConfig[];
  apiKeys: APIKey[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateServerRequest {
  name: string;
  enabled?: boolean;
  install: MCPServerInstall;
  transport: TransportType;
  args?: string[];
  env?: Record<string, string>;
  internal_port?: number;
}

export interface UpdateServerRequest {
  name?: string;
  enabled?: boolean;
  install?: MCPServerInstall;
  transport?: TransportType;
  args?: string[];
  env?: Record<string, string>;
  internal_port?: number;
}

export interface CreateAPIKeyRequest {
  name: string;
  serverIds: string[];
}

// Version update request
export interface UpdateServerVersionRequest {
  version: string;  // 'latest' or specific version like '1.2.3'
}

// Batch version update request
export interface BatchUpdateVersionRequest {
  serverIds: string[];
  version: string;  // 'latest' or specific version
}

// Version check response for all servers
export interface AllVersionsResponse {
  [serverId: string]: VersionInfo;
}

// ============================================================================
// MCP Protocol Types (JSON-RPC)
// ============================================================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: number | string;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: number | string | null;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// SSE Types
// ============================================================================

export interface SSEMessage {
  server_id: string;
  message: JSONRPCRequest | JSONRPCNotification;
}

export interface SSEEvent {
  event: string;
  data: string;
}
