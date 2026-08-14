import * as fs from 'fs';
import * as path from 'path';

/**
 * The addon version, read from package.json at runtime.
 *
 * This was previously hardcoded as '1.0.0' in several places, which meant the
 * API reported 1.0.0 no matter which build was actually running - so there was
 * no way to tell whether an update had really taken effect. Keep the version in
 * package.json in step with the one in config.yaml.
 */
function readVersion(): string {
  // dist/version.js -> /app/package.json, src/version.ts -> ./package.json
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  try {
    const contents = fs.readFileSync(packageJsonPath, 'utf-8');
    return (JSON.parse(contents) as { version?: string }).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export const ADDON_VERSION = readVersion();
