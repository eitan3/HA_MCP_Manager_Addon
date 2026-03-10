import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { ConfigStore } from './services/config-store';
import { logger } from './services/logger';
import { VersionService } from './services/version-service';
import { createServerRouter } from './api/servers';
import { createKeysRouter } from './api/keys';
import { createSettingsRouter } from './api/settings';
import { createVersionRouter } from './api/versions';
import { createSSERouter } from './api/sse';
import { createAuthMiddleware, createServerAuthMiddleware } from './api/auth';
import { MCPManager } from './mcp/manager';

const PORT = process.env.PORT || 14725;
const WEBUI_PATH = process.env.WEBUI_PATH || path.join(__dirname, '..', 'webui');
const VERSION_CHECK_INTERVAL = parseInt(process.env.VERSION_CHECK_INTERVAL || '3600000', 10); // 1 hour default

class App {
  private app: express.Application;
  private configStore: ConfigStore;
  private mcpManager: MCPManager;
  private versionService: VersionService;

  constructor() {
    this.app = express();
    this.configStore = new ConfigStore();
    this.mcpManager = new MCPManager(this.configStore);
    this.versionService = new VersionService(this.configStore);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();
  }

  private setupMiddleware(): void {
    // Configure helmet to allow the UI to work in an iframe (HA ingress)
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false, // Allow iframes
    }));
    
    this.app.use(cors({
      origin: '*',
      credentials: true,
    }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API info endpoint (no auth required)
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'MCP Manager API',
        version: '1.0.0',
        endpoints: {
          servers: '/api/servers',
          versions: '/api/versions',
          keys: '/api/keys',
          settings: '/api/settings',
          sse: '/sse/:serverId',
        },
      });
    });

    // API routes with authentication
    const authMiddleware = createAuthMiddleware(this.configStore);
    const serverAuthMiddleware = createServerAuthMiddleware(this.configStore);

    // Server management - requires both auth and server-level authorization
    this.app.use('/api/servers', authMiddleware, serverAuthMiddleware, createServerRouter(this.configStore, this.mcpManager));
    
    // Version management
    this.app.use('/api/versions', authMiddleware, createVersionRouter(this.configStore, this.mcpManager, this.versionService));
    
    // API key management
    this.app.use('/api/keys', authMiddleware, createKeysRouter(this.configStore));
    
    // Settings
    this.app.use('/api/settings', authMiddleware, createSettingsRouter(this.configStore));
    
    // SSE endpoints - requires both auth and server-level authorization
    this.app.use('/sse', authMiddleware, serverAuthMiddleware, createSSERouter(this.mcpManager));

    // Serve static files from webui directory (no auth required - UI is public)
    this.app.use(express.static(WEBUI_PATH));

    // SPA fallback - serve index.html for any non-API route
    this.app.get('*', (req: Request, res: Response) => {
      const indexPath = path.join(WEBUI_PATH, 'index.html');
      res.sendFile(indexPath, (err: Error | null) => {
        if (err) {
          logger.error('Error serving index.html:', err);
          res.status(500).send('Error loading application');
        }
      });
    });
  }

  private setupErrorHandler(): void {
    // Error handling middleware (must be last)
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  async start(): Promise<void> {
    try {
      // Load configuration
      await this.configStore.load();
      logger.info('Configuration loaded');

      // Start all enabled MCP servers
      const config = this.configStore.getConfig();
      if (config.settings.auto_start_servers) {
        logger.info('Auto-starting enabled MCP servers...');
        await this.mcpManager.startAllEnabled();
      }

      // Start automatic version checking
      this.versionService.startAutoCheck(VERSION_CHECK_INTERVAL);
      logger.info(`Version auto-check enabled (interval: ${VERSION_CHECK_INTERVAL / 60000} minutes)`);

      // Start HTTP server
      this.app.listen(PORT, () => {
        logger.info(`MCP Manager started on port ${PORT}`);
        logger.info(`Web UI: http://localhost:${PORT}`);
        logger.info(`Static files served from: ${WEBUI_PATH}`);
        logger.info(`API: http://localhost:${PORT}/api`);
        logger.info(`API Versions: http://localhost:${PORT}/api/versions`);
        logger.info(`SSE: http://localhost:${PORT}/sse/:serverId`);
      });

      // Handle graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down...');
    
    // Stop version auto-check
    this.versionService.stopAutoCheck();
    
    // Stop all running servers
    await this.mcpManager.stopAll();
    
    logger.info('Shutdown complete');
    process.exit(0);
  }
}

// Create and start the application
const app = new App();
app.start().catch((error) => {
  logger.error('Application failed to start:', error);
  process.exit(1);
});
