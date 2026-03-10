import { Router, Request, Response } from 'express';
import { ConfigStore } from '../services/config-store';
import { MCPManager } from '../mcp/manager';
import { VersionService } from '../services/version-service';
import { UpdateServerVersionRequest, BatchUpdateVersionRequest } from '../types';
import { logger } from '../services/logger';
import * as semver from 'semver';

/**
 * Validate a version string.
 * Accepts 'latest' or valid semver versions (with or without leading 'v').
 */
function isValidVersion(version: string): boolean {
  if (version === 'latest') {
    return true;
  }
  // semver.valid handles versions with or without 'v' prefix
  // semver.coerce handles more relaxed version formats like "1.0" -> "1.0.0"
  return semver.valid(version) !== null || semver.valid(semver.coerce(version)) !== null;
}

export function createVersionRouter(
  configStore: ConfigStore,
  mcpManager: MCPManager,
  versionService: VersionService
): Router {
  const router = Router();

  /**
   * GET /api/versions
   * Get version info for all servers
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      logger.info('GET /api/versions - Fetching version info for all servers');
      const versions = await versionService.checkAllServers(false);
      logger.info(`GET /api/versions - Returning ${Object.keys(versions).length} server versions`);
      res.json(versions);
    } catch (error) {
      logger.error('Failed to get versions:', error);
      res.status(500).json({ error: 'Failed to get version information' });
    }
  });

  /**
   * POST /api/versions/check
   * Trigger version check for all servers (force refresh)
   */
  router.post('/check', async (req: Request, res: Response) => {
    try {
      const versions = await versionService.checkAllServers(true);
      res.json({
        success: true,
        message: 'Version check completed',
        versions,
      });
    } catch (error) {
      logger.error('Failed to check versions:', error);
      res.status(500).json({ error: 'Failed to check versions' });
    }
  });

  /**
   * GET /api/versions/:serverId
   * Get version info for a single server
   */
  router.get('/:serverId', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const versionInfo = await versionService.getServerVersionInfo(serverId, false);
      
      if (!versionInfo) {
        return res.status(404).json({ error: 'Server not found' });
      }
      
      res.json(versionInfo);
    } catch (error) {
      logger.error('Failed to get server version:', error);
      res.status(500).json({ error: 'Failed to get server version' });
    }
  });

  /**
   * POST /api/versions/:serverId/check
   * Trigger version check for a single server (force refresh)
   */
  router.post('/:serverId/check', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const versionInfo = await versionService.getServerVersionInfo(serverId, true);
      
      if (!versionInfo) {
        return res.status(404).json({ error: 'Server not found' });
      }
      
      res.json({
        success: true,
        message: 'Version check completed',
        versionInfo,
      });
    } catch (error) {
      logger.error('Failed to check server version:', error);
      res.status(500).json({ error: 'Failed to check server version' });
    }
  });

  /**
   * POST /api/versions/:serverId/update
   * Update a server to a specific version
   */
  router.post('/:serverId/update', async (req: Request, res: Response) => {
    try {
      const { serverId } = req.params;
      const { version } = req.body as UpdateServerVersionRequest;

      if (!version) {
        return res.status(400).json({ error: 'Version is required' });
      }

      if (!isValidVersion(version)) {
        return res.status(400).json({
          error: 'Invalid version format. Use semver (e.g., 1.2.3) or "latest"'
        });
      }

      const server = configStore.getServer(serverId);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      logger.info(`Updating server ${server.name} to version ${version}`);

      // Check if server is running
      const status = mcpManager.getServerStatus(serverId);
      const wasRunning = status?.running || false;

      // Stop server if running
      if (wasRunning) {
        logger.info(`Stopping server ${server.name} before update`);
        await mcpManager.stopServer(serverId);
      }

      // Update the version in config
      await configStore.updateServerVersion(serverId, version);

      // Clear the installed version since we're updating
      await configStore.updateServerInstalledVersion(serverId, '');

      // Clear version cache for this package
      versionService.clearCache();

      // Restart server if it was running
      if (wasRunning) {
        logger.info(`Restarting server ${server.name} after update`);
        await mcpManager.startServer(serverId);
        
        // Try to detect the new installed version
        const updatedVersionInfo = await versionService.getServerVersionInfo(serverId, true);
        
        res.json({
          success: true,
          message: `Server ${server.name} updated to version ${version}`,
          restarted: true,
          versionInfo: updatedVersionInfo,
        });
      } else {
        res.json({
          success: true,
          message: `Server ${server.name} configured to use version ${version}. Start the server to apply the update.`,
          restarted: false,
        });
      }
    } catch (error) {
      logger.error('Failed to update server version:', error);
      res.status(500).json({ 
        error: 'Failed to update server version',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/versions/update-all
   * Update all outdated servers to latest version
   */
  router.post('/update-all', async (req: Request, res: Response) => {
    try {
      const { serverIds, version } = req.body as BatchUpdateVersionRequest;
      const targetVersion = version || 'latest';

      if (targetVersion !== 'latest' && !isValidVersion(targetVersion)) {
        return res.status(400).json({
          error: 'Invalid version format. Use semver (e.g., 1.2.3) or "latest"'
        });
      }

      // If no serverIds provided, get all outdated servers
      let serversToUpdate = serverIds || [];
      
      if (serversToUpdate.length === 0) {
        const versions = await versionService.checkAllServers(false);
        serversToUpdate = Object.entries(versions)
          .filter(([_, info]) => info.isOutdated)
          .map(([id]) => id);
      }

      if (serversToUpdate.length === 0) {
        return res.json({
          success: true,
          message: 'No servers to update',
          results: [],
        });
      }

      const results: Array<{
        serverId: string;
        serverName: string;
        success: boolean;
        message: string;
        error?: string;
      }> = [];

      // Update each server sequentially
      for (const serverId of serversToUpdate) {
        const server = configStore.getServer(serverId);
        if (!server) {
          results.push({
            serverId,
            serverName: 'Unknown',
            success: false,
            message: 'Server not found',
          });
          continue;
        }

        try {
          const status = mcpManager.getServerStatus(serverId);
          const wasRunning = status?.running || false;

          if (wasRunning) {
            await mcpManager.stopServer(serverId);
          }

          await configStore.updateServerVersion(serverId, targetVersion);
          await configStore.updateServerInstalledVersion(serverId, '');

          if (wasRunning) {
            await mcpManager.startServer(serverId);
          }

          results.push({
            serverId,
            serverName: server.name,
            success: true,
            message: `Updated to ${targetVersion}${wasRunning ? ' and restarted' : ''}`,
          });
        } catch (error) {
          results.push({
            serverId,
            serverName: server.name,
            success: false,
            message: 'Update failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Clear version cache
      versionService.clearCache();

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      res.json({
        success: failCount === 0,
        message: `Updated ${successCount} server(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
        results,
      });
    } catch (error) {
      logger.error('Failed to batch update servers:', error);
      res.status(500).json({ 
        error: 'Failed to batch update servers',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
