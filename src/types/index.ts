// MCP Manager Type Definitions

// ============================================================================
// MCP Server Types
// ============================================================================

export type TransportType = 'stdio' | 'sse';
export type InstallType = 'npm' | 'uvx';

export interface MCPServerInstall {
  type: InstallType;
  package: string;
  version?: string;
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
// MCPServerConfig Status (for runtime state)
// ============================================================================

export interface MCPServerStatus {
  running: boolean;
  startedAt?: string;
  error?: string;
  lastActivity?: string;
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
