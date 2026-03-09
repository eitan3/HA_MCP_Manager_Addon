import { Router, Request, Response } from 'express';
import { ConfigStore } from '../services/config-store';
import { logger } from '../services/logger';

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
        version: '1.0.0',
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
        version: '1.0.0',
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
