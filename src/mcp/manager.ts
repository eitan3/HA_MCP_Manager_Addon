import { ChildProcess, spawn } from 'child_process';
import { MCPServerConfig, MCPServerStatus, JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '../types';
import { ConfigStore } from '../services/config-store';
import { logger } from '../services/logger';
import * as readline from 'readline';

// SSE Connection interface for sending events to connected clients
export interface SSEConnection {
  id: string;
  send: (event: string, data: any) => void;
  close: () => void;
}

interface PendingRequest {
  resolve: (response: JSONRPCResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  originalId: number | string;  // The client's original request ID
}

interface RunningServer {
  process: ChildProcess | null;
  status: MCPServerStatus;
  logs: string[];
  sseConnections: Map<string, SSEConnection>;
  pendingRequests: Map<number, PendingRequest>;  // Keyed by internal request ID
  nextRequestId: number;  // Counter for generating unique internal IDs
  stdoutBuffer: string;
}

export class MCPManager {
  private runningServers: Map<string, RunningServer> = new Map();
  private configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
  }

  async startServer(serverId: string): Promise<void> {
    const server = this.configStore.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (this.runningServers.has(serverId)) {
      logger.warn(`Server ${serverId} is already running`);
      return;
    }

    logger.info(`Starting MCP server: ${server.name} (ID: ${serverId})`);

    const runningServer: RunningServer = {
      process: null,
      status: {
        running: false,
        startedAt: new Date().toISOString(),
      },
      logs: [],
      sseConnections: new Map(),
      pendingRequests: new Map(),
      nextRequestId: 1,  // Start from 1 to avoid confusion with id=0
      stdoutBuffer: '',
    };

    this.runningServers.set(serverId, runningServer);

    try {
      if (server.transport === 'stdio') {
        await this.startStdioServer(server, runningServer);
      } else if (server.transport === 'sse') {
        await this.startSSEServer(server, runningServer);
      }

      runningServer.status.running = true;
      runningServer.status.lastActivity = new Date().toISOString();
      logger.info(`MCP server started successfully: ${server.name}`);
    } catch (error) {
      runningServer.status.error = String(error);
      this.addLog(runningServer, `ERROR: ${error}`);
      this.runningServers.delete(serverId);
      throw error;
    }
  }

  private async startStdioServer(server: MCPServerConfig, runningServer: RunningServer): Promise<void> {
    let command: string;
    let args: string[] = [];

    if (server.install.type === 'npm') {
      command = 'npx';
      args = ['-y', server.install.package, ...(server.args || [])];
    } else if (server.install.type === 'uvx') {
      command = 'uvx';
      args = [server.install.package, ...(server.args || [])];
    } else {
      throw new Error(`Unknown install type: ${server.install.type}`);
    }

    this.addLog(runningServer, `Starting: ${command} ${args.join(' ')}`);

    const env = {
      ...process.env,
      ...server.env,
    };

    this.addLog(runningServer, `Environment: ${JSON.stringify(server.env || {})}`);

    const childProcess = spawn(command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    runningServer.process = childProcess;

    // Handle stdout - parse JSON-RPC messages and forward to SSE clients
    childProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      runningServer.stdoutBuffer += output;
      runningServer.status.lastActivity = new Date().toISOString();
      
      // Try to parse complete JSON-RPC messages from buffer
      this.processStdoutBuffer(server.id, runningServer);
    });

    // Handle stderr - log errors prominently
    childProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.addLog(runningServer, `STDERR: ${output.trim()}`);
      // Log stderr as error level so it shows in addon logs
      logger.error(`[${server.id}] STDERR: ${output.trim()}`);
    });

    childProcess.on('error', (error: Error) => {
      this.addLog(runningServer, `PROCESS ERROR: ${error}`);
      runningServer.status.error = String(error);
      logger.error(`[${server.id}] Process error:`, error);
    });

    childProcess.on('exit', (code: number | null, signal: string | null) => {
      this.addLog(runningServer, `PROCESS EXITED: code=${code}, signal=${signal}`);
      logger.info(`[${server.id}] Process exited: code=${code}, signal=${signal}`);
      runningServer.status.running = false;
      if (code !== 0) {
        runningServer.status.error = `Process exited with code ${code}`;
        logger.error(`[${server.id}] Process exited with error code ${code}`);
      }
      
      // Reject all pending requests
      for (const [id, pending] of runningServer.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Server process exited'));
      }
      runningServer.pendingRequests.clear();

      // Close all SSE connections
      for (const conn of runningServer.sseConnections.values()) {
        conn.close();
      }
      runningServer.sseConnections.clear();
      
      // Remove from running servers map when process exits with error
      // This allows the server to be restarted
      if (code !== 0 || signal) {
        this.runningServers.delete(server.id);
        logger.info(`[${server.id}] Removed from running servers map due to exit`);
      }
    });

    // Wait for process to be ready
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for server to start'));
      }, 30000);

      childProcess.on('spawn', () => {
        clearTimeout(timeoutId);
        this.addLog(runningServer, 'Process spawned successfully');
        resolve();
      });

      childProcess.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Process the stdout buffer to extract complete JSON-RPC messages.
   * Messages are newline-delimited JSON.
   */
  private processStdoutBuffer(serverId: string, runningServer: RunningServer): void {
    const lines = runningServer.stdoutBuffer.split('\n');
    
    // Keep the last incomplete line in the buffer
    runningServer.stdoutBuffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const message = JSON.parse(trimmed);
        this.addLog(runningServer, `RECV: ${trimmed}`);
        logger.debug(`[${serverId}] Received:`, message);
        
        // Check if this is a response to a pending request
        if ('id' in message && message.id !== undefined) {
          const pending = runningServer.pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timeout);
            runningServer.pendingRequests.delete(message.id);
            pending.resolve(message as JSONRPCResponse);
            continue;
          }
        }
        
        // Forward notifications and other messages to SSE clients
        for (const conn of runningServer.sseConnections.values()) {
          conn.send('message', message);
        }
        
      } catch (e) {
        // Not valid JSON, might be debug output
        this.addLog(runningServer, `STDOUT (non-JSON): ${trimmed}`);
        logger.debug(`[${serverId}] Non-JSON stdout: ${trimmed}`);
      }
    }
  }

  private async startSSEServer(server: MCPServerConfig, runningServer: RunningServer): Promise<void> {
    // For SSE transport servers, we just track them - they manage their own process
    // The addon will proxy connections to them
    this.addLog(runningServer, `SSE server configured on internal port ${server.internal_port || 8080}`);
    
    // For now, we just mark it as running - actual SSE proxy is handled in the SSE router
    runningServer.process = null;
  }

  async stopServer(serverId: string): Promise<void> {
    const runningServer = this.runningServers.get(serverId);
    if (!runningServer) {
      logger.warn(`Server ${serverId} is not running`);
      return;
    }

    logger.info(`Stopping MCP server: ${serverId}`);

    // Close all SSE connections
    for (const conn of runningServer.sseConnections.values()) {
      conn.close();
    }
    runningServer.sseConnections.clear();

    // Reject all pending requests
    for (const [id, pending] of runningServer.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server stopped'));
    }
    runningServer.pendingRequests.clear();

    // Kill the process
    if (runningServer.process) {
      runningServer.process.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (!runningServer.process) {
          resolve();
          return;
        }

        const timeoutId = setTimeout(() => {
          runningServer.process?.kill('SIGKILL');
          resolve();
        }, 5000);

        runningServer.process.on('exit', () => {
          clearTimeout(timeoutId);
          resolve();
        });
      });
    }

    runningServer.status.running = false;
    this.runningServers.delete(serverId);
    logger.info(`MCP server stopped: ${serverId}`);
  }

  async installServer(serverId: string): Promise<void> {
    const server = this.configStore.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    logger.info(`Installing package for server: ${server.name}`);

    // For npm packages, npx handles installation
    // For uvx packages, uv handles installation
    // Installation happens automatically when starting

    const runningServer = this.runningServers.get(serverId);
    if (runningServer) {
      this.addLog(runningServer, `Package will be installed on first start: ${server.install.package}`);
    } else {
      logger.info(`Package will be installed on first start: ${server.install.package}`);
    }
  }

  getServerStatus(serverId: string): MCPServerStatus | null {
    const runningServer = this.runningServers.get(serverId);
    if (!runningServer) {
      const server = this.configStore.getServer(serverId);
      if (server) {
        return {
          running: false,
        };
      }
      return null;
    }
    return runningServer.status;
  }

  getServerLogs(serverId: string): string[] {
    const runningServer = this.runningServers.get(serverId);
    if (!runningServer) {
      return [];
    }
    return runningServer.logs;
  }

  private addLog(runningServer: RunningServer | { logs: string[] }, message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    if ('logs' in runningServer) {
      runningServer.logs.push(logEntry);
      // Keep only last 1000 log entries
      if (runningServer.logs.length > 1000) {
        runningServer.logs.shift();
      }
    }
    
    logger.debug(message);
  }

  /**
   * Send a JSON-RPC message to the MCP server process and wait for response.
   * Uses internal request IDs to handle concurrent requests with the same client ID.
   */
  async sendMessage(serverId: string, message: JSONRPCRequest | JSONRPCNotification): Promise<JSONRPCResponse | void> {
    const runningServer = this.runningServers.get(serverId);
    
    if (!runningServer) {
      const error = new Error(`Server ${serverId} is not in running servers map`);
      logger.error(error.message);
      throw error;
    }
    
    if (!runningServer.process) {
      const error = new Error(`Server ${serverId} has no process (process is null)`);
      logger.error(error.message);
      throw error;
    }

    if (!runningServer.process.stdin) {
      const error = new Error(`Server ${serverId} has no stdin`);
      logger.error(error.message);
      throw error;
    }
    
    if (!runningServer.process.stdin.writable) {
      const error = new Error(`Server ${serverId} stdin is not writable (process may have exited)`);
      logger.error(error.message);
      throw error;
    }

    // For notifications (no id), just write and return
    if (!('id' in message) || message.id === undefined) {
      const messageStr = JSON.stringify(message) + '\n';
      this.addLog(runningServer, `SEND (notification): ${messageStr.trim()}`);
      logger.info(`[${serverId}] Sending notification to stdin: ${messageStr.trim()}`);
      runningServer.process.stdin.write(messageStr);
      return;
    }

    // For requests, generate a unique internal ID to avoid conflicts
    const originalId = message.id;
    const internalId = runningServer.nextRequestId++;
    
    // Create a modified message with the internal ID
    const modifiedMessage = { ...message, id: internalId };
    const messageStr = JSON.stringify(modifiedMessage) + '\n';
    
    this.addLog(runningServer, `SEND: ${messageStr.trim()} (client id=${originalId}, internal id=${internalId})`);
    logger.info(`[${serverId}] Sending to stdin: ${messageStr.trim()} (client id=${originalId}, internal id=${internalId})`);

    // Set up a promise to wait for response
    return new Promise<JSONRPCResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        runningServer.pendingRequests.delete(internalId);
        const error = new Error(`Timeout waiting for response from MCP server (30s) for request client_id=${originalId}, internal_id=${internalId}`);
        logger.error(error.message);
        reject(error);
      }, 30000);

      runningServer.pendingRequests.set(internalId, {
        resolve: (response: JSONRPCResponse) => {
          // Restore the original client ID in the response
          const clientResponse = { ...response, id: originalId };
          resolve(clientResponse);
        },
        reject,
        timeout,
        originalId,
      });

      // Write to stdin with error handling
      const writeSuccess = runningServer.process!.stdin!.write(messageStr, (err: Error | null | undefined) => {
        if (err) {
          logger.error(`Error writing to stdin: ${err.message}`);
          clearTimeout(timeout);
          runningServer.pendingRequests.delete(internalId);
          reject(err);
        }
      });
      
      if (!writeSuccess) {
        logger.warn(`stdin write returned false (buffer full) for server ${serverId}`);
      }
    });
  }

  /**
   * Add an SSE connection for receiving messages from the MCP server.
   */
  addSSEConnection(serverId: string, connection: SSEConnection): void {
    const runningServer = this.runningServers.get(serverId);
    if (!runningServer) {
      throw new Error(`Server ${serverId} is not running`);
    }
    
    runningServer.sseConnections.set(connection.id, connection);
    logger.debug(`SSE connection ${connection.id} added to server ${serverId}`);
  }

  /**
   * Remove an SSE connection.
   */
  removeSSEConnection(serverId: string, connectionId: string): void {
    const runningServer = this.runningServers.get(serverId);
    if (runningServer) {
      runningServer.sseConnections.delete(connectionId);
      logger.debug(`SSE connection ${connectionId} removed from server ${serverId}`);
    }
  }

  /**
   * Get running server info (for SSE router to check if server is running).
   */
  getRunningServer(serverId: string): RunningServer | undefined {
    return this.runningServers.get(serverId);
  }

  /**
   * Start all enabled servers.
   */
  async startAllEnabled(): Promise<void> {
    const config = await this.configStore.load();
    
    for (const server of config.servers) {
      if (server.enabled) {
        try {
          await this.startServer(server.id);
        } catch (error) {
          logger.error(`Failed to start server ${server.name}:`, error);
        }
      }
    }
  }

  /**
   * Stop all running servers.
   */
  async stopAll(): Promise<void> {
    const serverIds = Array.from(this.runningServers.keys());
    
    for (const serverId of serverIds) {
      try {
        await this.stopServer(serverId);
      } catch (error) {
        logger.error(`Failed to stop server ${serverId}:`, error);
      }
    }
  }
}
