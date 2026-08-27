import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getEnvString } from '../../envars';

let configDirectoryPath: string | undefined = getEnvString('DODOGUARD_CONFIG_DIR');

// Check if we're in a Node.js environment
const isNodeEnvironment =
  typeof process !== 'undefined' && process.versions && process.versions.node;

function getDefaultConfigDirectoryPath(): string {
  return path.join(os.homedir(), '.dodoguard');
}

export function getConfigDirectoryPath(createIfNotExists: boolean = false): string {
  const p = configDirectoryPath || getDefaultConfigDirectoryPath();

  // Only perform filesystem operations in Node.js environment
  if (createIfNotExists && isNodeEnvironment) {
    try {
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    } catch {
      // Silently ignore filesystem errors in browser environment
    }
  }

  return p;
}

export function setConfigDirectoryPath(newPath: string | undefined): void {
  configDirectoryPath = newPath;
}
