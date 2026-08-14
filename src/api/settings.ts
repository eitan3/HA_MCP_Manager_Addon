import { Router, Request, Response } from 'express';
import { ConfigStore } from '../services/config-store';
import { logger } from '../services/logger';
import { ADDON_VERSION } from '../version';

export function createSettingsRouter(configStore: ConfigStore): Router {
  const router = Router();

  // Get settings
  router.get('/', (req: Request, res: Response) => {
    try {
      const config = configStore.getConfig();
      res.json(config.settings);
    } catch (error) {
      logger.error('Failed to get settings:', error);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  // Update settings
  router.put('/', async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      const config = configStore.getConfig();

      if (updates.uvx_constraints !== undefined) {
        if (!Array.isArray(updates.uvx_constraints) ||
            updates.uvx_constraints.some((c: unknown) => typeof c !== 'string')) {
          return res.status(400).json({ error: 'uvx_constraints must be an array of strings' });
        }
        updates.uvx_constraints = updates.uvx_constraints
          .map((c: string) => c.trim())
          .filter(Boolean);
      }

      // Merge updates
      config.settings = {
        ...config.settings,
        ...updates,
      };

      await configStore.save(config);
      res.json(config.settings);
    } catch (error) {
      logger.error('Failed to update settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Get addon status
  router.get('/status', (req: Request, res: Response) => {
    try {
      const config = configStore.getConfig();
      const servers = configStore.getServers();
      
      const status = {
        uptime: process.uptime(),
        version: ADDON_VERSION,
        serversTotal: servers.length,
        serversRunning: servers.filter(s => s.status?.running).length,
        memoryUsage: process.memoryUsage(),
      };

      res.json(status);
    } catch (error) {
      logger.error('Failed to get status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // Get addon info
  router.get('/info', (req: Request, res: Response) => {
    try {
      const info = {
        name: 'MCP Manager',
        version: ADDON_VERSION,
        description: 'Manage MCP servers for AI assistant integration',
        author: 'Your Name',
        homepage: 'https://github.com/your-repo/ha-mcp-manager',
        features: [
          'Install MCP servers via npm (npx)',
          'Install MCP servers via Python (uvx)',
          'Per-server SSE endpoints',
          'Web UI for configuration',
          'API key authentication',
          'Home Assistant token authentication',
        ],
        supportedTransports: ['stdio', 'sse'],
        supportedInstallTypes: ['npm', 'uvx'],
      };

      res.json(info);
    } catch (error) {
      logger.error('Failed to get info:', error);
      res.status(500).json({ error: 'Failed to get info' });
    }
  });

  return router;
}
