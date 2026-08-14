import { MCPServerConfig, APIKey, CreateServerRequest } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

const CONFIG_DIR = process.env.CONFIG_PATH || '/config/mcp_manager';
const CONFIG_FILE_NAME = 'config.yaml';

export interface AppConfig {
  settings: {
    log_level: 'debug' | 'info' | 'warning' | 'error';
    auto_start_servers: boolean;
    // Requirement specifiers applied to every uvx server, on top of each
    // server's own install.constraints. One entry here pins a dependency
    // across the whole fleet instead of server by server.
    uvx_constraints: string[];
    // When a uvx server dies at startup on a recognised mcp 2.x
    // incompatibility, restart it once with 'mcp<2' applied. Skipped when
    // something already constrains mcp.
    uvx_auto_pin_mcp: boolean;
  };
  servers: MCPServerConfig[];
  api_keys: APIKey[];
}

const defaultConfig: AppConfig = {
  settings: {
    log_level: 'info',
    auto_start_servers: true,
    uvx_constraints: [],
    uvx_auto_pin_mcp: true,
  },
  servers: [],
  api_keys: [],
};

export class ConfigStore {
  private config: AppConfig;
  private configPath: string;
  private loaded: boolean = false;  // Track if config was loaded from disk

  constructor() {
    this.configPath = CONFIG_DIR;
    this.config = { ...defaultConfig };
    this.ensureConfigDir();
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
      logger.info(`Created config directory: ${this.configPath}`);
    }
  }

  async load(): Promise<AppConfig> {
    // Only skip loading if we've already loaded from disk
    if (this.loaded) {
      return this.config;
    }

    const configFilePath = path.join(this.configPath, CONFIG_FILE_NAME);

    logger.info(`Loading configuration from: ${configFilePath}`);

    try {
      // Check if config FILE exists (not directory)
      await fs.promises.access(configFilePath, fs.constants.F_OK);
    } catch (error: unknown) {
      const nodeError = error as { code?: string };
      if (nodeError.code === 'ENOENT') {
        // Config file doesn't exist, create default
        logger.info('Config file not found, creating default configuration');
        this.config = { ...defaultConfig };
        await this.save(this.config);
        this.loaded = true;
        return this.config;
      }
      throw error;
    }

    try {
      const content = await fs.promises.readFile(configFilePath, 'utf-8');
      this.config = yaml.parse(content) as AppConfig;
      
      // Ensure required fields exist (migration support)
      if (!this.config.settings) {
        this.config.settings = { ...defaultConfig.settings };
      }
      if (!Array.isArray(this.config.settings.uvx_constraints)) {
        this.config.settings.uvx_constraints = [];
      }
      if (typeof this.config.settings.uvx_auto_pin_mcp !== 'boolean') {
        this.config.settings.uvx_auto_pin_mcp = true;
      }
      if (!this.config.servers) {
        this.config.servers = [];
      }
      if (!this.config.api_keys) {
        this.config.api_keys = [];
      }
      
      this.loaded = true;
      logger.info(`Configuration loaded successfully: ${this.config.servers.length} servers, ${this.config.api_keys.length} API keys`);
      return this.config;
    } catch (error) {
      logger.error('Failed to parse configuration file:', error);
      // If file is corrupted, use default but don't overwrite
      this.config = { ...defaultConfig };
      this.loaded = true;
      return this.config;
    }
  }

  async save(config: AppConfig): Promise<void> {
    const configFilePath = path.join(this.configPath, CONFIG_FILE_NAME);

    try {
      // Ensure directory exists
      this.ensureConfigDir();

      // Convert to plain object for YAML
      const yamlContent = yaml.stringify(config);
      await fs.promises.writeFile(configFilePath, yamlContent, 'utf-8');
      logger.info('Configuration saved successfully');
    } catch (error) {
      logger.error('Failed to save configuration:', error);
      throw error;
    }
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getServers(): MCPServerConfig[] {
    return this.config.servers;
  }

  getServer(id: string): MCPServerConfig | undefined {
    return this.config.servers.find(s => s.id === id);
  }

  getAPIKeys(): APIKey[] {
    return this.config.api_keys;
  }

  getAPIKey(id: string): APIKey | undefined {
    return this.config.api_keys.find(k => k.id === id);
  }

  getAPIKeyByKey(key: string): APIKey | undefined {
    return this.config.api_keys.find(k => k.key === key);
  }

  async addServer(serverData: CreateServerRequest): Promise<MCPServerConfig> {
    const newServer: MCPServerConfig = {
      id: uuidv4(),
      name: serverData.name,
      enabled: serverData.enabled ?? true,
      install: serverData.install,
      transport: serverData.transport,
      args: serverData.args,
      env: serverData.env,
      internal_port: serverData.internal_port,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: {
        running: false,
      },
      logs: [],
    };

    this.config.servers.push(newServer);
    await this.save(this.config);
    logger.info(`Added MCP server: ${newServer.name} (ID: ${newServer.id})`);
    return newServer;
  }

  async updateServer(id: string, updates: Partial<MCPServerConfig>): Promise<MCPServerConfig | null> {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) {
      return null;
    }

    const server = this.config.servers[index];
    Object.assign(server, updates, { updatedAt: new Date().toISOString() });
    await this.save(this.config);
    logger.info(`Updated MCP server: ${server.name} (ID: ${server.id})`);
    return server;
  }

  /**
   * Update the installed version of a server package
   */
  async updateServerInstalledVersion(id: string, installedVersion: string): Promise<MCPServerConfig | null> {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) {
      return null;
    }

    const server = this.config.servers[index];
    server.install.installedVersion = installedVersion;
    server.updatedAt = new Date().toISOString();
    await this.save(this.config);
    logger.debug(`Updated installed version for ${server.name}: ${installedVersion}`);
    return server;
  }

  /**
   * Update the requested version of a server package (for updates)
   */
  async updateServerVersion(id: string, version: string): Promise<MCPServerConfig | null> {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) {
      return null;
    }

    const server = this.config.servers[index];
    server.install.version = version;
    server.updatedAt = new Date().toISOString();
    await this.save(this.config);
    logger.info(`Updated requested version for ${server.name}: ${version}`);
    return server;
  }

  async deleteServer(id: string): Promise<void> {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) {
      return;
    }
    this.config.servers.splice(index, 1);
    
    // Clean up API keys - remove the deleted server ID from all API keys
    let apiKeysUpdated = 0;
    for (const apiKey of this.config.api_keys) {
      const originalLength = apiKey.serverIds.length;
      apiKey.serverIds = apiKey.serverIds.filter(sid => sid !== id);
      if (apiKey.serverIds.length !== originalLength) {
        apiKeysUpdated++;
      }
    }
    
    await this.save(this.config);
    logger.info(`Deleted MCP server: ${id}`);
    if (apiKeysUpdated > 0) {
      logger.info(`Updated ${apiKeysUpdated} API key(s) to remove reference to deleted server`);
    }
  }

  async addAPIKey(apiKey: { name: string; serverIds: string[] }): Promise<APIKey> {
    const newKey: APIKey = {
      id: uuidv4(),
      name: apiKey.name,
      key: this.generateAPIKey(),
      serverIds: apiKey.serverIds,
      createdAt: new Date().toISOString(),
    };

    this.config.api_keys.push(newKey);
    await this.save(this.config);
    logger.info(`Added API key: ${newKey.name} (ID: ${newKey.id})`);
    return newKey;
  }

  async deleteAPIKey(id: string): Promise<void> {
    const index = this.config.api_keys.findIndex(k => k.id === id);
    if (index === -1) {
      return;
    }
    this.config.api_keys.splice(index, 1);
    await this.save(this.config);
    logger.info(`Deleted API key: ${id}`);
  }

  async updateAPIKeyLastUsed(id: string): Promise<void> {
    const apiKey = this.getAPIKey(id);
    if (apiKey) {
      apiKey.lastUsed = new Date().toISOString();
      await this.save(this.config);
    }
  }

  async updateAPIKey(id: string, updates: { name?: string; serverIds?: string[] }): Promise<APIKey | null> {
    const index = this.config.api_keys.findIndex(k => k.id === id);
    if (index === -1) {
      return null;
    }

    const apiKey = this.config.api_keys[index];
    
    if (updates.name !== undefined) {
      apiKey.name = updates.name;
    }
    if (updates.serverIds !== undefined) {
      apiKey.serverIds = updates.serverIds;
    }
    
    await this.save(this.config);
    logger.info(`Updated API key: ${apiKey.name} (ID: ${apiKey.id})`);
    return apiKey;
  }

  private generateAPIKey(): string {
    const prefix = 'ha_mcp_';
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix;
    const length = 32;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }
}

export const configStore = new ConfigStore();
