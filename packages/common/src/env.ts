import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * Walks up from the start directory to find a .env file.
 * Works for ts-node (src/) and compiled output.
 * @param startDir - The directory to start searching from
 * @returns The path to the .env file, or null if not found
 */
export function findEnvFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export interface LoadEnvOptions {
  /** The service name for logging (e.g., 'guernsey', 'fr24') */
  serviceName: string;
  /** The directory to start searching from (defaults to __dirname) */
  startDir?: string;
  /** Whether to log the env file path when found */
  logPath?: boolean;
}

/**
 * Loads environment variables from a .env file found by walking up directories.
 * @param options - Configuration options for loading the env file
 */
export function loadEnv(options: LoadEnvOptions): void {
  const { serviceName, startDir = process.cwd(), logPath = false } = options;
  const envPath = findEnvFile(startDir);

  if (envPath) {
    config({ path: envPath });
    if (logPath) {
      console.log(`[${serviceName}] Loaded env from ${envPath}`);
    }
  } else {
    console.warn(`[${serviceName}] Warning: .env file not found, relying on environment variables`);
  }
}
