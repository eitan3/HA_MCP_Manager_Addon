import { Request, Response, NextFunction } from 'express';
import { ConfigStore } from '../services/config-store';
import { logger } from '../services/logger';

// Home Assistant Supervisor API base URL
const HA_SUPERVISOR_API = process.env.SUPERVISOR_API || 'http://supervisor/core';
const HA_TOKEN_HEADER = 'x-supervisor-token';

export interface AuthUser {
  username: string;
  name?: string;
  is_admin?: boolean;
  serverIds?: string[]; // For API key users, list of allowed server IDs
}

interface HAAuthResponse {
  username?: string;
  name?: string;
  is_admin?: boolean;
}

/**
 * Check if the request is coming from HA Ingress
 * When accessed through ingress, the X-Ingress-Path header is set
 */
function isIngressRequest(req: Request): boolean {
  return !!req.headers['x-ingress-path'];
}

/**
 * Extract API key from multiple sources:
 * 1. X-API-Key header
 * 2. Query parameter: ?api_key=xxx or ?apiKey=xxx
 * 3. Bearer token starting with ha_mcp_
 */
function extractApiKey(req: Request): string | null {
  // 1. Check X-API-Key header (most common for API clients)
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string') {
    return headerKey;
  }
  
  // 2. Check query parameter (useful for SSE connections from browsers/curl)
  const queryKey = req.query.api_key || req.query.apiKey || req.query.token;
  if (queryKey && typeof queryKey === 'string') {
    // Support both raw key and full Bearer format in query
    if (queryKey.startsWith('ha_mcp_')) {
      return queryKey;
    }
  }
  
  // 3. Check Authorization header for API key
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ha_mcp_')) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * Extract HA token from Authorization header
 */
function extractHAToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && !authHeader.startsWith('Bearer ha_mcp_')) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Authentication middleware that supports:
 * 1. Home Assistant Ingress (auto-authenticated via HA)
 * 2. MCP Manager API keys (X-API-Key header, query param, or Bearer token)
 * 3. Home Assistant long-lived access tokens (validated via Supervisor API)
 */
export function createAuthMiddleware(configStore: ConfigStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if this is an ingress request - HA handles auth for ingress
    if (isIngressRequest(req)) {
      (req as any).user = {
        username: 'ingress_user',
        name: 'Home Assistant User',
        is_admin: true,
      };
      (req as any).authType = 'ingress';
      return next();
    }

    // Try API key first (supports multiple input methods)
    const apiKey = extractApiKey(req);
    if (apiKey) {
      try {
        const user = await validateAPIKey(configStore, apiKey);
        if (user) {
          (req as any).user = user;
          (req as any).authType = 'api_key';
          return next();
        }
      } catch (error) {
        logger.error('API key validation error:', error);
      }
      // If API key was provided but invalid, return error
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Try HA token
    const haToken = extractHAToken(req);
    if (haToken) {
      try {
        const user = await validateHAToken(haToken);
        if (user) {
          (req as any).user = user;
          (req as any).authType = 'ha_token';
          return next();
        }
      } catch (error) {
        logger.error('HA token validation error:', error);
      }
      return res.status(401).json({ error: 'Invalid Home Assistant token' });
    }

    // No authentication provided
    return res.status(401).json({ 
      error: 'Authentication required',
      hint: 'Use one of: Authorization: Bearer <ha-token>, Authorization: Bearer <api-key>, X-API-Key: <api-key>, or ?api_key=<api-key>'
    });
  };
}

/**
 * Validate a Home Assistant long-lived access token
 */
async function validateHAToken(token: string): Promise<AuthUser | null> {
  try {
    const supervisorToken = process.env.SUPERVISOR_TOKEN;
    
    if (!supervisorToken) {
      logger.error('SUPERVISOR_TOKEN not available');
      return null;
    }

    // Call Home Assistant API to validate token
    const response = await fetch(`${HA_SUPERVISOR_API}/api`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        [HA_TOKEN_HEADER]: supervisorToken,
      },
    });

    if (!response.ok) {
      logger.debug(`HA token validation failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as HAAuthResponse;
    
    return {
      username: data.username || data.name || 'unknown',
      name: data.name || data.username || 'Unknown User',
      is_admin: data.is_admin ?? false,
    };
  } catch (error) {
    logger.error('Failed to validate HA token:', error);
    return null;
  }
}

/**
 * Validate an MCP Manager API key
 */
async function validateAPIKey(configStore: ConfigStore, key: string): Promise<AuthUser | null> {
  try {
    const apiKey = configStore.getAPIKeyByKey(key);
    
    if (!apiKey) {
      logger.debug('API key not found');
      return null;
    }

    // Update last used timestamp
    await configStore.updateAPIKeyLastUsed(apiKey.id);

    return {
      username: `api_key:${apiKey.name}`,
      name: apiKey.name,
      is_admin: false,
      serverIds: apiKey.serverIds,
    };
  } catch (error) {
    logger.error('Failed to validate API key:', error);
    return null;
  }
}

/**
 * Optional authorization middleware for specific server access
 * Checks if the authenticated user has access to the specified server
 */
export function createServerAuthMiddleware(configStore: ConfigStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const serverId = req.params.serverId || req.params.id;
    
    if (!serverId) {
      return next();
    }

    const user = (req as any).user as AuthUser;
    const authType = (req as any).authType;

    // HA tokens and ingress have access to all servers
    if (authType === 'ha_token' || authType === 'ingress') {
      return next();
    }

    // API keys need to check server access
    if (authType === 'api_key' && user.serverIds) {
      if (!user.serverIds.includes(serverId)) {
        return res.status(403).json({ 
          error: 'Access denied. This API key does not have permission to access this server.' 
        });
      }
    }

    return next();
  };
}
