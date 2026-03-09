import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

class Logger {
  private logLevel: LogLevel;
  private logDir: string;

  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.logDir = process.env.LOG_PATH || '/data/logs';
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, args?: unknown[]): string {
    const timestamp = this.getTimestamp();
    const formattedArgs = args?.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs ? ' ' + formattedArgs : ''}`;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warning', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private writeToFile(formattedMessage: string): void {
    const logFile = path.join(this.logDir, `mcp-manager-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, formattedMessage + '\n');
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, args);
      console.debug(formatted);
      this.writeToFile(formatted);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, args);
      console.info(formatted);
      this.writeToFile(formatted);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warning')) {
      const formatted = this.formatMessage('warning', message, args);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, args);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }
}

export const logger = new Logger();
