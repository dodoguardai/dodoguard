/**
 * Shared logic for generating update commands based on environment
 */

export interface UpdateCommandOptions {
  selfHosted: boolean;
  isNpx: boolean;
}

export interface UpdateCommandResult {
  primary: string;
  alternative: string | null;
  commandType: 'docker' | 'npx' | 'npm';
}

export function getUpdateCommands(options: UpdateCommandOptions): UpdateCommandResult {
  const { selfHosted, isNpx } = options;

  if (selfHosted) {
    return {
      primary: 'docker pull dodoguard/dodoguard:latest',
      alternative: null,
      commandType: 'docker',
    };
  }

  return {
    primary: isNpx ? 'npx dodoguard@latest' : 'npm install -g dodoguard@latest',
    alternative: isNpx ? 'npm install -g dodoguard@latest' : 'npx dodoguard@latest',
    commandType: isNpx ? 'npx' : 'npm',
  };
}

export function getUpdateCommandLabel(isNpx: boolean, isPrimary: boolean): string {
  if (isPrimary) {
    return 'Copy Command';
  }
  return isNpx ? 'or global install' : 'or npx';
}
