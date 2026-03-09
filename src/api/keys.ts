import { Router, Request, Response } from 'express';
import { CreateAPIKeyRequest, APIKey } from '../types';
import { ConfigStore } from '../services/config-store';
import { logger } from '../services/logger';

export function createKeysRouter(configStore: ConfigStore): Router {
  const router = Router();

  // List all API keys
  router.get('/', (req: Request, res: Response) => {
    try {
      const keys = configStore.getAPIKeys();
      // Mask the actual keys for security
      const maskedKeys = keys.map(k => ({
        ...k,
        key: k.key.substring(0, 12) + '...', // Show only prefix
      }));
      res.json(maskedKeys);
    } catch (error) {
      logger.error('Failed to list API keys:', error);
      res.status(500).json({ error: 'Failed to list API keys' });
    }
  });

  // Get API key by ID
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const key = configStore.getAPIKey(req.params.id);
      if (!key) {
        return res.status(404).json({ error: 'API key not found' });
      }
      // Return masked key
      res.json({
        ...key,
        key: key.key.substring(0, 12) + '...',
      });
    } catch (error) {
      logger.error('Failed to get API key:', error);
      res.status(500).json({ error: 'Failed to get API key' });
    }
  });

  // Create new API key
  router.post('/', async (req: Request, res: Response) => {
    try {
      const keyData: CreateAPIKeyRequest = req.body;
      
      // Validate required fields
      if (!keyData.name || !keyData.serverIds) {
        return res.status(400).json({ error: 'Missing required fields: name, serverIds' });
      }

      // Validate server IDs exist
      const config = await configStore.load();
      const invalidServers = keyData.serverIds.filter(
        sid => !config.servers.find(s => s.id === sid)
      );
      if (invalidServers.length > 0) {
        return res.status(400).json({ 
          error: `Invalid server IDs: ${invalidServers.join(', ')}` 
        });
      }

      const apiKey = await configStore.addAPIKey(keyData);
      
      // Return the full key only on creation (user needs to copy it)
      res.status(201).json(apiKey);
    } catch (error) {
      logger.error('Failed to create API key:', error);
      res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  // Update API key
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const existingKey = configStore.getAPIKey(req.params.id);
      if (!existingKey) {
        return res.status(404).json({ error: 'API key not found' });
      }

      const { name, serverIds } = req.body;
      
      // Validate at least one field is provided
      if (name === undefined && serverIds === undefined) {
        return res.status(400).json({ error: 'At least one field (name or serverIds) must be provided' });
      }

      // Validate server IDs if provided
      if (serverIds !== undefined) {
        if (!Array.isArray(serverIds)) {
          return res.status(400).json({ error: 'serverIds must be an array' });
        }
        
        const config = await configStore.load();
        const invalidServers = serverIds.filter(
          (sid: string) => !config.servers.find(s => s.id === sid)
        );
        if (invalidServers.length > 0) {
          return res.status(400).json({ 
            error: `Invalid server IDs: ${invalidServers.join(', ')}` 
          });
        }
      }

      const updatedKey = await configStore.updateAPIKey(req.params.id, { name, serverIds });
      
      if (!updatedKey) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Return masked key
      res.json({
        ...updatedKey,
        key: updatedKey.key.substring(0, 12) + '...',
      });
    } catch (error) {
      logger.error('Failed to update API key:', error);
      res.status(500).json({ error: 'Failed to update API key' });
    }
  });

  // Delete API key
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const key = configStore.getAPIKey(req.params.id);
      if (!key) {
        return res.status(404).json({ error: 'API key not found' });
      }

      await configStore.deleteAPIKey(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete API key:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  // Regenerate API key
  router.post('/:id/regenerate', async (req: Request, res: Response) => {
    try {
      const existingKey = configStore.getAPIKey(req.params.id);
      if (!existingKey) {
        return res.status(404).json({ error: 'API key not found' });
      }

      // Delete old key and create new one with same properties
      await configStore.deleteAPIKey(req.params.id);
      const newKey = await configStore.addAPIKey({
        name: existingKey.name,
        serverIds: existingKey.serverIds,
      });

      // Return the full new key
      res.json(newKey);
    } catch (error) {
      logger.error('Failed to regenerate API key:', error);
      res.status(500).json({ error: 'Failed to regenerate API key' });
    }
  });

  return router;
}
