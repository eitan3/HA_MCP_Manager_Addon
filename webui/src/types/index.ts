// Frontend type definitions

// ============================================================================
// Server Types
// ============================================================================

export interface ServerStatus {
  running: boolean;
  startedAt?: string;
  error?: string;
  lastActivity?: string;
}

export interface ServerInstall {
  type: string;
  package: string;
  version?: string;
  installedVersion?: string;
}

export interface Server {
  id: string;
  name: string;
  enabled: boolean;
  transport: string;
  install?: ServerInstall;
  status?: ServerStatus;
}

// ============================================================================
// Version Types
// ============================================================================

export interface VersionInfo {
  installedVersion: string | null;
  latestVersion: string | null;
  availableVersions: string[];
  isOutdated: boolean;
  lastChecked: string;
  checkError?: string;
}

export interface ServerVersionInfo extends VersionInfo {
  serverId: string;
  packageName: string;
  installType: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

export interface VersionsResponse {
  [serverId: string]: VersionInfo;
}
