import { Router, Request, Response } from 'express';
import { MCPServerConfig, CreateServerRequest, UpdateServerRequest } from '../types';
import { ConfigStore } from '../services/config-store';
import { MCPManager } from '../mcp/manager';
import { logger } from '../services/logger';
import { AuthUser } from './auth';

export function createServerRouter(configStore: ConfigStore, mcpManager: MCPManager): Router {
  const router = Router();

  // List all servers with live status
  router.get('/', async (req: Request, res: Response) => {
    try {
      const config = await configStore.load();
      const user = (req as any).user as AuthUser;
      const authType = (req as any).authType;
      
      let servers = config.servers;
      
      // Filter servers for API key users - only show servers they have access to
      if (authType === 'api_key' && user.serverIds) {
        servers = servers.filter(s => user.serverIds!.includes(s.id));
      }
      
      // Merge live status from MCPManager with config servers
      const serversWithStatus = servers.map(server => ({
        ...server,
        status: mcpManager.getServerStatus(server.id) || { running: false },
      }));
      res.json(serversWithStatus);
    } catch (error) {
      logger.error('Failed to list servers:', error);
      res.status(500).json({ error: 'Failed to list servers' });
    }
  });

  // Get server by ID with live status
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const server = configStore.getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      // Include live status from MCPManager
      const serverWithStatus = {
        ...server,
        status: mcpManager.getServerStatus(req.params.id) || { running: false },
      };
      res.json(serverWithStatus);
    } catch (error) {
      logger.error('Failed to get server:', error);
      res.status(500).json({ error: 'Failed to get server' });
    }
  });

  // Create server
  router.post('/', async (req: Request, res: Response) => {
    try {
      const serverData: CreateServerRequest = req.body;
      
      // Validate required fields
      if (!serverData.name || !serverData.install || !serverData.transport) {
        return res.status(400).json({ error: 'Missing required fields: name, install, transport' });
      }

      const server = await configStore.addServer(serverData);
      
      // Auto-start if enabled
      if (server.enabled) {
        await mcpManager.startServer(server.id);
      }

      res.status(201).json(server);
    } catch (error) {
      logger.error('Failed to create server:', error);
      res.status(500).json({ error: 'Failed to create server' });
    }
  });

  // Update server
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updates: UpdateServerRequest = req.body;
      const server = await configStore.updateServer(req.params.id, updates);
      
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      // Handle enabled/disabled state change
      if (updates.enabled !== undefined) {
        if (updates.enabled && !server.status?.running) {
          await mcpManager.startServer(server.id);
        } else if (!updates.enabled && server.status?.running) {
          await mcpManager.stopServer(server.id);
        }
      }

      res.json(server);
    } catch (error) {
      logger.error('Failed to update server:', error);
      res.status(500).json({ error: 'Failed to update server' });
    }
  });

  // Delete server
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      // Stop server first if running
      const server = configStore.getServer(req.params.id);
      if (server?.status?.running) {
        await mcpManager.stopServer(req.params.id);
      }

      await configStore.deleteServer(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete server:', error);
      res.status(500).json({ error: 'Failed to delete server' });
    }
  });

  // Start server
  router.post('/:id/start', async (req: Request, res: Response) => {
    try {
      const server = configStore.getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      await mcpManager.startServer(req.params.id);
      
      // Return the actual status after starting
      const status = mcpManager.getServerStatus(req.params.id);
      res.json({
        success: true,
        message: 'Server started',
        status: status
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: 'Failed to start server',
        details: errorMessage,
        status: mcpManager.getServerStatus(req.params.id)
      });
    }
  });

  // Stop server
  router.post('/:id/stop', async (req: Request, res: Response) => {
    try {
      const server = configStore.getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      await mcpManager.stopServer(req.params.id);
      res.json({ success: true, message: 'Server stopped' });
    } catch (error) {
      logger.error('Failed to stop server:', error);
      res.status(500).json({ error: 'Failed to stop server' });
    }
  });

  // Restart server
  router.post('/:id/restart', async (req: Request, res: Response) => {
    try {
      const server = configStore.getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      await mcpManager.stopServer(req.params.id);
      await mcpManager.startServer(req.params.id);
      res.json({ success: true, message: 'Server restarted' });
    } catch (error) {
      logger.error('Failed to restart server:', error);
      res.status(500).json({ error: 'Failed to restart server' });
    }
  });

  // Get server status
  router.get('/:id/status', (req: Request, res: Response) => {
    try {
      const status = mcpManager.getServerStatus(req.params.id);
      if (!status) {
        return res.status(404).json({ error: 'Server not found' });
      }
      res.json(status);
    } catch (error) {
      logger.error('Failed to get server status:', error);
      res.status(500).json({ error: 'Failed to get server status' });
    }
  });

  // Get server logs
  router.get('/:id/logs', (req: Request, res: Response) => {
    try {
      const server = configStore.getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }
      const logs = mcpManager.getServerLogs(req.params.id);
      res.json({ logs });
    } catch (error) {
      logger.error('Failed to get server logs:', error);
      res.status(500).json({ error: 'Failed to get server logs' });
    }
  });

  // Install server package
  router.post('/:id/install', async (req: Request, res: Response) => {
    try {
      const server = configStore.getServer(req.params.id);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      await mcpManager.installServer(req.params.id);
      res.json({ success: true, message: 'Package installed' });
    } catch (error) {
      logger.error('Failed to install server package:', error);
      res.status(500).json({ error: 'Failed to install server package' });
    }
  });

  return router;
}
