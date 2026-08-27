/**
 * Utilities for detecting CLI installation method and generating appropriate next commands.
 * Combines multiple detection strategies for robust installer identification.
 */

/**
 * Supported installer types that affect command generation.
 */
export type InstallerType = 'npx' | 'brew' | 'npm-global' | 'unknown';

/**
 * Detects how the CLI was invoked by checking various environment variables and paths.
 * Uses a combination of the original isRunningUnderNpx logic and new detection methods.
 *
 * @returns The detected installer type
 */
export function detectInstaller(): InstallerType {
  // Original detection logic from isRunningUnderNpx - check npm environment variables
  const npmExecPath = process.env.npm_execpath || '';
  const npmLifecycleScript = process.env.npm_lifecycle_script || '';

  // Primary npx detection using original logic
  if (
    (npmExecPath && npmExecPath.includes('npx')) ||
    process.execPath.includes('npx') ||
    (npmLifecycleScript && npmLifecycleScript.includes('npx'))
  ) {
    return 'npx';
  }

  // Additional detection methods
  const prefix = process.env.npm_config_prefix || '';
  const ua = process.env.npm_config_user_agent || '';
  const exec = process.execPath || '';

  // Homebrew detection (works on macOS and Linux)
  if (
    /Homebrew[\/\\]Cellar/i.test(prefix) ||
    /Homebrew[\/\\]Cellar/i.test(exec) ||
    /[\/\\]Homebrew[\/\\]/i.test(prefix) ||
    /[\/\\]Homebrew[\/\\]/i.test(exec)
  ) {
    return 'brew';
  }

  // User agent fallback for npx (useful for testing)
  // npm_config_user_agent='npx/...' node dist/src/main.js init
  if (/\bnpx\/\d+/i.test(ua)) {
    return 'npx';
  }

  // npm global installation
  if (/\bnpm\/\d+/i.test(ua)) {
    return 'npm-global';
  }

  return 'unknown';
}

/**
 * Builds the appropriate dodoguard command based on how the CLI was installed.
 * Automatically adds the correct prefix (npx, etc.) for the user's environment.
 *
 * @param subcommand - The subcommand to run (e.g., 'eval', 'redteam init', or '' for just the base command)
 * @returns The complete dodoguard command string ready to run
 *
 * @example
 * ```typescript
 * // For npx users: "npx dodoguard@latest eval"
 * // For others: "dodoguard eval"
 * const cmd = dodoguardCommand('eval');
 *
 * // For npx users: "npx dodoguard@latest"
 * // For others: "dodoguard"
 * const baseCmd = dodoguardCommand('');
 *
 * // Complex subcommands work too
 * const redteamCmd = dodoguardCommand('redteam init --plugins harmful');
 * ```
 */
export function dodoguardCommand(subcommand: string): string {
  const installer = detectInstaller();

  if (installer === 'npx') {
    return subcommand ? `npx dodoguard@latest ${subcommand}` : 'npx dodoguard@latest';
  }

  // All other installers use the same format
  return subcommand ? `dodoguard ${subcommand}` : 'dodoguard';
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use detectInstaller() instead
 */
export function isRunningUnderNpx(): boolean {
  return detectInstaller() === 'npx';
}
