/**
 * Ultimate System CLI Configuration
 * 
 * Supports configuration via:
 * 1. Environment variables (highest priority)
 * 2. .env file in current directory
 * 3. ~/.ultimate/config.json (user-level)
 * 4. .ultimate.json in project directory
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const configPaths = [
  join(process.cwd(), '.ultimate.json'),
  join(process.cwd(), '.ultimate.config.json'),
  join(homedir(), '.ultimate', 'config.json'),
  join(__dirname, '.ultimate.json'),
];

export function loadConfig() {
  const defaults = {
    apiBase: process.env.ULTIMATE_SYSTEM_API_BASE || 'http://localhost:4100',
    outputFormat: 'color',
    refreshInterval: 3000,
    pageSize: 20,
    theme: 'auto',
  };

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        return { ...defaults, ...config };
      } catch {
        console.warn(`Warning: Failed to load config from ${configPath}`);
      }
    }
  }

  return defaults;
}

export const config = loadConfig();
