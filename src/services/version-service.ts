import { InstallType, VersionInfo, ServerVersionInfo, MCPServerConfig } from '../types';
import { ConfigStore } from './config-store';
import { logger } from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as semver from 'semver';

const execAsync = promisify(exec);

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT_MS = 10000;

// Cache for version info to avoid frequent API calls
interface VersionCache {
  [packageKey: string]: {
    info: VersionInfo;
    timestamp: number;
  };
}

// npm registry response types
interface NpmRegistryResponse {
  'dist-tags'?: {
    latest?: string;
    [tag: string]: string | undefined;
  };
  versions?: {
    [version: string]: object;
  };
}

// PyPI registry response types
interface PyPIRegistryResponse {
  info?: {
    version?: string;
    name?: string;
  };
  releases?: {
    [version: string]: object[];
  };
}

export class VersionService {
  private cache: VersionCache = {};
  private cacheTTL = 60 * 60 * 1000; // 1 hour cache TTL
  private autoCheckInterval: NodeJS.Timeout | null = null;
  private configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
  }

  /**
   * Start automatic version checking on a schedule
   */
  startAutoCheck(intervalMs: number = 60 * 60 * 1000): void {
    if (this.autoCheckInterval) {
      this.stopAutoCheck();
    }

    logger.info(`Starting automatic version check every ${intervalMs / 60000} minutes`);
    
    // Run immediately on start
    this.checkAllServers().catch(err => {
      logger.error('Auto version check failed:', err);
    });

    this.autoCheckInterval = setInterval(() => {
      this.checkAllServers().catch(err => {
        logger.error('Auto version check failed:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop automatic version checking
   */
  stopAutoCheck(): void {
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval);
      this.autoCheckInterval = null;
      logger.info('Stopped automatic version checking');
    }
  }

  /**
   * Check versions for all configured servers
   */
  async checkAllServers(forceRefresh: boolean = false): Promise<Record<string, ServerVersionInfo>> {
    const config = await this.configStore.load();
    const results: Record<string, ServerVersionInfo> = {};

    logger.info(`Checking versions for ${config.servers.length} servers`);

    for (const server of config.servers) {
      try {
        // Skip servers without proper install info
        if (!server.install || !server.install.package || !server.install.type) {
          logger.warn(`Server ${server.id} (${server.name}) missing install configuration, skipping version check`);
          results[server.id] = {
            serverId: server.id,
            packageName: 'unknown',
            installType: 'npm',
            installedVersion: null,
            latestVersion: null,
            availableVersions: [],
            lastChecked: new Date().toISOString(),
            isOutdated: false,
            checkError: 'Server missing install configuration',
          };
          continue;
        }

        const versionInfo = await this.checkServerVersion(server, forceRefresh);
        results[server.id] = versionInfo;
        logger.info(`Version check for ${server.name} (${server.install.package}): installed=${versionInfo.installedVersion || 'null'}, latest=${versionInfo.latestVersion || 'null'}${versionInfo.checkError ? `, error: ${versionInfo.checkError}` : ''}`);
      } catch (error) {
        logger.error(`Failed to check version for server ${server.id}:`, error);
        results[server.id] = {
          serverId: server.id,
          packageName: server.install?.package || 'unknown',
          installType: server.install?.type || 'npm',
          installedVersion: server.install?.installedVersion || null,
          latestVersion: null,
          availableVersions: [],
          lastChecked: new Date().toISOString(),
          isOutdated: false,
          checkError: error instanceof Error ? error.message : String(error),
        };
      }
    }

    logger.info(`Version check complete for ${Object.keys(results).length} servers`);
    return results;
  }

  /**
   * Check version for a single server
   */
  async checkServerVersion(server: MCPServerConfig, forceRefresh: boolean = false): Promise<ServerVersionInfo> {
    // Validate install config exists
    if (!server.install || !server.install.package || !server.install.type) {
      logger.warn(`Server ${server.id} missing install configuration`);
      return {
        serverId: server.id,
        packageName: 'unknown',
        installType: 'npm',
        installedVersion: null,
        latestVersion: null,
        availableVersions: [],
        lastChecked: new Date().toISOString(),
        isOutdated: false,
        checkError: 'Server missing install configuration',
      };
    }

    const cacheKey = `${server.install.type}:${server.install.package}`;
    const cached = this.cache[cacheKey];
    
    // Return cached if valid and not forcing refresh
    if (!forceRefresh && cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return {
        ...cached.info,
        serverId: server.id,
        packageName: server.install.package,
        installType: server.install.type,
        // Update installed version from server config
        installedVersion: server.install.installedVersion || cached.info.installedVersion,
        isOutdated: this.isVersionOutdated(
          server.install.installedVersion || cached.info.installedVersion,
          cached.info.latestVersion
        ),
      };
    }

    logger.debug(`Checking version for ${server.install.package} (${server.install.type})`);

    let versionInfo: VersionInfo;

    try {
      if (server.install.type === 'npm') {
        versionInfo = await this.getNpmVersionInfo(server.install.package);
      } else if (server.install.type === 'uvx') {
        versionInfo = await this.getPyPIVersionInfo(server.install.package);
      } else {
        throw new Error(`Unknown install type: ${server.install.type}`);
      }

      // Try to detect installed version if not stored in config
      if (!server.install.installedVersion) {
        const installed = await this.detectInstalledVersion(server);
        if (installed) {
          versionInfo.installedVersion = installed;
          // Update config with detected version
          await this.configStore.updateServerInstalledVersion(server.id, installed);
        }
      } else {
        versionInfo.installedVersion = server.install.installedVersion;
      }

      // Determine if outdated
      versionInfo.isOutdated = this.isVersionOutdated(
        versionInfo.installedVersion,
        versionInfo.latestVersion
      );

      // Cache the result
      this.cache[cacheKey] = {
        info: versionInfo,
        timestamp: Date.now(),
      };

    } catch (error) {
      logger.error(`Failed to get version info for ${server.install.package}:`, error);
      versionInfo = {
        installedVersion: server.install.installedVersion || null,
        latestVersion: null,
        availableVersions: [],
        lastChecked: new Date().toISOString(),
        isOutdated: false,
        checkError: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      ...versionInfo,
      serverId: server.id,
      packageName: server.install.package,
      installType: server.install.type,
    };
  }

  /**
   * Get version info from npm registry
   */
  private async getNpmVersionInfo(packageName: string): Promise<VersionInfo> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`npm registry returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as NpmRegistryResponse;
      const versions = Object.keys(data.versions || {});
      
      // Sort versions in descending order (newest first)
      const sortedVersions = versions
        .filter(v => semver.valid(v))
        .sort((a, b) => semver.rcompare(a, b));

      return {
        installedVersion: null, // Will be filled by caller
        latestVersion: data['dist-tags']?.latest || sortedVersions[0] || null,
        availableVersions: sortedVersions.slice(0, 50), // Limit to 50 versions
        lastChecked: new Date().toISOString(),
        isOutdated: false, // Will be calculated by caller
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Timeout fetching npm package info for ${packageName} (>${FETCH_TIMEOUT_MS}ms)`);
        throw new Error(`Request timeout fetching npm package info for ${packageName}`);
      }
      logger.error(`Failed to fetch npm package info for ${packageName}:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get version info from PyPI
   */
  private async getPyPIVersionInfo(packageName: string): Promise<VersionInfo> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`, {
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`PyPI returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as PyPIRegistryResponse;
      const versions = Object.keys(data.releases || {});
      
      // Sort versions in descending order (newest first)
      // PyPI versions may not all be semver-compliant, so we do a best-effort sort
      const sortedVersions = versions
        .filter(v => v && !v.includes('dev') && !v.includes('rc') && !v.includes('alpha') && !v.includes('beta'))
        .sort((a, b) => {
          // Try semver comparison first
          const semverA = semver.valid(semver.coerce(a));
          const semverB = semver.valid(semver.coerce(b));
          if (semverA && semverB) {
            return semver.rcompare(semverA, semverB);
          }
          // Fallback to string comparison
          return b.localeCompare(a, undefined, { numeric: true });
        });

      return {
        installedVersion: null, // Will be filled by caller
        latestVersion: data.info?.version || sortedVersions[0] || null,
        availableVersions: sortedVersions.slice(0, 50), // Limit to 50 versions
        lastChecked: new Date().toISOString(),
        isOutdated: false, // Will be calculated by caller
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Timeout fetching PyPI package info for ${packageName} (>${FETCH_TIMEOUT_MS}ms)`);
        throw new Error(`Request timeout fetching PyPI package info for ${packageName}`);
      }
      logger.error(`Failed to fetch PyPI package info for ${packageName}:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Try to detect the installed version of a package
   */
  private async detectInstalledVersion(server: MCPServerConfig): Promise<string | null> {
    try {
      if (server.install.type === 'npm') {
        return await this.detectNpmInstalledVersion(server.install.package);
      } else if (server.install.type === 'uvx') {
        return await this.detectUvxInstalledVersion(server.install.package);
      }
    } catch (error) {
      logger.debug(`Could not detect installed version for ${server.install.package}:`, error);
    }
    return null;
  }

  /**
   * Detect installed npm package version
   */
  private async detectNpmInstalledVersion(packageName: string): Promise<string | null> {
    try {
      // Try to get version from global npm list
      const { stdout } = await execAsync(`npm list -g ${packageName} --depth=0 --json 2>/dev/null || true`);
      if (stdout) {
        const data = JSON.parse(stdout);
        if (data.dependencies && data.dependencies[packageName]) {
          return data.dependencies[packageName].version;
        }
      }
    } catch (error) {
      // npm list might fail if package not installed globally
      logger.debug(`npm list failed for ${packageName}, trying npx cache`);
    }

    // Try to check npx cache - this is more complex and may not be reliable
    // For now, we'll return null and rely on the version being recorded when the server is started
    return null;
  }

  /**
   * Detect installed uvx/Python package version
   */
  private async detectUvxInstalledVersion(packageName: string): Promise<string | null> {
    try {
      // Try using uv pip show
      const { stdout } = await execAsync(`uv pip show ${packageName} 2>/dev/null || true`);
      if (stdout) {
        const versionMatch = stdout.match(/Version:\s*(\S+)/i);
        if (versionMatch) {
          return versionMatch[1];
        }
      }
    } catch (error) {
      logger.debug(`uv pip show failed for ${packageName}`);
    }

    try {
      // Fallback to pip show
      const { stdout } = await execAsync(`pip show ${packageName} 2>/dev/null || true`);
      if (stdout) {
        const versionMatch = stdout.match(/Version:\s*(\S+)/i);
        if (versionMatch) {
          return versionMatch[1];
        }
      }
    } catch (error) {
      logger.debug(`pip show failed for ${packageName}`);
    }

    return null;
  }

  /**
   * Compare versions to determine if installed version is outdated
   */
  private isVersionOutdated(installed: string | null, latest: string | null): boolean {
    if (!installed || !latest) {
      return false;
    }

    try {
      // Clean versions for comparison
      const cleanInstalled = semver.valid(semver.coerce(installed));
      const cleanLatest = semver.valid(semver.coerce(latest));

      if (cleanInstalled && cleanLatest) {
        return semver.lt(cleanInstalled, cleanLatest);
      }

      // Fallback to string comparison
      return installed !== latest;
    } catch {
      return installed !== latest;
    }
  }

  /**
   * Get version info for a single server by ID
   */
  async getServerVersionInfo(serverId: string, forceRefresh: boolean = false): Promise<ServerVersionInfo | null> {
    const server = this.configStore.getServer(serverId);
    if (!server) {
      return null;
    }
    return this.checkServerVersion(server, forceRefresh);
  }

  /**
   * Clear the version cache
   */
  clearCache(): void {
    this.cache = {};
    logger.debug('Version cache cleared');
  }

  /**
   * Get cached version info (without refreshing)
   */
  getCachedVersionInfo(packageName: string, installType: InstallType): VersionInfo | null {
    const cacheKey = `${installType}:${packageName}`;
    const cached = this.cache[cacheKey];
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.info;
    }
    
    return null;
  }
}
