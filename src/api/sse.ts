import { Router, Request, Response } from 'express';
import { MCPManager, SSEConnection } from '../mcp/manager';
import { logger } from '../services/logger';
import { JSONRPCRequest, JSONRPCNotification } from '../types';

export function createSSERouter(mcpManager: MCPManager): Router {
  const router = Router();

  /**
   * SSE endpoint for MCP server communication.
   * 
   * MCP over SSE protocol:
   * - Client connects via GET /sse/:serverId
   * - Server sends events: "endpoint" (with POST URL), "message" (JSON-RPC messages)
   * - Client sends requests via POST to the endpoint URL
   */
  router.get('/:serverId', async (req: Request, res: Response) => {
    const { serverId } = req.params;

    try {
      // Check if server exists and is running
      const server = mcpManager.getRunningServer(serverId);
      if (!server) {
        return res.status(404).json({ error: 'Server not found or not running' });
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Create unique connection ID
      const connectionId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Build the message endpoint URL - include API key if provided
      const protocol = req.protocol;
      const host = req.get('host');
      const basePath = req.baseUrl;
      let messageEndpoint = `${protocol}://${host}${basePath}/${serverId}/message`;
      
      // Forward authentication query params to the message endpoint
      const apiKey = req.query.api_key || req.query.apiKey || req.query.token;
      if (apiKey && typeof apiKey === 'string') {
        messageEndpoint += `?api_key=${encodeURIComponent(apiKey)}`;
      }

      // Send the endpoint event (MCP SSE protocol)
      res.write(`event: endpoint\ndata: ${messageEndpoint}\n\n`);

      logger.info(`SSE client ${connectionId} connected to server ${serverId}`);

      // Register this connection to receive messages from the MCP server
      const sseConnection: SSEConnection = {
        id: connectionId,
        send: (event: string, data: any) => {
          try {
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            res.write(`event: ${event}\ndata: ${dataStr}\n\n`);
          } catch (e) {
            logger.error(`Error sending SSE event to ${connectionId}:`, e);
          }
        },
        close: () => {
          res.end();
        }
      };

      mcpManager.addSSEConnection(serverId, sseConnection);

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          res.write(': keep-alive\n\n');
        } catch (e) {
          clearInterval(keepAlive);
        }
      }, 30000);

      // Handle client disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
        mcpManager.removeSSEConnection(serverId, connectionId);
        logger.info(`SSE client ${connectionId} disconnected from server ${serverId}`);
      });

    } catch (error) {
      logger.error('SSE connection error:', error);
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  });

  /**
   * POST endpoint for sending JSON-RPC messages to the MCP server.
   * Supports both HTTP response mode and SSE mode:
   * - If SSE connections exist: response sent via SSE event, returns 202
   * - If no SSE connections: response sent via HTTP body
   */
  router.post('/:serverId/message', async (req: Request, res: Response) => {
    const { serverId } = req.params;
    const message: JSONRPCRequest | JSONRPCNotification = req.body;

    try {
      // Check if server exists and is running
      const server = mcpManager.getRunningServer(serverId);
      if (!server) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Server not found or not running'
          },
          id: (message as JSONRPCRequest).id || null
        });
      }

      logger.info(`Received message for server ${serverId}: ${JSON.stringify(message)}`);

      // For notifications (no id), just send and acknowledge
      if (!('id' in message) || message.id === undefined) {
        await mcpManager.sendMessage(serverId, message);
        return res.status(202).json({ accepted: true });
      }

      // For requests, send to MCP server and wait for response
      const response = await mcpManager.sendMessage(serverId, message);
      
      if (response) {
        // Check if there are SSE connections
        const runningServer = mcpManager.getRunningServer(serverId);
        if (runningServer && runningServer.sseConnections.size > 0) {
          // Send response via SSE to connected clients
          logger.info(`Sending response via SSE for ${serverId}: ${JSON.stringify(response)}`);
          for (const conn of runningServer.sseConnections.values()) {
            conn.send('message', response);
          }
          // Return 202 Accepted - response comes via SSE
          return res.status(202).json({ accepted: true });
        } else {
          // No SSE connections - return response via HTTP
          logger.info(`No SSE connections, returning response via HTTP for ${serverId}: ${JSON.stringify(response)}`);
          return res.json(response);
        }
      }

      // Shouldn't reach here for requests with id
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'No response received'
        },
        id: (message as JSONRPCRequest).id || null
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      logger.error(`Failed to send message to ${serverId}: ${errorMessage}`);
      if (errorStack) {
        logger.debug(`Error stack: ${errorStack}`);
      }
      
      const errorResponse = {
        jsonrpc: '2.0' as const,
        error: {
          code: -32603,
          message: 'Internal error: ' + errorMessage
        },
        id: (message as JSONRPCRequest).id || null
      };
      
      // Check if there are SSE connections
      const runningServer = mcpManager.getRunningServer(serverId);
      if (runningServer && runningServer.sseConnections.size > 0) {
        // Send error via SSE
        for (const conn of runningServer.sseConnections.values()) {
          conn.send('message', errorResponse);
        }
        return res.status(202).json({ accepted: true, error: errorMessage });
      }
      
      // No SSE connections - return error via HTTP
      res.status(500).json(errorResponse);
    }
  });

  return router;
}
