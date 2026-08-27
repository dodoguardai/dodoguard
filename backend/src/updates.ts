import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import semverGt from 'semver/functions/gt';
import { TERMINAL_MAX_WIDTH, VERSION } from './constants';
import { getEnvBool } from './envars';
import logger from './logger';
import { fetchWithTimeout } from './util/fetch/index';

const execAsync = promisify(exec);

export async function getLatestVersion() {
  const response = await fetchWithTimeout(
    `https://api.dodoguard.dev/api/latestVersion`, // 改为 dodoguard API 地址
    {
      headers: { 'x-dodoguard-silent': 'true' }, // 改为 dodoguard header
    },
    10000,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch package information for dodoguard`); // 改为 dodoguard
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}

export async function checkForUpdates(): Promise<boolean> {
  if (getEnvBool('DODOGUARD_DISABLE_UPDATE')) {
    // 改为 DODOGUARD_DISABLE_UPDATE
    return false;
  }

  let latestVersion: string;
  try {
    latestVersion = await getLatestVersion();
  } catch {
    return false;
  }
  if (semverGt(latestVersion, VERSION)) {
    const border = '='.repeat(TERMINAL_MAX_WIDTH);
    logger.info(
      `\n${border}
${chalk.yellow('⚠️')} The current version of dodoguard ${chalk.yellow(
        // 改为 dodoguard
        VERSION,
      )} is lower than the latest available version ${chalk.green(latestVersion)}.

Please run ${chalk.green('npx dodoguard@latest')} or ${chalk.green(
        // 改为 dodoguard
        'npm install -g dodoguard@latest',
      )} to update.
${border}\n`,
    );
    return true;
  }
  return false;
}

export async function getModelAuditLatestVersion(): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(
      'https://pypi.org/pypi/modelaudit/json',
      {
        headers: { 'x-dodoguard-silent': 'true' },
      },
      10000,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { info: { version: string } };
    return data.info.version;
  } catch {
    return null;
  }
}

export async function getModelAuditCurrentVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('pip show modelaudit');
    const versionMatch = stdout.match(/Version:\s*(\S+)/);
    return versionMatch ? versionMatch[1] : null;
  } catch {
    return null;
  }
}

export async function checkModelAuditUpdates(): Promise<boolean> {
  if (getEnvBool('DODOGUARD_DISABLE_UPDATE')) {
    // 改为 DODOGUARD_DISABLE_UPDATE
    return false;
  }

  const [currentVersion, latestVersion] = await Promise.all([
    getModelAuditCurrentVersion(),
    getModelAuditLatestVersion(),
  ]);

  if (!currentVersion || !latestVersion) {
    return false;
  }

  if (semverGt(latestVersion, currentVersion)) {
    const border = '='.repeat(TERMINAL_MAX_WIDTH);
    logger.info(
      `\n${border}
${chalk.yellow('⚠️')} The current version of modelaudit ${chalk.yellow(
        currentVersion,
      )} is lower than the latest available version ${chalk.green(latestVersion)}.

Please run ${chalk.green('pip install --upgrade modelaudit')} to update.
${border}\n`,
    );
    return true;
  }
  return false;
}
